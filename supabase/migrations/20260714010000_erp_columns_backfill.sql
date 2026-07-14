-- 기존 운영 테이블이 예전 구조일 경우 새 Edge Function이 쓰는 컬럼을 보충한다.
-- 전부 "없으면 추가"라 몇 번을 실행해도 안전하고, 기존 데이터는 건드리지 않는다.

alter table public.erp_leads add column if not exists public_id text;
alter table public.erp_leads add column if not exists created_at timestamptz not null default now();
alter table public.erp_leads add column if not exists company text;
alter table public.erp_leads add column if not exists contact text;
alter table public.erp_leads add column if not exists email text;
alter table public.erp_leads add column if not exists person text;
alter table public.erp_leads add column if not exists answers jsonb not null default '{}'::jsonb;
alter table public.erp_leads add column if not exists rule jsonb;
alter table public.erp_leads add column if not exists ai jsonb;
alter table public.erp_leads add column if not exists ai_used boolean not null default false;
alter table public.erp_leads add column if not exists ai_ready boolean not null default false;
alter table public.erp_leads add column if not exists tier text;
alter table public.erp_leads add column if not exists price_lo integer;
alter table public.erp_leads add column if not exists price_hi integer;
create unique index if not exists erp_leads_public_id_key on public.erp_leads (public_id);

alter table public.erp_chat_messages add column if not exists lead_id text;
alter table public.erp_chat_messages add column if not exists sender text;
alter table public.erp_chat_messages add column if not exists body text;
alter table public.erp_chat_messages add column if not exists created_at timestamptz not null default now();
