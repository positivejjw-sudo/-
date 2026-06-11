# 범한그룹 AI 인사이트 메일 발송 솔루션

범한그룹 각 계열사의 **영위 업종**을 입력해 두면, 해당 업종의 **최신 AI 소식을 웹 검색으로 수집·요약**하고,
임직원에게 줄 수 있는 **인사이트**와 **Operational Excellence 제언**(영업~출고 Value Chain의 원가절감·실패비용
최소화·생산성 향상)을 자동 생성하여, 계열사별 **수신자/참조자에게 메일을 발송**합니다.

- **요약·인사이트 생성:** Claude (`claude-opus-4-8`) + 웹 검색(`web_search`) 서버 도구
- **메일 발송:** Gmail SMTP (nodemailer)
- **언어/런타임:** Node.js + TypeScript

---

## 1. 동작 흐름

```
config/companies.json (계열사·업종·수신자)
        │
        ▼
  [계열사별 반복]
   ① Claude 웹 검색으로 업종 내 최신 AI 뉴스 수집
   ② 뉴스 요약 + 임직원 인사이트 + OpEx 제언(JSON) 생성
   ③ 한국어 HTML 메일 렌더링
   ④ Gmail SMTP 로 수신자(TO)/참조자(CC) 발송
```

## 2. 설치

```bash
npm install
```

## 3. 환경설정

### (1) `.env` 작성

```bash
cp .env.example .env
```

| 변수 | 설명 |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude API 키 (https://platform.claude.com) |
| `GMAIL_USER` | 보내는 Gmail 주소 |
| `GMAIL_APP_PASSWORD` | Gmail **앱 비밀번호** (로그인 비밀번호 아님) |
| `MAIL_FROM_NAME` | (선택) 발신자 표시 이름 |
| `CLAUDE_MODEL` | (선택) 기본값 `claude-opus-4-8` |

> **Gmail 앱 비밀번호 발급:** Google 계정 → 보안 → 2단계 인증 사용 설정 → "앱 비밀번호" 생성.

### (2) 계열사 설정 작성

```bash
cp config/companies.example.json config/companies.json
```

```jsonc
{
  "groupName": "범한그룹",
  "companies": [
    {
      "name": "범한산업",
      "industry": "방위산업 / 잠수함용 연료전지·특수전지 제조",  // ← AI 뉴스 수집 기준
      "keywords": ["연료전지", "방산", "잠수함"],                 // (선택) 검색 정밀도 향상
      "recipients": ["lead@beomhan.com"],                         // 수신자(TO)
      "cc": ["manager@beomhan.com"]                               // 참조자(CC, 선택)
    }
  ]
}
```

## 4. 실행

```bash
# 1) 발송 없이 미리보기만 생성 (./out/<계열사>.html) — 먼저 권장
npm run dev -- --dry-run

# 2) 특정 계열사만
npm run dev -- --company 범한산업 --dry-run

# 3) 실제 메일 발송
npm run dev

# 옵션 확인
npm run dev -- --help
```

빌드 후 실행도 가능합니다.

```bash
npm run build && npm start -- --dry-run
```

## 5. 옵션

| 옵션 | 설명 |
| --- | --- |
| `--config <경로>` | 계열사 설정 파일 경로 (기본 `config/companies.json`) |
| `--company <이름>` | 이름 부분일치로 특정 계열사만 처리 |
| `--dry-run` | 발송하지 않고 `./out/` 에 HTML 미리보기 저장 |

## 6. 파일 구조

```
src/
  index.ts          CLI 오케스트레이션 (계열사 순회·발송)
  config.ts         .env / companies.json 로드·검증
  newsInsights.ts   Claude 웹 검색 → 요약·인사이트·OpEx(JSON) 생성
  emailTemplate.ts  한국어 HTML 메일 렌더링
  mailer.ts         Gmail SMTP 발송
  types.ts          공통 타입
config/
  companies.example.json
```

## 7. 참고/주의

- `.env`, `config/companies.json`, `out/` 은 `.gitignore` 처리되어 커밋되지 않습니다.
- 웹 검색·요약 결과는 **참고용**이며, 중요한 의사결정 전 원문 확인과 사내 검토를 권장합니다.
- 발송 전 항상 `--dry-run` 으로 내용을 검수하세요.
