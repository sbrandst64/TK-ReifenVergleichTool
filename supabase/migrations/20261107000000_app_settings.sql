-- Central settings of the workshop app (spec 3.7): currently the editable PDF texts.
-- Only the `settings` Edge Function (service role) reads and writes this table.
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS on and no policies: the public anon key cannot read or change anything.
alter table public.app_settings enable row level security;
