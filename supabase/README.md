# ERP 진단 백엔드 (Supabase Edge Functions)

`/erpanalysis/` 페이지가 쓰는 서버 코드의 **원본 소스**입니다.
지금까지 함수가 Supabase 대시보드에만 있었는데, 이 리포지토리를 소스의 기준으로 삼습니다.

| 함수 | 역할 | 핵심 |
|---|---|---|
| `erp-analyze` | 진단 제출 저장 + AI 분석 + 리포트 조회 + 어드민 목록 | **Claude Sonnet 5 (`claude-sonnet-5`)** — 비용·속도 최적화 |
| `erp-chat` | 고객 ↔ 관리자 실시간 채팅 + Slack 알림 + 안 읽음 뱃지 | 리드 링크가 곧 고객 접근 키 |

## 1회 준비

```bash
supabase link --project-ref joycuxdxlqhztyomnimh

# 테이블 (이미 있으면 그대로 통과 — IF NOT EXISTS)
supabase db push          # 또는 SQL Editor에서 migrations/20260714000000_erp_tables.sql 실행

# 시크릿
supabase secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  ERP_ADMIN_TOKEN=<어드민 토큰> \
  SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...   # 선택(신규 진단·채팅 알림)
```

`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`는 Edge Function 런타임이 자동 주입합니다.

## 배포

```bash
supabase functions deploy erp-analyze --no-verify-jwt
supabase functions deploy erp-chat    --no-verify-jwt
```

`--no-verify-jwt`가 꼭 필요합니다 — 고객 페이지는 로그인 없이 호출합니다.
(권한은 함수 안에서 처리: 공개 조회는 `public_id` 소유가 곧 권한, 관리자는 `x-admin-token`.)

## 동작 확인

```bash
BASE=https://joycuxdxlqhztyomnimh.supabase.co/functions/v1

# 1) 제출 → {"id":"..."}
curl -s -X POST $BASE/erp-analyze -H 'content-type: application/json' \
  -d '{"answers":{"company":"테스트","contact":"010-0000-0000"},"rule":{"tier":"STANDARD","lo":1300,"hi":1700,"opt":1550},"aiPayload":{"industry":"제조","pricing":{"opt":1550}}}'

# 2) 몇 초 뒤 결과 폴링 → {"ready":true,"ai":{...}}
curl -s "$BASE/erp-analyze?public_id=<위 id>"

# 3) 채팅 왕복
curl -s -X POST $BASE/erp-chat -H 'content-type: application/json' \
  -d '{"leadId":"<위 id>","sender":"customer","body":"안녕하세요"}'
curl -s "$BASE/erp-chat?leadId=<위 id>&after=0"
```

## 주의

- **모델 변경은 `erp-analyze/index.ts`의 `MODEL` 상수 한 곳**입니다. 진단 분석은 Sonnet 5로 고정해 두었습니다 (리포트 품질 대비 비용·응답속도 최적).
- 가격(최적 제안가)은 프런트 규칙 엔진이 결정하고, AI는 **금액을 절대 바꾸지 않고 근거만 서술**합니다 — 정찰제 일관성의 핵심이므로 프롬프트의 해당 규칙을 지워선 안 됩니다.
- 기존 배포본과 테이블 구조가 다르면 (컬럼 누락 오류 등) `migrations/` SQL을 먼저 실행하세요. 기존 데이터는 건드리지 않습니다.
- 관리자 채팅 페이지(`/erpanalysis/admin/chat/`)는 PWA입니다 — 폰 브라우저로 열면 '앱으로 설치' 배너가 뜨고, 설치 후 앱처럼 실행됩니다. 앱이 꺼져 있을 때의 실시간 푸시는 `SLACK_WEBHOOK_URL`로 들어오는 Slack 알림이 담당합니다.
