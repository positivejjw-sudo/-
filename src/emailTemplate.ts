import type { CompanyInsight } from "./types.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 메일 제목 */
export function renderSubject(insight: CompanyInsight, groupName: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `[${groupName} AI 인사이트] ${insight.company.name} · ${insight.company.industry} (${day})`;
}

/** 메일 본문(HTML). 이메일 클라이언트 호환을 위해 인라인 스타일 사용. */
export function renderHtml(insight: CompanyInsight, groupName: string): string {
  const { company } = insight;

  const newsHtml = insight.newsSummary
    .map((n) => {
      const meta = [n.source, n.date].filter(Boolean).join(" · ");
      const link = n.url
        ? `<div style="margin-top:4px;"><a href="${esc(n.url)}" style="color:#1a73e8;font-size:12px;">원문 보기</a></div>`
        : "";
      return `
        <li style="margin-bottom:14px;">
          <div style="font-weight:600;color:#111;">${esc(n.title)}</div>
          ${meta ? `<div style="font-size:12px;color:#888;margin:2px 0;">${esc(meta)}</div>` : ""}
          <div style="font-size:14px;color:#333;line-height:1.6;">${esc(n.summary)}</div>
          ${link}
        </li>`;
    })
    .join("");

  const insightsHtml = insight.insights
    .map((i) => `<li style="margin-bottom:8px;line-height:1.6;color:#333;">${esc(i)}</li>`)
    .join("");

  const opexHtml = insight.operationalExcellence
    .map(
      (o) => `
      <tr>
        <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;color:#0f5132;white-space:nowrap;vertical-align:top;">${esc(o.stage)}</td>
        <td style="padding:10px;border:1px solid #e5e7eb;color:#333;line-height:1.6;">${esc(o.recommendation)}</td>
        <td style="padding:10px;border:1px solid #e5e7eb;color:#555;line-height:1.6;">${esc(o.expectedImpact)}</td>
      </tr>`,
    )
    .join("");

  const day = new Date().toISOString().slice(0, 10);

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Apple SD Gothic Neo','Malgun Gothic',Arial,sans-serif;">
  <div style="max-width:680px;margin:0 auto;padding:24px;">
    <div style="background:#0f172a;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
      <div style="font-size:13px;opacity:.8;">${esc(groupName)} · AI 동향 브리핑</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px;">${esc(company.name)}</div>
      <div style="font-size:13px;opacity:.85;margin-top:2px;">${esc(company.industry)} · ${day}</div>
    </div>

    <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;border-top:none;">
      <div style="background:#eef2ff;border-left:4px solid #4f46e5;padding:12px 16px;border-radius:4px;margin-bottom:24px;color:#1e1b4b;font-size:15px;line-height:1.6;">
        ${esc(insight.headline)}
      </div>

      <h2 style="font-size:16px;color:#111;border-bottom:2px solid #0f172a;padding-bottom:6px;">📰 업종 내 AI 주요 소식</h2>
      <ul style="padding-left:18px;margin:12px 0 24px;">${newsHtml || "<li>수집된 뉴스가 없습니다.</li>"}</ul>

      <h2 style="font-size:16px;color:#111;border-bottom:2px solid #0f172a;padding-bottom:6px;">💡 임직원 인사이트</h2>
      <ul style="padding-left:18px;margin:12px 0 24px;">${insightsHtml || "<li>-</li>"}</ul>

      <h2 style="font-size:16px;color:#111;border-bottom:2px solid #0f172a;padding-bottom:6px;">⚙️ Operational Excellence 제언</h2>
      <div style="font-size:12px;color:#888;margin:6px 0 10px;">영업 → 설계/견적 → 구매 → 생산 → 품질 → 물류/출고 Value Chain 기준</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:8px 10px;border:1px solid #e5e7eb;text-align:left;color:#0f172a;">단계</th>
            <th style="padding:8px 10px;border:1px solid #e5e7eb;text-align:left;color:#0f172a;">제언</th>
            <th style="padding:8px 10px;border:1px solid #e5e7eb;text-align:left;color:#0f172a;">기대효과</th>
          </tr>
        </thead>
        <tbody>${opexHtml || "<tr><td colspan=\"3\" style=\"padding:10px;border:1px solid #e5e7eb;\">-</td></tr>"}</tbody>
      </table>

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#aaa;line-height:1.6;">
        본 메일은 ${esc(groupName)} AI 인사이트 솔루션이 Claude(웹 검색 기반)로 자동 생성했습니다.<br>
        뉴스 요약 및 제언은 참고용이며, 의사결정 전 원문과 사내 검토를 거치시기 바랍니다.<br>
        생성 시각: ${esc(insight.generatedAt)}
      </div>
    </div>
  </div>
</body>
</html>`;
}
