import Anthropic from "@anthropic-ai/sdk";
import type { CompanyConfig, CompanyInsight } from "./types.js";

const MODEL = process.env.CLAUDE_MODEL?.trim() || "claude-opus-4-8";

/** 서버사이드 웹 검색 루프의 최대 재개 횟수 (pause_turn 대비) */
const MAX_CONTINUATIONS = 6;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic(); // ANTHROPIC_API_KEY 환경변수 사용
  return client;
}

function buildPrompt(company: CompanyConfig, groupName: string): string {
  const kw = company.keywords?.length
    ? `보조 키워드: ${company.keywords.join(", ")}`
    : "";
  const today = new Date().toISOString().slice(0, 10);

  return `당신은 ${groupName}의 AI 전략 자문역입니다. 계열사 "${company.name}"의 임직원에게
전달할 "업종별 AI 동향 브리핑"을 작성합니다.

[계열사 정보]
- 계열사명: ${company.name}
- 영위 업종: ${company.industry}
${kw ? "- " + kw : ""}
- 오늘 날짜: ${today}

[작업]
1) web_search 도구로 위 업종과 관련된 AI 소식을 **폭넓게** 검색하세요. 다양한 검색어
   (한국어/영어)를 사용해 충분히 많은 후보를 모읍니다.
   - 대상: AI 도입 사례, 신기술·신제품, 규제/정책, 투자·M&A, 경쟁사·선도기업 동향 등.
   - 신선도: 가급적 **최근 7~30일** 이내 소식을 우선하되, 최근 며칠간 특히 화제가 된
     이슈가 있으면 반드시 포함합니다.

2) 모은 후보 중에서 이 업종·계열사에 **가장 의미 있고 가장 핫한(화제성·영향력이 큰)**
   뉴스만 골라 **중요도 순으로 정렬**해 상위 3~5건만 선별합니다. 단순 최신순이 아니라
   아래 기준으로 우선순위를 매깁니다.
   - 화제성: 업계에서 얼마나 널리 보도·논의되는가 (여러 매체가 다루는가).
   - 영향도: 이 업종의 비즈니스·경쟁구도·원가/매출에 실질적 파급이 큰가.
   - 실행 시사점: 임직원이 업무에 바로 적용·대응할 여지가 있는가.
   - 신뢰도: 출처가 신뢰할 만한가 (추측성·중복·홍보성 기사는 제외).
   각 뉴스에는 **whyItMatters(왜 중요/핫한가)** 와 **importance(1~5 중요도)** 를 채웁니다.

3) 한국어로 다음을 작성합니다.
   - newsSummary: 위에서 선별·정렬한 핵심 뉴스 3~5건 (importance 내림차순).
     각 건은 제목/3~4문장 요약/출처/URL/시점/whyItMatters/importance.
   - insights: 이 업종의 임직원이 업무에 적용할 수 있는 실질적 인사이트 3~5개.
   - operationalExcellence: 영업 → 설계/견적 → 구매 → 생산 → 품질 → 물류/출고 에 이르는
     Value Chain 전반에서 **원가절감, 실패비용(불량·재작업·클레임) 최소화, 생산성 향상**에
     기여할 수 있는 AI 활용 제언 3~6개. 각 제언은 stage(단계)/recommendation(제언)/
     expectedImpact(기대효과)로 구성합니다.

[출력 형식 — 매우 중요]
검색과 분석을 마친 뒤, 마지막 메시지에 **오직 하나의 JSON 객체**를 아래 스키마대로
\`\`\`json 코드펜스로 감싸서 출력하세요. 코드펜스 밖에는 다른 설명을 적지 마세요.

\`\`\`json
{
  "headline": "업종 내 가장 핫한 AI 동향을 한 줄로 요약",
  "newsSummary": [
    { "title": "", "summary": "", "source": "", "url": "", "date": "YYYY-MM", "whyItMatters": "", "importance": 5 }
  ],
  "insights": ["", ""],
  "operationalExcellence": [
    { "stage": "", "recommendation": "", "expectedImpact": "" }
  ]
}
\`\`\`
newsSummary 는 importance 가 높은 순서로 정렬합니다. 모든 텍스트는 한국어로 작성합니다.`;
}

/** 응답 content 블록들에서 사람이 읽는 text 만 이어붙인다. */
function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/** 텍스트에서 첫 번째 JSON 객체를 추출/파싱한다. (코드펜스 우선) */
function parseJsonFromText(text: string): Record<string, unknown> {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced
    ? fenced[1]
    : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (!candidate) {
    throw new Error("응답에서 JSON 을 찾지 못했습니다.");
  }
  return JSON.parse(candidate.trim()) as Record<string, unknown>;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(asString).filter(Boolean) : [];
}

/**
 * 한 계열사에 대해 웹 검색으로 AI 뉴스를 수집하고, 요약·인사이트·OpEx 제언을 생성한다.
 */
export async function generateCompanyInsight(
  company: CompanyConfig,
  groupName: string,
): Promise<CompanyInsight> {
  const anthropic = getClient();

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildPrompt(company, groupName) },
  ];

  let response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    tools: [{ type: "web_search_20260209", name: "web_search" }],
    messages,
  });

  // 서버사이드 웹 검색 루프가 반복 한계에 도달하면 pause_turn → 재개
  let continuations = 0;
  while (response.stop_reason === "pause_turn" && continuations < MAX_CONTINUATIONS) {
    messages.push({ role: "assistant", content: response.content });
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      tools: [{ type: "web_search_20260209", name: "web_search" }],
      messages,
    });
    continuations++;
  }

  if (response.stop_reason === "refusal") {
    throw new Error(`모델이 요청을 거부했습니다 (계열사: ${company.name}).`);
  }

  const text = extractText(response.content);
  const json = parseJsonFromText(text);

  const newsSummary = Array.isArray(json.newsSummary)
    ? (json.newsSummary as Record<string, unknown>[])
        .map((n) => ({
          title: asString(n.title),
          summary: asString(n.summary),
          source: asString(n.source) || undefined,
          url: asString(n.url) || undefined,
          date: asString(n.date) || undefined,
          whyItMatters: asString(n.whyItMatters) || undefined,
          importance: typeof n.importance === "number" ? n.importance : undefined,
        }))
        // 중요도(핫한 정도) 내림차순 정렬 — 가장 임팩트 큰 뉴스가 위로
        .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    : [];

  const operationalExcellence = Array.isArray(json.operationalExcellence)
    ? (json.operationalExcellence as Record<string, unknown>[]).map((o) => ({
        stage: asString(o.stage),
        recommendation: asString(o.recommendation),
        expectedImpact: asString(o.expectedImpact),
      }))
    : [];

  return {
    company,
    headline: asString(json.headline) || `${company.industry} 업종 AI 동향`,
    newsSummary,
    insights: asStringArray(json.insights),
    operationalExcellence,
    generatedAt: new Date().toISOString(),
  };
}
