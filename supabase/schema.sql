-- One JSON document per restaurant. The app keeps the same state shape in
-- localStorage as an offline cache and in Supabase for cross-device sync.
create table if not exists public.store_data (
  store_id   text primary key,
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists store_data_touch on public.store_data;
create trigger store_data_touch
  before update on public.store_data
  for each row execute function public.touch_updated_at();

-- This mirrors the existing Thienlong setup: the public browser key can read
-- and write every store row. The client password is not real authorization.
-- Replace this policy with Supabase Auth-based tenant rules for private data.
alter table public.store_data enable row level security;

drop policy if exists store_data_open on public.store_data;
create policy store_data_open
  on public.store_data
  for all
  to anon, authenticated
  using (true)
  with check (true);
