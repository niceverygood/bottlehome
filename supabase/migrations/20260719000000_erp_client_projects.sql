-- 클라이언트 프로젝트 메신저 + 피드백 자동 반영 파이프라인
--
-- 구조:
--   erp_projects          — 프로젝트(= 대화 룸). client_token이 곧 클라이언트 접근 키.
--   erp_project_messages  — 룸 메시지. kind로 일반 채팅/반영요청/봇 회신/시스템 알림 구분.
--                           봇 회신(bot_reply)은 meta.status='pending'으로 생성되고,
--                           관리자가 승인해야 'sent'가 되어 클라이언트에게 보인다(승인 게이트).
--   erp_project_reads     — 안 읽음 커서 (erp_chat_reads와 동일 패턴)
--
-- RLS만 켜고 정책은 만들지 않는다 → service_role(Edge Function)만 접근 가능.

create table if not exists public.erp_projects (
  id            bigint generated always as identity primary key,
  name          text not null,
  client_company text,
  repo          text not null,                 -- "owner/name" — 피드백 이슈가 생성될 GitHub 레포
  client_token  text not null unique,          -- 클라이언트 룸 링크 토큰 (/project/?t=...)
  status        text not null default 'active' check (status in ('active','done','archived')),
  created_at    timestamptz not null default now()
);

create table if not exists public.erp_project_messages (
  id          bigint generated always as identity primary key,
  project_id  bigint not null references public.erp_projects(id) on delete cascade,
  sender      text not null check (sender in ('client','admin','bot','system')),
  kind        text not null default 'chat' check (kind in ('chat','feedback','bot_reply','system')),
  body        text not null,
  meta        jsonb not null default '{}'::jsonb,  -- issue_url, pr_url, preview_url, status(pending|sent) 등
  created_at  timestamptz not null default now()
);
create index if not exists erp_project_messages_proj_idx on public.erp_project_messages (project_id, id);

create table if not exists public.erp_project_reads (
  project_id   bigint not null references public.erp_projects(id) on delete cascade,
  reader       text not null check (reader in ('client','admin')),
  last_read_id bigint not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (project_id, reader)
);

alter table public.erp_projects enable row level security;
alter table public.erp_project_messages enable row level security;
alter table public.erp_project_reads enable row level security;
