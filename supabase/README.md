# ERP 진단 백엔드 (Supabase Edge Functions)

`/erpanalysis/` 페이지가 쓰는 서버 코드의 **원본 소스**입니다.
지금까지 함수가 Supabase 대시보드에만 있었는데, 이 리포지토리를 소스의 기준으로 삼습니다.

| 함수 | 역할 | 핵심 |
|---|---|---|
| `erp-analyze` | 진단 제출 저장 + AI 분석 + 리포트 조회 + 어드민 목록 | **Claude Sonnet 5 (`claude-sonnet-5`)** — 비용·속도 최적화 |
| `erp-chat` | 고객 ↔ 관리자 실시간 채팅 + Slack 알림 + 안 읽음 뱃지 | 리드 링크가 곧 고객 접근 키 |
| `erp-nurture` | 기존 진단 리드에게 단계별 자동 육성 메일(1·4·7일차) | **새 이메일을 수집하지 않음** — 상담 목적 연락처만 사용 |
| `erp-subscribe` | 홈페이지 뉴스레터 구독 신청 + 더블 옵트인 확인 | 확인 메일의 링크를 눌러야 발송 대상이 됨 |
| `erp-broadcast` | 확정 구독자에게 관리자가 작성한 공지 발송 | `/erpanalysis/admin/broadcast/` 에서 사용, 제목에 `(광고)` 자동 표시 |

**이메일 발송 관련 법적 설계 (정보통신망법 준수):** 위 세 함수 모두 자동으로 이메일 주소를
수집하지 않습니다(제50조의2 — 이메일 수집 프로그램은 동의 여부와 무관하게 그 자체로 불법). 발송
대상은 ① 이미 진단 신청 시 상담 목적으로 남긴 연락처, ② 웹사이트에서 방문자가 직접 입력하고
확인 메일 링크를 클릭해 확정한 구독자, 둘 중 하나뿐입니다. 모든 메일에는 발신자 정보와 수신거부
링크가 들어갑니다. 잠재 고객을 더 찾고 싶다면 `scripts/find-target-companies.mjs`로 후보 업체를
조사해 사람이 직접 연락하고 동의를 구한 뒤 이 시스템으로 넘기세요(`scripts/README.md` 참고).

## 1회 준비

```bash
supabase link --project-ref joycuxdxlqhztyomnimh

# 테이블 (이미 있으면 그대로 통과 — IF NOT EXISTS)
supabase db push          # 또는 SQL Editor에서 migrations/*.sql 을 순서대로 실행

# 시크릿
supabase secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  ERP_ADMIN_TOKEN=<어드민 토큰> \
  SLACK_WEBHOOK_URL=https://hooks.slack.com/services/... \  # 선택(신규 진단·채팅 알림)
  RESEND_API_KEY=re_...             \  # erp-nurture·erp-subscribe·erp-broadcast 발송용 (resend.com, 무료 가입)
  MAIL_FROM='주식회사 바틀 <hss@bottlecorp.kr>' \  # 선택 — Resend에 도메인 인증 후 사용
  CRON_SECRET=<임의의 긴 무작위 문자열>   # erp-nurture 크론 인증 — GitHub Secrets에도 동일한 값 등록
```

`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`는 Edge Function 런타임이 자동 주입합니다.

`RESEND_API_KEY`가 없으면 erp-nurture·erp-subscribe·erp-broadcast는 배포는 되지만 메일 발송
시도 시 에러를 반환합니다(다른 기능에는 영향 없음). Resend 무료 요금제는 도메인 인증 없이도
가입 계정 메일로 테스트 발송이 가능하고, `bottlecorp.kr` 도메인을 인증하면 실제 발신 주소로
보낼 수 있습니다(Resend 대시보드 → Domains → DNS 레코드 추가).

## 배포

```bash
supabase functions deploy erp-analyze   --no-verify-jwt
supabase functions deploy erp-chat      --no-verify-jwt
supabase functions deploy erp-nurture   --no-verify-jwt
supabase functions deploy erp-subscribe --no-verify-jwt
supabase functions deploy erp-broadcast --no-verify-jwt
```

