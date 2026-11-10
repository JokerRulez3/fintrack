-- FinTrack schema. Run once in Supabase → SQL Editor.
-- Safe to run in the same Supabase project as InvestIQ: every table is prefixed fin_.
-- Replace YOUR_EMAIL (bottom of file) with the Google / magic-link email you sign in with.

create extension if not exists pgcrypto;

-- Who may use FinTrack at all (single-user today; add a row later to let Neelu in).
create table if not exists fin_allowed_emails (
  email text primary key
);
alter table fin_allowed_emails enable row level security;
-- no policies: only the SQL editor / service role can read or change this list

create or replace function fin_is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from fin_allowed_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- One row per (month, item, payer) — the same shape as a cell in the yearly sheets.
create table if not exists fin_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month       date not null check (extract(day from month) = 1),
  item        text not null,                       -- "Paid for" in the sheet
  category    text not null default 'Other',
  payer       text not null,                       -- Srikanth / Neelu
  amount      numeric(14,2) not null,
  breakdown   numeric[],                           -- pieces of "=(10753+10193)"-style cells
  note        text,
  pos         int not null default 1000,           -- row order inside the month
  source      text,                                -- 'xlsx:2026!C27' for imported rows
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, month, item, payer)
);
create index if not exists fin_entries_user_month on fin_entries (user_id, month);

-- Imperia-style project ledgers (payments, interiors, essentials). Not counted in monthly totals.
create table if not exists fin_project_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project     text not null,
  section     text not null,
  label       text not null,
  date        date,
  payer       text,
  amount      numeric(14,2) not null,
  unit_cost   numeric(14,2),
  qty         numeric,
  is_gift     boolean not null default false,
  breakdown   numeric[],
  note        text,
  source      text,
  created_at  timestamptz not null default now()
);
create index if not exists fin_project_items_user on fin_project_items (user_id, project);

create or replace function fin_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists fin_entries_touch on fin_entries;
create trigger fin_entries_touch before update on fin_entries for each row execute function fin_touch();

alter table fin_entries enable row level security;
alter table fin_project_items enable row level security;

drop policy if exists fin_entries_own on fin_entries;
create policy fin_entries_own on fin_entries for all
  using (user_id = auth.uid() and fin_is_allowed())
  with check (user_id = auth.uid() and fin_is_allowed());

drop policy if exists fin_project_items_own on fin_project_items;
create policy fin_project_items_own on fin_project_items for all
  using (user_id = auth.uid() and fin_is_allowed())
  with check (user_id = auth.uid() and fin_is_allowed());

-- Lets the app ask "am I allowed?" without exposing the list.
grant execute on function fin_is_allowed() to authenticated;

insert into fin_allowed_emails (email) values ('YOUR_EMAIL') on conflict do nothing;
