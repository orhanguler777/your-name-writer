create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  question text not null,
  image_url text,
  status text not null default 'active' check (status in ('active', 'completed', 'draft')),
  sent_to_whatsapp boolean not null default false,
  sent_at timestamp with time zone,
  created_by uuid references auth.users(id),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.polls enable row level security;

create policy "Enable read access for all users" on public.polls
  for select using (true);

create policy "Enable all access for authenticated users" on public.polls
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_text text not null,
  created_at timestamp with time zone not null default now()
);

alter table public.poll_options enable row level security;

create policy "Enable read access for all users" on public.poll_options
  for select using (true);

create policy "Enable all access for authenticated users" on public.poll_options
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  phone_number text not null,
  created_at timestamp with time zone not null default now(),
  unique(poll_id, phone_number) -- Her numara bir ankete bir kez oy verebilir (güncelleyebilir)
);

alter table public.poll_votes enable row level security;

-- Bot (service role) can insert/update/select. UI can select.
create policy "Enable read access for authenticated users" on public.poll_votes
  for select using (auth.role() = 'authenticated');

-- Trigger to update updated_at on polls
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger handle_polls_updated_at
  before update on public.polls
  for each row
  execute procedure public.handle_updated_at();

-- Add real-time publication for polls and poll_votes so UI can react
alter publication supabase_realtime add table public.polls;
alter publication supabase_realtime add table public.poll_votes;
