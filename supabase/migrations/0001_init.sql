-- ALVIORA LEARN schema. Run once on a fresh Supabase project (SQL editor), in this order: 0001_init.sql
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  status text not null default 'pending' check (status in ('pending','active','deactivated')),
  batch_id uuid,
  course_completed boolean not null default false,
  last_login timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('student','admin')),
  primary key (user_id, role)
);
create table public.batches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  course_title text not null,
  start_date date, end_date date,
  status text not null default 'upcoming' check (status in ('upcoming','active','completed')),
  created_at timestamptz not null default now()
);
alter table public.profiles add constraint profiles_batch_fk foreign key (batch_id) references public.batches(id) on delete set null;
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  title text not null, topic text, class_date date not null default current_date,
  body text, link_url text, file_path text, file_name text,
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  title text not null, instructions text,
  due_at timestamptz not null, max_marks int,
  status text not null default 'draft' check (status in ('draft','published','closed')),
  created_at timestamptz not null default now()
);
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('pdf','ppt','link')),
  file_path text, url text,
  submitted_at timestamptz not null default now(),
  status text not null default 'submitted' check (status in ('submitted','reviewed','needs_changes')),
  marks int, feedback text,
  check ((kind = 'link' and url is not null and file_path is null) or (kind <> 'link' and file_path is not null and url is null))
);
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_date date not null,
  status text not null check (status in ('present','absent','leave')),
  unique (student_id, class_date)
);
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.batches(id) on delete cascade, -- null = all students
  title text not null, body text not null,
  created_at timestamptz not null default now()
);
create index on public.profiles (status, batch_id);
create index on public.notes (batch_id, status);
create index on public.assignments (batch_id, status);
create index on public.submissions (assignment_id, student_id);
create index on public.attendance (batch_id, class_date);

-- Role helpers (security definer + fixed search_path avoids recursive RLS)
create function public.is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin') $$;
create function public.is_active_student() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and status = 'active') $$;
create function public.my_batch() returns uuid language sql stable security definer set search_path = public as
$$ select batch_id from public.profiles where id = auth.uid() $$;
revoke all on function public.is_admin(), public.is_active_student(), public.my_batch() from public, anon;
grant execute on function public.is_admin(), public.is_active_student(), public.my_batch() to authenticated;

-- New signups: always student + pending approval. Role is never read from client metadata.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name) values (new.id, coalesce(new.email,''), coalesce(new.raw_user_meta_data->>'full_name',''));
  insert into public.user_roles (user_id, role) values (new.id, 'student');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Students may edit only their name; admin-managed columns are locked.
create function public.guard_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.id <> old.id or new.email <> old.email or new.status <> old.status
       or new.batch_id is distinct from old.batch_id or new.course_completed <> old.course_completed then
      raise exception 'Only an admin can change this field';
    end if;
  end if;
  new.updated_at = now();
  return new;
end $$;
create trigger guard_profile_t before update on public.profiles for each row execute function public.guard_profile();

create function public.touch_login() returns void language sql security definer set search_path = public as
$$ update public.profiles set last_login = now() where id = auth.uid() $$;
revoke all on function public.touch_login() from public, anon;
grant execute on function public.touch_login() to authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.batches enable row level security;
alter table public.notes enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.attendance enable row level security;
alter table public.announcements enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy roles_select on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- no client write policies on user_roles: admins are created only via SQL (see README)

create policy batches_admin on public.batches for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy batches_student on public.batches for select to authenticated using (public.is_active_student() and id = public.my_batch());

create policy notes_admin on public.notes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy notes_student on public.notes for select to authenticated using (public.is_active_student() and status = 'published' and batch_id = public.my_batch());

create policy asg_admin on public.assignments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy asg_student on public.assignments for select to authenticated using (public.is_active_student() and status in ('published','closed') and batch_id = public.my_batch());

create policy sub_admin on public.submissions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy sub_student_select on public.submissions for select to authenticated using (student_id = auth.uid() and public.is_active_student());
create policy sub_student_insert on public.submissions for insert to authenticated with check (
  student_id = auth.uid() and public.is_active_student() and status = 'submitted' and marks is null and feedback is null
  and exists (select 1 from public.assignments a where a.id = assignment_id and a.status = 'published' and a.batch_id = public.my_batch()));

create policy att_admin on public.attendance for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy att_student on public.attendance for select to authenticated using (student_id = auth.uid() and public.is_active_student());

create policy ann_admin on public.announcements for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ann_student on public.announcements for select to authenticated using (public.is_active_student() and (batch_id is null or batch_id = public.my_batch()));

-- Private storage. Paths: materials/<batch_id>/<file>, submissions/<student_id>/<file>
insert into storage.buckets (id, name, public, file_size_limit) values
  ('materials','materials',false,20971520), ('submissions','submissions',false,20971520)
on conflict (id) do update set public = false;

create policy st_admin on storage.objects for all to authenticated
  using (bucket_id in ('materials','submissions') and public.is_admin())
  with check (bucket_id in ('materials','submissions') and public.is_admin());
create policy st_materials_read on storage.objects for select to authenticated
  using (bucket_id = 'materials' and public.is_active_student() and (storage.foldername(name))[1] = public.my_batch()::text);
create policy st_sub_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and public.is_active_student() and (storage.foldername(name))[1] = auth.uid()::text);
create policy st_sub_read on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and public.is_active_student() and (storage.foldername(name))[1] = auth.uid()::text);
