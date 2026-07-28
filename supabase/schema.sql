-- KidSpark store schema. Run this in the Supabase SQL editor.
-- These tables are written to ONLY by the serverless functions (service role).
-- Row Level Security is ON with no public policies, so the anon/public key
-- cannot read or write them.

create table if not exists orders (
  id           uuid primary key default gen_random_uuid(),
  reference    text unique not null,
  email        text not null,
  amount_kobo  integer not null,
  product_ids  text[] not null,
  status       text not null default 'pending',   -- pending | paid
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);

create index if not exists orders_reference_idx on orders (reference);

create table if not exists download_grants (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders (id) on delete cascade,
  product_id      text not null,
  token           text unique not null,
  file_name       text not null,
  storage_path    text not null,
  expires_at      timestamptz not null,
  max_downloads   integer not null default 5,
  downloads_used  integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists download_grants_token_idx on download_grants (token);
create index if not exists download_grants_order_idx on download_grants (order_id);

-- Lock the tables down. The service-role key used by the functions bypasses RLS;
-- the public/anon key gets nothing.
alter table orders enable row level security;
alter table download_grants enable row level security;

-- NOTE: create your Storage bucket named "printables" as a PRIVATE bucket
-- (Storage -> New bucket -> uncheck "Public"). Do this in the dashboard.
