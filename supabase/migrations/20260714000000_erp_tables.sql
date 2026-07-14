-- ERP 진단·채팅 상담 테이블 — Edge Function(service_role) 전용 접근.
-- 이미 운영 중인 프로젝트에도 안전하게 재실행 가능하도록 IF NOT EXISTS로만 구성.

-- 진단 리드
create table if not exists public.erp_leads (
  id         bigint generated always as identity primary key,
  public_id  text not null unique,                 -- 리포트 공유 링크(?lead=)·채팅 접근 키
  created_at timestamptz not null default now(),
  company    text,
  contact    text,
  email      text,
  person     text,
  answers    jsonb not null default '{}'::jsonb,   -- 설문 응답 전체(S)
  rule       jsonb,                                -- 규칙 엔진 결과(tier·opt·scores…)
  ai         jsonb,                                -- Claude Sonnet 5 분석 결과
  ai_used    boolean not null default false,
  ai_ready   boolean not null default false,
  tier       text,
  price_lo   integer,                              -- 최적 제안가(만원) — opt 저장
  price_hi   integer
);
create index if not exists erp_leads_created_idx on public.erp_leads (created_at desc);

-- 채팅 메시지
create table if not exists public.erp_chat_messages (
  id         bigint generated always as identity primary key,
  lead_id    text not null,                        -- erp_leads.public_id
  sender     text not null check (sender in ('customer','admin')),
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists erp_chat_lead_idx on public.erp_chat_messages (lead_id, id);

-- 관리자 읽음 커서 (안 읽음 뱃지·알림 기준)
create table if not exists public.erp_chat_reads (
  lead_id            text primary key,
  admin_last_read_id bigint not null default 0
);

-- RLS 활성화 + 정책 없음 = anon 접근 차단, service_role(Edge Function)만 통과
alter table public.erp_leads         enable row level security;
alter table public.erp_chat_messages enable row level security;
alter table public.erp_chat_reads    enable row level security;
