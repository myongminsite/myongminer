-- Supabase SQL Editor에서 한 번 실행하세요.
create extension if not exists "uuid-ossp";

create table if not exists public.taste_boards (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  items jsonb not null default '["목록 1", "목록 2", "목록 3", "목록 4", "목록 5", "목록 6", "목록 7", "목록 8", "목록 9", "목록 10", "목록 11"]'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.taste_rows (
  id uuid primary key default uuid_generate_v4(),
  board_id uuid not null references public.taste_boards(id) on delete cascade,
  nickname text not null,
  avatar_url text,
  values jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.taste_boards enable row level security;
alter table public.taste_rows enable row level security;
-- 공유 링크 기반의 간단한 공동 표입니다. 비공개 권한이 필요하면 로그인/멤버 테이블 정책으로 교체하세요.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'taste_boards' and policyname = 'anonymous users can use boards') then
    create policy "anonymous users can use boards" on public.taste_boards for all to anon, authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'taste_rows' and policyname = 'anonymous users can use rows') then
    create policy "anonymous users can use rows" on public.taste_rows for all to anon, authenticated using (true) with check (true);
  end if;
end $$;

insert into storage.buckets (id, name, public) values ('taste-images', 'taste-images', true) on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'anyone can manage taste images') then
    create policy "anyone can manage taste images" on storage.objects for all to anon, authenticated using (bucket_id = 'taste-images') with check (bucket_id = 'taste-images');
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'taste_rows') then
    alter publication supabase_realtime add table public.taste_rows;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'taste_boards') then
    alter publication supabase_realtime add table public.taste_boards;
  end if;
end $$;