`erp-nurture`는 매일 자동 호출이 필요합니다 — `.github/workflows/erp-nurture-cron.yml`이
GitHub Actions 스케줄(매일 KST 09:00)로 호출합니다. 리포지토리 Settings → Secrets and
variables → Actions 에 `CRON_SECRET`을 Supabase 시크릿과 **동일한 값**으로 등록하세요.

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

# 4) 뉴스레터 구독 신청 → 본인 메일함에서 확인 메일의 링크를 눌러야 confirmed
curl -s -X POST $BASE/erp-subscribe -H 'content-type: application/json' \
  -d '{"email":"본인이메일@example.com","company":"테스트"}'

# 5) 리드 육성 메일 수동 트리거 (평소엔 GitHub Actions가 매일 자동 호출)
curl -s "$BASE/erp-nurture" -H "x-cron-secret: <CRON_SECRET 값>"

# 6) 구독자 발송 (관리자 토큰 필요) — 먼저 대상 수 확인, 그다음 실제 발송
curl -s "$BASE/erp-broadcast" -H "x-admin-token: <ERP_ADMIN_TOKEN 값>"
curl -s -X POST "$BASE/erp-broadcast" -H "x-admin-token: <ERP_ADMIN_TOKEN 값>" -H 'content-type: application/json' \
  -d '{"subject":"테스트 공지","html":"<p>본문 테스트입니다.</p>"}'
```

## 주의

- **모델 변경은 `erp-analyze/index.ts`의 `MODEL` 상수 한 곳**입니다. 진단 분석은 Sonnet 5로 고정해 두었습니다 (리포트 품질 대비 비용·응답속도 최적).
- 가격(최적 제안가)은 프런트 규칙 엔진이 결정하고, AI는 **금액을 절대 바꾸지 않고 근거만 서술**합니다 — 정찰제 일관성의 핵심이므로 프롬프트의 해당 규칙을 지워선 안 됩니다.
- 기존 배포본과 테이블 구조가 다르면 (컬럼 누락 오류 등) `migrations/` SQL을 먼저 실행하세요. 기존 데이터는 건드리지 않습니다.
- 관리자 채팅 페이지(`/erpanalysis/admin/chat/`)는 PWA입니다 — 폰 브라우저로 열면 '앱으로 설치' 배너가 뜨고, 설치 후 앱처럼 실행됩니다. 앱이 꺼져 있을 때의 실시간 푸시는 `SLACK_WEBHOOK_URL`로 들어오는 Slack 알림이 담당합니다.
- **이메일 자동 수집·무동의 발송 기능은 의도적으로 만들지 않았습니다.** 정보통신망법 제50조의2(이메일 수집 프로그램 금지)·제50조(사전 동의 없는 광고성 정보 전송 금지) 위반이기 때문입니다. `erp-nurture`·`erp-subscribe`·`erp-broadcast` 셋 다 이미 동의받은 연락처에만 발송합니다 — 이 경계를 허무는 방향으로 수정하지 마세요.

## erp-project — 클라이언트 프로젝트 룸 + 피드백 자동 반영

프로젝트별 메신저 룸에서 클라이언트가 "반영 요청"을 보내면:
Claude(Sonnet 5)가 피드백을 작업 명세로 변환 → 레포에 `client-feedback` 이슈 생성
→ GitHub Actions(`client-feedback.yml`)에서 Claude Code가 구현·PR 생성
→ 회신 초안이 만들어지고 **관리자가 어드민에서 승인해야** 클라이언트에게 발송된다.

- 클라이언트 룸: `https://bottlecorp.kr/project/?t=<client_token>` (룸 생성 시 발급)
- 관리자: `https://bottlecorp.kr/erpanalysis/admin/projects/`
- 추가 시크릿: `GH_BOT_TOKEN` — 이슈 생성용 GitHub Fine-grained PAT
  (해당 레포 Issues: Read and write 권한). Supabase 시크릿에 저장.
- 콜백 인증은 `CRON_SECRET`을 재사용한다 — GitHub Actions 시크릿과 Supabase
  시크릿에 같은 값이 있어야 회신 초안이 생성된다.
- 완전 자동 배포는 의도적으로 만들지 않았다: 클라이언트 입력은 신뢰할 수 없는
  입력이므로, 머지·회신 발송은 항상 관리자 승인(사람)을 거친다.
