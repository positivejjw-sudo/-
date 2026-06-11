import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SolutionConfig, CompanyConfig } from "./types.js";

/** 환경변수 필수값을 읽고, 없으면 명확한 에러를 던진다. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `환경변수 ${name} 가(이) 설정되지 않았습니다. .env 파일을 확인하세요 (.env.example 참고).`,
    );
  }
  return value.trim();
}

/** companies.json 설정 파일을 읽고 검증한다. */
export function loadCompanies(configPath: string): SolutionConfig {
  const absPath = resolve(configPath);
  let raw: string;
  try {
    raw = readFileSync(absPath, "utf-8");
  } catch {
    throw new Error(
      `설정 파일을 찾을 수 없습니다: ${absPath}\n` +
        `config/companies.example.json 을 복사해 config/companies.json 을 만드세요.`,
    );
  }

  let parsed: SolutionConfig;
  try {
    parsed = JSON.parse(raw) as SolutionConfig;
  } catch (e) {
    throw new Error(`설정 파일 JSON 파싱 실패 (${absPath}): ${(e as Error).message}`);
  }

  if (!parsed.groupName) throw new Error("설정 파일에 groupName 이 필요합니다.");
  if (!Array.isArray(parsed.companies) || parsed.companies.length === 0) {
    throw new Error("설정 파일에 companies 배열이 1개 이상 필요합니다.");
  }

  parsed.companies.forEach((c, i) => validateCompany(c, i));
  return parsed;
}

function validateCompany(c: CompanyConfig, index: number): void {
  const where = `companies[${index}]`;
  if (!c.name) throw new Error(`${where}.name 이 필요합니다.`);
  if (!c.industry) throw new Error(`${where}.industry (영위 업종) 이 필요합니다.`);
  if (!Array.isArray(c.recipients) || c.recipients.length === 0) {
    throw new Error(`${where}.recipients (수신자) 가 1명 이상 필요합니다.`);
  }
}
