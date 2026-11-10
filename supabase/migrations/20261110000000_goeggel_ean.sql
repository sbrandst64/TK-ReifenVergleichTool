-- EANs the app has read from Göggel's detail layer (spec 3.3, AC46): Göggel article number → EAN.
-- Saves about 0.65 s per offer on every later search. Only the `search` Edge Function (service
-- role) reads and writes this table. No prices, stock or customer data.
create table if not exists public.goeggel_ean (
  article_id text primary key,
  ean text not null check (ean ~ '^[0-9]{8,14}$'),
  created_at timestamptz not null default now()
);

-- RLS on and no policies: the public anon key cannot read or change anything.
alter table public.goeggel_ean enable row level security;
