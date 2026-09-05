-- Kei BRSTM Hub: タグ英語名テーブル
-- Supabase Dashboard -> SQL Editor で1回実行してください。

create table if not exists public.tag_definitions (
  name text primary key,
  name_en text not null default '',
  created_at timestamptz not null default now()
);

alter table public.tag_definitions enable row level security;

drop policy if exists "Public can read tag definitions" on public.tag_definitions;
create policy "Public can read tag definitions"
on public.tag_definitions
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated users can insert tag definitions" on public.tag_definitions;
create policy "Authenticated users can insert tag definitions"
on public.tag_definitions
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated users can update tag definitions" on public.tag_definitions;
create policy "Authenticated users can update tag definitions"
on public.tag_definitions
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can delete tag definitions" on public.tag_definitions;
create policy "Authenticated users can delete tag definitions"
on public.tag_definitions
for delete
to authenticated
using (true);

-- No tag は英語でも同じ表記なので、明示登録は不要です。
