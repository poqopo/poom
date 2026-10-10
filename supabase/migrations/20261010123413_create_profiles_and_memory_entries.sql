create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.memory_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  text_content text not null,
  image_path text,
  status text not null default 'draft' check (status in ('draft', 'transferred')),
  created_at timestamptz not null default now()
);

create index memory_entries_owner_created_at_idx
  on public.memory_entries (owner_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.memory_entries enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.memory_entries from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.memory_entries to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users can create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Users can read their own memory entries"
  on public.memory_entries for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can create their own memory entries"
  on public.memory_entries for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Users can update their own memory entries"
  on public.memory_entries for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
