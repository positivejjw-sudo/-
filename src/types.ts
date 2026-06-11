/** 계열사 1곳의 설정 (config/companies.json) */
export interface CompanyConfig {
  /** 계열사명 (예: 범한산업) */
  name: string;
  /** 영위 업종 설명 — AI 뉴스 수집의 핵심 입력값 */
  industry: string;
  /** 검색 정밀도를 높이는 보조 키워드 (선택) */
  keywords?: string[];
  /** 메일 수신자 (TO) */
  recipients: string[];
  /** 메일 참조자 (CC, 선택) */
  cc?: string[];
}

/** 솔루션 전체 설정 파일 형태 */
export interface SolutionConfig {
  /** 그룹명 (예: 범한그룹) */
  groupName: string;
  companies: CompanyConfig[];
}

/** AI 뉴스 1건 요약 */
export interface NewsItem {
  title: string;
  /** 한국어 3~4문장 요약 */
  summary: string;
  /** 출처 매체/기관명 */
  source?: string;
  /** 원문 URL */
  url?: string;
  /** 보도 시점 (예: 2026-05) */
  date?: string;
}

/** Value Chain 단계별 Operational Excellence 제언 */
export interface OpExRecommendation {
  /** 영업 ~ 출고 중 해당 단계 (예: 영업, 설계, 구매, 생산, 품질, 물류/출고) */
  stage: string;
  /** 구체적 제언 내용 */
  recommendation: string;
  /** 기대 효과 (원가절감 / 실패비용 최소화 / 생산성 향상 등) */
  expectedImpact: string;
}

/** 계열사 1곳에 대한 LLM 생성 결과 */
export interface CompanyInsight {
  company: CompanyConfig;
  /** 업종 내 AI 동향 한 줄 헤드라인 */
  headline: string;
  newsSummary: NewsItem[];
  /** 임직원에게 줄 수 있는 인사이트 */
  insights: string[];
  /** Operational Excellence 제언 */
  operationalExcellence: OpExRecommendation[];
  /** 생성 시각 (ISO) */
  generatedAt: string;
}
