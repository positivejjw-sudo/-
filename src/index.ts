import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadCompanies, requireEnv } from "./config.js";
import { generateCompanyInsight } from "./newsInsights.js";
import { renderHtml, renderSubject } from "./emailTemplate.js";
import { sendMail, verifyMailer } from "./mailer.js";
import type { CompanyConfig } from "./types.js";

interface CliOptions {
  configPath: string;
  dryRun: boolean;
  companyFilter?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { configPath: "config/companies.json", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
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
  --config <경로>     계열사 설정 파일 (기본: config/companies.json)
  --company <이름>    특정 계열사만 처리 (이름 부분일치)
  --dry-run           메일을 발송하지 않고 ./out/ 에 HTML 미리보기만 저장
  -h, --help          도움말

예시:
  npm run dev -- --dry-run
  npm run dev -- --company 범한산업
  npm run dev -- --config config/companies.json
`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  // Claude API 키는 항상 필요
  requireEnv("ANTHROPIC_API_KEY");

  const { groupName, companies } = loadCompanies(opts.configPath);

  let targets: CompanyConfig[] = companies;
  if (opts.companyFilter) {
    targets = companies.filter((c) => c.name.includes(opts.companyFilter!));
    if (targets.length === 0) {
      throw new Error(`'${opts.companyFilter}' 와 일치하는 계열사가 설정에 없습니다.`);
    }
  }

  // 실제 발송 모드일 때만 SMTP 사전 검증
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
      console.log("  🔎 웹 검색으로 AI 뉴스 수집 및 분석 중...");
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
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`\n치명적 오류: ${(e as Error).message}`);
  process.exit(1);
});
