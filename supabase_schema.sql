-- Create a table for public profiles
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  avatar_url text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint username_length check (char_length(username) >= 3 and char_length(username) <= 15)
);

-- Enable Row Level Security for profiles
alter table public.profiles enable row level security;

-- Profiles policies
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
create policy "Public profiles are viewable by everyone." on public.profiles
  for select using (true);

drop policy if exists "Users can insert their own profile." on public.profiles;
create policy "Users can insert their own profile." on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Users can update their own profile." on public.profiles;
create policy "Users can update their own profile." on public.profiles
  for update using (auth.uid() = id);

-- Create messages table (supports both public lobby and private DMs)
create table if not exists public.messages (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  username text not null,
  content text not null check (char_length(content) > 0 and char_length(content) <= 1000),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  reply_to_id uuid references public.messages(id) on delete set null,
  reply_to_username text,
  recipient_id uuid references public.profiles(id) on delete cascade,
  recipient_username text
);

-- Enable Row Level Security for messages
alter table public.messages enable row level security;

-- Messages policies (enforce privacy for DMs)
drop policy if exists "Messages are viewable by everyone." on public.messages;
create policy "Messages are viewable by everyone if public, or by sender/recipient if private." on public.messages
  for select using (recipient_id is null or auth.uid() = profile_id or auth.uid() = recipient_id);

drop policy if exists "Authenticated users can post messages." on public.messages;
create policy "Authenticated users can post messages." on public.messages
  for insert with check (auth.uid() = profile_id);

-- Enable Realtime for messages and profiles
-- Note: You can also enable this from the Supabase dashboard (Database -> Replication -> Source -> supabase_realtime).
-- The following SQL enables realtime for these tables:
begin;
  -- Remove tables if they are already in the publication
  alter publication supabase_realtime remove table public.messages;
  alter publication supabase_realtime remove table public.profiles;
exception when others then
  -- Ignore errors if publication doesn't exist yet or tables are not in it
end;

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.profiles;

-- Function and trigger to automatically handle new signups
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
