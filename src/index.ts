import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadCompanies, requireEnv } from "./config.js";
import { generateCompanyInsight } from "./newsInsights.js";
import { renderHtml, renderSubject } from "./emailTemplate.js";
import { sendMail, verifyMailer } from "./mailer.js";
import { startScheduler, describeSchedule } from "./scheduler.js";
import type { CompanyConfig } from "./types.js";

export interface JobOptions {
  configPath: string;
  dryRun: boolean;
  companyFilter?: string;
}

interface CliOptions extends JobOptions {
  /** 매일 정해진 시간에 자동 발송하는 상주 모드 */
  schedule: boolean;
  /** 스케줄 모드에서 시작 직후 1회 즉시 실행 */
  runNow: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    configPath: "config/companies.json",
    dryRun: false,
    schedule: false,
    runNow: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--schedule") opts.schedule = true;
    else if (a === "--run-now") opts.runNow = true;
    else if (a === "--config") opts.configPath = argv[++i];
    else if (a === "--company") opts.companyFilter = argv[++i];
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`
범한그룹 AI 인사이트 메일 발송 솔루션

사용법:
  npm run dev -- [옵션]

옵션:
  --schedule          매일 정해진 시간에 자동 발송 (상주 모드, .env의 SEND_TIME 사용)
  --run-now           --schedule 와 함께: 시작 직후 1회 즉시 실행 후 매일 반복
  --config <경로>     계열사 설정 파일 (기본: config/companies.json)
  --company <이름>    특정 계열사만 처리 (이름 부분일치)
  --dry-run           메일을 발송하지 않고 ./out/ 에 HTML 미리보기만 저장
  -h, --help          도움말

예시:
  npm run dev -- --dry-run                  # 1회, 발송 없이 미리보기
  npm run dev -- --company 범한산업          # 1회, 해당 계열사만 발송
  npm run dev -- --schedule                 # 매일 SEND_TIME 에 자동 발송 (상주)
  npm run dev -- --schedule --run-now       # 즉시 1회 + 매일 반복

스케줄 설정(.env):
  SEND_TIME=08:00           # 매일 발송 시각 (HH:MM, 24시간제)
  SEND_TIMEZONE=Asia/Seoul  # 시간대
  SEND_CRON=0 8 * * *       # (선택) cron 식으로 직접 지정 (SEND_TIME보다 우선)
`);
}

/** 1회 실행: 계열사들에 대해 뉴스 수집→메일 생성→발송(or 미리보기 저장). */
export async function runJob(opts: JobOptions): Promise<{ ok: number; fail: number }> {
  const { groupName, companies } = loadCompanies(opts.configPath);

  let targets: CompanyConfig[] = companies;
  if (opts.companyFilter) {
    targets = companies.filter((c) => c.name.includes(opts.companyFilter!));
    if (targets.length === 0) {
      throw new Error(`'${opts.companyFilter}' 와 일치하는 계열사가 설정에 없습니다.`);
    }
  }

  if (!opts.dryRun) {
    console.log("📮 Gmail SMTP 연결 확인 중...");
    await verifyMailer();
    console.log("✅ SMTP 인증 성공\n");
  } else {
    console.log("🧪 DRY-RUN 모드: 메일을 발송하지 않고 미리보기만 생성합니다.\n");
  }

  const outDir = resolve("out");
  if (opts.dryRun) mkdirSync(outDir, { recursive: true });

  let ok = 0;
  let fail = 0;

  for (const company of targets) {
    console.log(`\n▶ [${company.name}] ${company.industry}`);
    try {
      console.log("  🔎 웹 검색으로 업종 내 가장 핫한 AI 뉴스 수집·선별 중...");
      const insight = await generateCompanyInsight(company, groupName);
      console.log(
        `  📝 뉴스 ${insight.newsSummary.length}건 · 인사이트 ${insight.insights.length}개 · OpEx 제언 ${insight.operationalExcellence.length}개`,
      );

      const subject = renderSubject(insight, groupName);
      const html = renderHtml(insight, groupName);

      if (opts.dryRun) {
        const file = resolve(outDir, `${company.name}.html`);
        writeFileSync(file, html, "utf-8");
        console.log(`  💾 미리보기 저장: ${file}`);
      } else {
        const messageId = await sendMail({
          to: company.recipients,
          cc: company.cc,
          subject,
          html,
        });
        console.log(
          `  📨 발송 완료 → TO: ${company.recipients.join(", ")}` +
            (company.cc?.length ? ` / CC: ${company.cc.join(", ")}` : "") +
            ` (id: ${messageId})`,
        );
      }
      ok++;
    } catch (e) {
      fail++;
      console.error(`  ❌ 실패: ${(e as Error).message}`);
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`완료: 성공 ${ok}건, 실패 ${fail}건`);
  return { ok, fail };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  requireEnv("ANTHROPIC_API_KEY"); // Claude API 키는 항상 필요

  const jobOpts: JobOptions = {
    configPath: opts.configPath,
    dryRun: opts.dryRun,
    companyFilter: opts.companyFilter,
  };

  if (opts.schedule) {
    // 상주(스케줄) 모드: 매일 정해진 시간에 runJob 실행
    console.log(`⏰ 스케줄 모드 시작 — ${describeSchedule()}`);
    if (opts.runNow) {
      console.log("▶ 시작 즉시 1회 실행합니다...\n");
      await runJob(jobOpts).catch((e) => console.error(`실행 오류: ${(e as Error).message}`));
    }
    startScheduler(async () => {
      const stamp = new Date().toISOString();
      console.log(`\n\n=== ⏰ 정기 발송 트리거 (${stamp}) ===`);
      try {
        await runJob(jobOpts);
      } catch (e) {
        console.error(`정기 실행 오류: ${(e as Error).message}`);
      }
    });
    console.log("프로세스를 종료하지 마세요. (Ctrl+C 로 중단)\n");
    return; // 프로세스 상주
  }

  // 1회 실행 모드
  const { fail } = await runJob(jobOpts);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`\n치명적 오류: ${(e as Error).message}`);
  process.exit(1);
});
