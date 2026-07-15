-- 리드 자동 육성 메일 + 웹사이트 옵트인 구독자
--
-- 중요: 이 두 기능 모두 "새 이메일 주소를 자동으로 수집"하지 않는다.
--   · erp_leads 는 이미 ERP 진단을 신청하며 상담 목적으로 남긴 연락처만 쓴다.
--   · erp_subscribers 는 방문자가 사이트에서 직접 입력하고, 확인 메일의 링크를
--     눌러야(더블 옵트인) status가 confirmed 로 바뀐다 — 실제 발송은 confirmed만 대상.
-- 정보통신망법 제50조의2(이메일 주소 무단 수집 프로그램 금지)를 지키기 위한 설계다.

-- 리드 육성 메일: 발송 단계·수신거부 여부 추적
alter table public.erp_leads add column if not exists followup_stage integer not null default 0;
alter table public.erp_leads add column if not exists followup_sent_at timestamptz;
alter table public.erp_leads add column if not exists unsubscribed boolean not null default false;

-- 웹사이트 옵트인 구독자
create table if not exists public.erp_subscribers (
  id              bigint generated always as identity primary key,
  email           text not null unique,
  company         text,
  source          text not null default 'homepage',
  status          text not null default 'pending' check (status in ('pending','confirmed','unsubscribed')),
  confirm_token   text not null,
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz,
  unsubscribed_at timestamptz
);
create index if not exists erp_subscribers_status_idx on public.erp_subscribers (status);
create index if not exists erp_subscribers_token_idx on public.erp_subscribers (confirm_token);

alter table public.erp_subscribers enable row level security;
