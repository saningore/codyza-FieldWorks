begin;

create extension if not exists pgcrypto;
create extension if not exists citext;
create schema if not exists extensions;
create extension if not exists postgis;

create schema if not exists app;

create or replace function app.current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app.current_org_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.org_id', true), '')::uuid
$$;

create table users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  password_hash text not null,
  mfa_secret text,
  mfa_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  scope text not null check (scope in ('full', 'enroll')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table login_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table login_attempts (
  id bigint generated always as identity primary key,
  email citext not null,
  attempted_at timestamptz not null default now()
);

create table signup_attempts (
  id bigint generated always as identity primary key,
  email citext not null,
  attempted_at timestamptz not null default now()
);

create table password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table reset_attempts (
  id bigint generated always as identity primary key,
  email citext not null,
  attempted_at timestamptz not null default now()
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 140),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  kind text not null check (kind in ('farmer', 'engineer', 'teacher', 'student', 'practice')),
  timezone text not null default 'America/Chicago',
  demo boolean not null default false,
  purge_after timestamptz,
  created_at timestamptz not null default now()
);

create table memberships (
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role text not null check (role in (
    'owner', 'manager', 'operator', 'advisor', 'viewer',
    'lead', 'member', 'reviewer',
    'teacher', 'assistant', 'student',
    'contributor', 'observer'
  )),
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create unique index memberships_one_owner
  on memberships (organization_id)
  where role = 'owner' and status = 'active';

create table invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  email citext not null,
  role text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  invited_by uuid not null references users (id),
  created_at timestamptz not null default now()
);

create table role_permissions (
  role text not null,
  permission text not null,
  primary key (role, permission)
);

create table counters (
  organization_id uuid not null references organizations (id) on delete cascade,
  kind text not null,
  value integer not null,
  primary key (organization_id, kind)
);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  actor_id uuid references users (id),
  subject_type text not null,
  subject_id uuid,
  summary text not null check (char_length(summary) between 1 and 400),
  created_at timestamptz not null default now()
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  subject_type text not null,
  subject_id uuid not null,
  author_id uuid not null references users (id),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  subject_type text not null,
  subject_id uuid not null,
  name text not null,
  media_type text not null,
  byte_size integer not null check (byte_size >= 0),
  storage_key text not null,
  created_by uuid references users (id),
  created_at timestamptz not null default now()
);

insert into role_permissions (role, permission)
select 'owner', permission from (values
  ('workspace.read'), ('field.read'), ('field.write'), ('activity.write'),
  ('finance.read'), ('finance.write'), ('stock.read'), ('stock.write'), ('recommendation.write'),
  ('project.read'), ('project.write'), ('issue.write'), ('decision.write'),
  ('class.read'), ('class.write'), ('gradebook.read'), ('grade.write'), ('attendance.write'),
  ('assignment.submit'), ('grade.own'),
  ('study.read'), ('study.write'),
  ('client.read'), ('client.write'), ('time.write'),
  ('file.write'), ('member.invite'), ('org.manage'), ('audit.read')
) as permissions(permission);

insert into role_permissions (role, permission) values
  ('manager', 'workspace.read'), ('manager', 'field.read'), ('manager', 'field.write'),
  ('manager', 'activity.write'), ('manager', 'finance.read'), ('manager', 'finance.write'),
  ('manager', 'stock.read'), ('manager', 'stock.write'), ('manager', 'recommendation.write'),
  ('manager', 'file.write'), ('manager', 'member.invite'), ('manager', 'audit.read'),
  ('operator', 'workspace.read'), ('operator', 'field.read'), ('operator', 'activity.write'),
  ('operator', 'stock.read'), ('operator', 'file.write'),
  ('advisor', 'workspace.read'), ('advisor', 'field.read'), ('advisor', 'recommendation.write'),
  ('viewer', 'workspace.read'), ('viewer', 'field.read'),
  ('lead', 'workspace.read'), ('lead', 'project.read'), ('lead', 'project.write'),
  ('lead', 'issue.write'), ('lead', 'decision.write'), ('lead', 'file.write'),
  ('lead', 'member.invite'), ('lead', 'audit.read'),
  ('member', 'workspace.read'), ('member', 'project.read'), ('member', 'issue.write'), ('member', 'file.write'),
  ('reviewer', 'workspace.read'), ('reviewer', 'project.read'),
  ('teacher', 'workspace.read'), ('teacher', 'class.read'), ('teacher', 'class.write'),
  ('teacher', 'gradebook.read'), ('teacher', 'grade.write'), ('teacher', 'attendance.write'),
  ('teacher', 'file.write'), ('teacher', 'member.invite'), ('teacher', 'audit.read'),
  ('assistant', 'workspace.read'), ('assistant', 'class.read'), ('assistant', 'gradebook.read'),
  ('assistant', 'grade.write'), ('assistant', 'attendance.write'), ('assistant', 'file.write'),
  ('student', 'workspace.read'), ('student', 'class.read'), ('student', 'assignment.submit'),
  ('student', 'grade.own'), ('student', 'file.write'),
  ('contributor', 'workspace.read'), ('contributor', 'client.read'), ('contributor', 'time.write'),
  ('contributor', 'file.write'),
  ('observer', 'workspace.read'), ('observer', 'client.read');

create table farms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 140),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  farm_id uuid not null references farms (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 140),
  stated_acres numeric not null check (stated_acres > 0),
  computed_acres numeric,
  boundary geometry(Polygon, 4326),
  status_override text check (status_override in ('planned', 'in season', 'harvested', 'overdue')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table crop_seasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  field_id uuid not null references fields (id) on delete cascade,
  crop text not null check (char_length(btrim(crop)) between 1 and 80),
  planting_on date,
  expected_harvest_on date,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  unit text not null default 'unit',
  on_hand numeric not null check (on_hand >= 0),
  created_at timestamptz not null default now()
);

create table equipment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  hours numeric not null default 0 check (hours >= 0),
  notes text not null default ''
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  field_id uuid not null references fields (id) on delete cascade,
  season_id uuid references crop_seasons (id) on delete set null,
  kind text not null check (kind in ('planting', 'irrigation', 'fertilizer', 'pesticide', 'observation', 'harvest')),
  status text not null check (status in ('planned', 'done')),
  target_on date,
  completed_on date,
  assignee_id uuid references users (id),
  equipment_id uuid references equipment (id),
  product_id uuid references products (id),
  amount numeric check (amount is null or amount > 0),
  notes text not null default '',
  epa_reg text,
  applicator text,
  rei_hours integer check (rei_hours is null or rei_hours >= 0),
  phi_hours integer check (phi_hours is null or phi_hours >= 0),
  quantity numeric check (quantity is null or quantity > 0),
  unit text,
  moisture numeric,
  quality text,
  destination text,
  sale_price_cents integer check (sale_price_cents is null or sale_price_cents >= 0),
  idempotency_key text,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  check (kind <> 'harvest' or status <> 'done' or (quantity is not null and quantity > 0))
);

create unique index activities_idempotency
  on activities (organization_id, idempotency_key)
  where idempotency_key is not null;

create table expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  field_id uuid references fields (id) on delete set null,
  season_id uuid references crop_seasons (id) on delete set null,
  spent_on date not null,
  amount_cents integer not null check (amount_cents >= 0),
  category text not null,
  vendor text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  field_id uuid not null references fields (id) on delete cascade,
  author_id uuid not null references users (id),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  summary text not null default '',
  status text not null default 'active' check (status in ('planned', 'active', 'paused', 'done')),
  start_on date,
  target_on date,
  site_name text,
  site_address text,
  site_lng double precision,
  site_lat double precision,
  created_at timestamptz not null default now()
);

create table milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  name text not null,
  target_on date,
  created_at timestamptz not null default now()
);

create table issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  number integer not null,
  title text not null,
  description text not null default '',
  priority text not null default 'none' check (priority in ('none', 'low', 'medium', 'high', 'urgent')),
  status text not null default 'unstarted' check (status in ('backlog', 'unstarted', 'started', 'completed', 'canceled')),
  assignee_id uuid references users (id),
  deadline date,
  milestone_id uuid references milestones (id) on delete set null,
  start_on date,
  end_on date,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, number)
);

create table issue_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  issue_id uuid not null references issues (id) on delete cascade,
  description text not null,
  author_id uuid references users (id),
  created_at timestamptz not null default now()
);

create table issue_dependencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  predecessor_id uuid not null references issues (id) on delete cascade,
  successor_id uuid not null references issues (id) on delete cascade,
  unique (predecessor_id, successor_id),
  check (predecessor_id <> successor_id)
);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  project_id uuid references projects (id) on delete set null,
  title text not null,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'superseded', 'rejected')),
  supersedes_id uuid references decisions (id),
  author_id uuid references users (id),
  decided_on date,
  created_at timestamptz not null default now()
);

create table decision_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  decision_id uuid not null references decisions (id) on delete cascade,
  revision integer not null,
  problem text not null,
  options text not null,
  final_decision text not null,
  reason text not null,
  author_id uuid references users (id),
  created_at timestamptz not null default now(),
  unique (decision_id, revision)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

create table document_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  document_id uuid not null references documents (id) on delete cascade,
  revision integer not null,
  body text not null,
  author_id uuid references users (id),
  created_at timestamptz not null default now(),
  unique (document_id, revision)
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,
  name text not null,
  term_name text not null default '',
  schedule text not null default '',
  room text not null default '',
  calculation text not null default 'weighted' check (calculation in ('total_points', 'weighted')),
  missing_counts_as_zero boolean not null default false,
  created_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  section_id uuid not null references sections (id) on delete cascade,
  name text not null,
  weight numeric not null default 0 check (weight >= 0),
  drop_lowest integer not null default 0 check (drop_lowest >= 0)
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  section_id uuid not null references sections (id) on delete cascade,
  user_id uuid not null references users (id),
  status text not null default 'active' check (status in ('invited', 'active', 'withdrawn')),
  withdrawn_at timestamptz,
  unique (section_id, user_id)
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  section_id uuid not null references sections (id) on delete cascade,
  category_id uuid references categories (id) on delete set null,
  title text not null,
  points numeric not null check (points > 0),
  due_at timestamptz,
  published boolean not null default false,
  late_percent_per_day numeric not null default 0 check (late_percent_per_day >= 0),
  late_cap_percent numeric not null default 0 check (late_cap_percent >= 0),
  created_at timestamptz not null default now()
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  assignment_id uuid not null references assignments (id) on delete cascade,
  user_id uuid not null references users (id),
  attempt integer not null check (attempt > 0),
  body text not null default '',
  submitted_at timestamptz not null default now(),
  unique (assignment_id, user_id, attempt)
);

create table grades (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  submission_id uuid not null unique references submissions (id) on delete cascade,
  score numeric not null check (score >= 0),
  points_deducted numeric not null default 0 check (points_deducted >= 0),
  feedback text not null default '',
  grader_id uuid references users (id),
  graded_at timestamptz not null default now(),
  posted_at timestamptz,
  excused boolean not null default false
);

create table attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  section_id uuid not null references sections (id) on delete cascade,
  meeting_on date not null,
  opened_by uuid references users (id),
  unique (section_id, meeting_on)
);

create table attendance_marks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  session_id uuid not null references attendance_sessions (id) on delete cascade,
  user_id uuid not null references users (id),
  status text not null check (status in ('present', 'absent', 'tardy', 'excused')),
  unique (session_id, user_id)
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  section_id uuid not null references sections (id) on delete cascade,
  body text not null,
  author_id uuid references users (id),
  created_at timestamptz not null default now()
);

create table resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  section_id uuid not null references sections (id) on delete cascade,
  title text not null,
  url text not null default '',
  created_at timestamptz not null default now()
);

create table study_terms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  starts_on date,
  ends_on date
);

create table study_courses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  term_id uuid references study_terms (id) on delete set null,
  name text not null,
  instructor text not null default '',
  credits numeric not null default 0 check (credits >= 0),
  include_in_gpa boolean not null default true,
  room text not null default ''
);

create table study_meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  course_id uuid not null references study_courses (id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  start_time text not null,
  end_time text not null
);

create table study_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  course_id uuid not null references study_courses (id) on delete cascade,
  kind text not null check (kind in ('homework', 'quiz', 'exam', 'project')),
  title text not null,
  due_at timestamptz,
  weight numeric not null default 0 check (weight >= 0),
  points_possible numeric not null default 100 check (points_possible > 0),
  points_earned numeric check (points_earned is null or points_earned >= 0),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'submitted', 'graded', 'excused'))
);

create table study_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  course_id uuid references study_courses (id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  method text not null default 'read' check (method in ('read', 'practice', 'review')),
  confirmed boolean not null default false
);

create table study_readings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  course_id uuid references study_courses (id) on delete set null,
  title text not null,
  source text not null default '',
  status text not null default 'unread' check (status in ('unread', 'reading', 'done'))
);

create table study_places (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  lng double precision not null,
  lat double precision not null
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  notes text not null default ''
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  name text not null,
  address text not null default '',
  lng double precision,
  lat double precision
);

create table engagements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('lead', 'active', 'done')),
  rate_cents integer check (rate_cents is null or rate_cents >= 0)
);

create table deliverables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  engagement_id uuid not null references engagements (id) on delete cascade,
  title text not null,
  due_on date,
  status text not null default 'open' check (status in ('open', 'done'))
);

create table work_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  engagement_id uuid not null references engagements (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  billable boolean not null default true,
  notes text not null default '',
  check (ended_at > started_at)
);

create table practice_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  engagement_id uuid references engagements (id) on delete set null,
  spent_on date not null,
  amount_cents integer not null check (amount_cents >= 0),
  notes text not null default ''
);

create or replace function app.allowed(p_permission text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1
    from memberships m
    join role_permissions rp on rp.role = m.role
    where m.organization_id = app.current_org_id()
      and m.user_id = app.current_user_id()
      and m.status = 'active'
      and rp.permission = p_permission
  )
$$;

create or replace function app.in_org(p_org uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select p_org = app.current_org_id()
    and exists (
      select 1 from memberships m
      where m.organization_id = p_org
        and m.user_id = app.current_user_id()
        and m.status = 'active'
    )
$$;

create or replace function app.set_field_acres() returns trigger
language plpgsql
set search_path = public, extensions, app
as $$
begin
  if new.boundary is null then
    new.computed_acres := null;
  else
    new.computed_acres := round((st_area(new.boundary::geography) / 4046.8564224)::numeric, 2);
  end if;
  return new;
end $$;

create trigger fields_acres before insert or update of boundary on fields
for each row execute function app.set_field_acres();

create or replace function app.consume_input() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  updated integer;
begin
  if new.status <> 'done' or new.product_id is null or coalesce(new.amount, 0) <= 0 then
    return new;
  end if;
  if new.kind not in ('fertilizer', 'pesticide') then
    return new;
  end if;
  perform 1 from products where id = new.product_id for update;
  update products
  set on_hand = on_hand - new.amount
  where id = new.product_id and on_hand >= new.amount;
  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'stock cannot go below zero';
  end if;
  return new;
end $$;

create trigger activities_stock before insert or update of status, product_id, amount, kind on activities
for each row execute function app.consume_input();

create or replace function app.stamp_submission() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if current_setting('app.seed_clock', true) is distinct from 'on' then
      new.submitted_at := clock_timestamp();
    end if;
    return new;
  end if;
  if new.submitted_at is distinct from old.submitted_at then
    raise exception 'submitted_at cannot be changed';
  end if;
  return new;
end $$;

create trigger submissions_stamp before insert or update of submitted_at on submissions
for each row execute function app.stamp_submission();

create or replace function app.reject_dependency_cycle() returns trigger
language plpgsql as $$
begin
  if new.predecessor_id = new.successor_id then
    raise exception 'dependency cycle';
  end if;
  if exists (
    with recursive walk as (
      select new.successor_id as id
      union
      select d.successor_id
      from issue_dependencies d
      join walk w on d.predecessor_id = w.id
    )
    select 1 from walk where id = new.predecessor_id
  ) then
    raise exception 'dependency cycle';
  end if;
  return new;
end $$;

create trigger dependencies_cycle before insert on issue_dependencies
for each row execute function app.reject_dependency_cycle();

create or replace function app.note_login_attempt(p_email text) returns integer
language plpgsql security definer set search_path = public, app as $$
declare
  total integer;
begin
  delete from login_attempts where attempted_at < now() - interval '1 day';
  insert into login_attempts (email) values (p_email);
  select count(*) into total from login_attempts
  where email = p_email and attempted_at > now() - interval '15 minutes';
  return total;
end $$;

create or replace function app.clear_login_attempts(p_email text) returns void
language sql security definer set search_path = public, app as $$
  delete from login_attempts where email = p_email
$$;

create or replace function app.note_signup_attempt(p_email text) returns integer
language plpgsql security definer set search_path = public, app as $$
declare
  total integer;
begin
  delete from signup_attempts where attempted_at < now() - interval '1 day';
  insert into signup_attempts (email) values (p_email);
  select count(*) into total from signup_attempts
  where email = p_email and attempted_at > now() - interval '1 hour';
  return total;
end $$;

create or replace function app.lookup_login(p_email text)
returns table(id uuid, password_hash text, mfa_enabled boolean, mfa_secret text, name text)
language sql security definer set search_path = public, app as $$
  select u.id, u.password_hash, u.mfa_enabled, u.mfa_secret, u.name from users u where u.email = p_email
$$;

create or replace function app.open_session(p_user uuid, p_hash text, p_scope text, p_expires timestamptz)
returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  new_id uuid;
begin
  insert into sessions (user_id, token_hash, scope, expires_at)
  values (p_user, p_hash, p_scope, p_expires)
  returning id into new_id;
  return new_id;
end $$;

create or replace function app.read_session(p_hash text)
returns table(user_id uuid, email citext, name text, scope text, mfa_enabled boolean)
language sql security definer set search_path = public, app as $$
  select u.id, u.email, u.name, s.scope, u.mfa_enabled
  from sessions s
  join users u on u.id = s.user_id
  where s.token_hash = p_hash and s.revoked_at is null and s.expires_at > now()
$$;

create or replace function app.revoke_session(p_hash text) returns void
language sql security definer set search_path = public, app as $$
  update sessions set revoked_at = now() where token_hash = p_hash and revoked_at is null
$$;

create or replace function app.open_challenge(p_user uuid, p_hash text) returns void
language sql security definer set search_path = public, app as $$
  insert into login_challenges (user_id, token_hash, expires_at)
  values (p_user, p_hash, now() + interval '5 minutes')
$$;

create or replace function app.take_challenge(p_hash text)
returns table(user_id uuid, mfa_secret text, mfa_enabled boolean)
language plpgsql security definer set search_path = public, app as $$
declare
  challenge login_challenges%rowtype;
begin
  select * into challenge from login_challenges
  where token_hash = p_hash and used_at is null and expires_at > now();
  if not found then
    return;
  end if;
  update login_challenges set used_at = now() where id = challenge.id;
  return query select u.id, u.mfa_secret, u.mfa_enabled from users u where u.id = challenge.user_id;
end $$;

create or replace function app.begin_mfa(p_secret text) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  update users set mfa_secret = p_secret, mfa_enabled = false where id = app.current_user_id();
end $$;

create or replace function app.my_mfa_secret() returns text
language sql security definer set search_path = public, app as $$
  select mfa_secret from users where id = app.current_user_id()
$$;

create or replace function app.confirm_mfa() returns void
language sql security definer set search_path = public, app as $$
  update users set mfa_enabled = true where id = app.current_user_id()
$$;

create or replace function app.promote_session(p_hash text) returns void
language sql security definer set search_path = public, app as $$
  update sessions set scope = 'full' where token_hash = p_hash and user_id = app.current_user_id()
$$;

create or replace function app.register_owner(
  p_email text, p_name text, p_password_hash text, p_org_name text, p_slug text, p_timezone text, p_kind text
) returns table(user_id uuid, organization_id uuid)
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid;
  oid uuid;
begin
  if p_kind not in ('farmer', 'engineer', 'teacher', 'student', 'practice') then
    raise exception 'unknown workspace kind';
  end if;
  insert into users (email, name, password_hash) values (p_email, p_name, p_password_hash) returning id into uid;
  insert into organizations (name, slug, timezone, kind) values (p_org_name, p_slug, p_timezone, p_kind) returning id into oid;
  insert into memberships (organization_id, user_id, role) values (oid, uid, 'owner');
  user_id := uid;
  organization_id := oid;
  return next;
end $$;

create or replace function app.create_organization(p_name text, p_slug text, p_timezone text, p_kind text)
returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  oid uuid;
begin
  if app.current_user_id() is null then
    raise exception 'sign in required';
  end if;
  if p_kind not in ('farmer', 'engineer', 'teacher', 'student', 'practice') then
    raise exception 'unknown workspace kind';
  end if;
  insert into organizations (name, slug, timezone, kind) values (p_name, p_slug, p_timezone, p_kind) returning id into oid;
  insert into memberships (organization_id, user_id, role) values (oid, app.current_user_id(), 'owner');
  return oid;
end $$;

create or replace function app.request_password_reset(p_email text, p_hash text) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid;
  total integer;
begin
  delete from reset_attempts where attempted_at < now() - interval '1 day';
  insert into reset_attempts (email) values (p_email);
  select count(*) into total from reset_attempts where email = p_email and attempted_at > now() - interval '1 hour';
  if total > 5 then
    return;
  end if;
  select id into uid from users where email = p_email;
  if uid is null then
    return;
  end if;
  insert into password_resets (user_id, token_hash, expires_at) values (uid, p_hash, now() + interval '1 hour');
end $$;

create or replace function app.take_password_reset(p_hash text, p_password_hash text) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  reset password_resets%rowtype;
begin
  select * into reset from password_resets
  where token_hash = p_hash and used_at is null and expires_at > now()
  for update;
  if not found then
    raise exception 'password reset is invalid';
  end if;
  update users set password_hash = p_password_hash where id = reset.user_id;
  update password_resets set used_at = now() where id = reset.id;
  update sessions set revoked_at = now() where user_id = reset.user_id and revoked_at is null;
  return reset.user_id;
end $$;

create or replace function app.peek_invite(p_hash text)
returns table(email citext, role text, organization_name text, organization_slug text, expired boolean)
language sql security definer set search_path = public, app as $$
  select i.email, i.role, o.name, o.slug, (i.used_at is not null or i.expires_at <= now())
  from invitations i
  join organizations o on o.id = i.organization_id
  where i.token_hash = p_hash
$$;

create or replace function app.create_invite(p_email text, p_role text, p_hash text) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.allowed('member.invite') then
    raise exception 'invite is not allowed';
  end if;
  insert into invitations (organization_id, email, role, token_hash, expires_at, invited_by)
  values (app.current_org_id(), p_email, p_role, p_hash, now() + interval '14 days', app.current_user_id());
end $$;

create or replace function app.accept_invite_new(p_hash text, p_name text, p_password_hash text) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  inv invitations%rowtype;
  uid uuid;
begin
  select * into inv from invitations where token_hash = p_hash and used_at is null and expires_at > now() for update;
  if not found then
    raise exception 'invite is invalid';
  end if;
  insert into users (email, name, password_hash) values (inv.email, p_name, p_password_hash) returning id into uid;
  insert into memberships (organization_id, user_id, role) values (inv.organization_id, uid, inv.role);
  update invitations set used_at = now() where id = inv.id;
  return uid;
end $$;

create or replace function app.accept_invite_existing(p_hash text, p_user uuid) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  inv invitations%rowtype;
begin
  select * into inv from invitations where token_hash = p_hash and used_at is null and expires_at > now() for update;
  if not found then
    raise exception 'invite is invalid';
  end if;
  insert into memberships (organization_id, user_id, role) values (inv.organization_id, p_user, inv.role)
  on conflict (organization_id, user_id) do update set role = excluded.role, status = 'active';
  update invitations set used_at = now() where id = inv.id;
  return p_user;
end $$;

create or replace function app.next_number(p_kind text) returns integer
language plpgsql security definer set search_path = public, app as $$
declare
  n integer;
begin
  if app.current_org_id() is null then
    raise exception 'missing org';
  end if;
  insert into counters (organization_id, kind, value)
  values (app.current_org_id(), p_kind, 1)
  on conflict (organization_id, kind) do update set value = counters.value + 1
  returning value into n;
  return n;
end $$;

create or replace function app.my_class_work()
returns table(
  section_name text,
  organization_name text,
  organization_slug text,
  assignment_id uuid,
  assignment_title text,
  due_at timestamptz,
  submitted_at timestamptz,
  score numeric,
  points numeric
)
language sql stable security definer set search_path = public, app as $$
  select s.name, o.name, o.slug, a.id, a.title, a.due_at, sub.submitted_at, g.score, a.points
  from enrollments e
  join sections s on s.id = e.section_id
  join organizations o on o.id = s.organization_id
  join assignments a on a.section_id = s.id and a.published
  left join lateral (
    select submissions.*
    from submissions
    where submissions.assignment_id = a.id and submissions.user_id = app.current_user_id()
    order by attempt desc
    limit 1
  ) sub on true
  left join grades g on g.submission_id = sub.id and g.posted_at is not null and g.excused = false
  where e.user_id = app.current_user_id() and e.status = 'active'
  order by a.due_at nulls last
$$;

create or replace function app.user_is_owner(p_user uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from memberships
    where user_id = p_user and role = 'owner' and status = 'active'
  )
$$;

create or replace function app.purge_due() returns integer
language plpgsql security definer set search_path = public, app as $$
declare
  removed integer;
begin
  delete from organizations where purge_after is not null and purge_after < now();
  get diagnostics removed = row_count;
  return removed;
end $$;

alter table users enable row level security;
alter table sessions enable row level security;
alter table login_challenges enable row level security;
alter table login_attempts enable row level security;
alter table signup_attempts enable row level security;
alter table password_resets enable row level security;
alter table reset_attempts enable row level security;
alter table organizations enable row level security;
alter table memberships enable row level security;
alter table invitations enable row level security;
alter table role_permissions enable row level security;
alter table counters enable row level security;
alter table activity_log enable row level security;
alter table comments enable row level security;
alter table files enable row level security;
alter table farms enable row level security;
alter table fields enable row level security;
alter table crop_seasons enable row level security;
alter table products enable row level security;
alter table equipment enable row level security;
alter table activities enable row level security;
alter table expenses enable row level security;
alter table recommendations enable row level security;
alter table projects enable row level security;
alter table milestones enable row level security;
alter table issues enable row level security;
alter table issue_revisions enable row level security;
alter table issue_dependencies enable row level security;
alter table decisions enable row level security;
alter table decision_revisions enable row level security;
alter table documents enable row level security;
alter table document_revisions enable row level security;
alter table courses enable row level security;
alter table sections enable row level security;
alter table categories enable row level security;
alter table enrollments enable row level security;
alter table assignments enable row level security;
alter table submissions enable row level security;
alter table grades enable row level security;
alter table attendance_sessions enable row level security;
alter table attendance_marks enable row level security;
alter table announcements enable row level security;
alter table resources enable row level security;
alter table study_terms enable row level security;
alter table study_courses enable row level security;
alter table study_meetings enable row level security;
alter table study_assessments enable row level security;
alter table study_sessions enable row level security;
alter table study_readings enable row level security;
alter table study_places enable row level security;
alter table clients enable row level security;
alter table sites enable row level security;
alter table engagements enable row level security;
alter table deliverables enable row level security;
alter table work_logs enable row level security;
alter table practice_expenses enable row level security;

create policy users_select on users for select using (
  id = app.current_user_id()
  or exists (
    select 1
    from memberships mine
    join memberships theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = app.current_user_id()
      and theirs.user_id = users.id
      and mine.status = 'active'
      and theirs.status = 'active'
      and mine.organization_id = app.current_org_id()
  )
);
create policy organizations_select on organizations for select using (
  exists (
    select 1 from memberships m
    where m.organization_id = organizations.id and m.user_id = app.current_user_id() and m.status = 'active'
  )
);
create policy memberships_select on memberships for select using (
  user_id = app.current_user_id()
  or (organization_id = app.current_org_id() and app.in_org(organization_id))
);
create policy role_permissions_select on role_permissions for select using (
  exists (
    select 1 from memberships m
    where m.user_id = app.current_user_id() and m.role = role_permissions.role and m.status = 'active'
  )
);
create policy invitations_select on invitations for select using (
  app.in_org(organization_id) and app.allowed('member.invite')
);
create policy activity_select on activity_log for select using (app.in_org(organization_id) and app.allowed('workspace.read'));
create policy activity_insert on activity_log for insert with check (app.in_org(organization_id) and actor_id = app.current_user_id());
create policy comments_select on comments for select using (app.in_org(organization_id) and app.allowed('workspace.read'));
create policy comments_insert on comments for insert with check (
  app.in_org(organization_id) and author_id = app.current_user_id() and app.allowed('workspace.read')
);
create policy files_select on files for select using (app.in_org(organization_id) and app.allowed('workspace.read'));
create policy files_insert on files for insert with check (app.in_org(organization_id) and app.allowed('file.write'));

create policy farms_select on farms for select using (app.in_org(organization_id) and app.allowed('field.read'));
create policy farms_insert on farms for insert with check (app.in_org(organization_id) and app.allowed('field.write'));
create policy fields_select on fields for select using (app.in_org(organization_id) and app.allowed('field.read'));
create policy fields_insert on fields for insert with check (app.in_org(organization_id) and app.allowed('field.write'));
create policy fields_update on fields for update using (app.in_org(organization_id) and app.allowed('field.write'));
create policy seasons_select on crop_seasons for select using (app.in_org(organization_id) and app.allowed('field.read'));
create policy seasons_insert on crop_seasons for insert with check (app.in_org(organization_id) and app.allowed('field.write'));
create policy products_select on products for select using (app.in_org(organization_id) and app.allowed('stock.read'));
create policy products_insert on products for insert with check (app.in_org(organization_id) and app.allowed('stock.write'));
create policy equipment_all on equipment for all using (app.in_org(organization_id) and app.allowed('field.read'))
  with check (app.in_org(organization_id) and app.allowed('field.write'));
create policy activities_select on activities for select using (app.in_org(organization_id) and app.allowed('field.read'));
create policy activities_insert on activities for insert with check (app.in_org(organization_id) and app.allowed('activity.write'));
create policy expenses_select on expenses for select using (app.in_org(organization_id) and app.allowed('finance.read'));
create policy expenses_insert on expenses for insert with check (app.in_org(organization_id) and app.allowed('finance.write'));
create policy recommendations_select on recommendations for select using (app.in_org(organization_id) and app.allowed('field.read'));
create policy recommendations_insert on recommendations for insert with check (
  app.in_org(organization_id) and app.allowed('recommendation.write') and author_id = app.current_user_id()
);

create policy projects_select on projects for select using (app.in_org(organization_id) and app.allowed('project.read'));
create policy projects_insert on projects for insert with check (app.in_org(organization_id) and app.allowed('project.write'));
create policy milestones_select on milestones for select using (app.in_org(organization_id) and app.allowed('project.read'));
create policy milestones_insert on milestones for insert with check (app.in_org(organization_id) and app.allowed('project.write'));
create policy issues_select on issues for select using (app.in_org(organization_id) and app.allowed('project.read'));
create policy issues_insert on issues for insert with check (app.in_org(organization_id) and app.allowed('issue.write'));
create policy issues_update on issues for update using (app.in_org(organization_id) and app.allowed('issue.write'));
create policy issue_revisions_select on issue_revisions for select using (app.in_org(organization_id) and app.allowed('project.read'));
create policy issue_revisions_insert on issue_revisions for insert with check (app.in_org(organization_id) and app.allowed('issue.write'));
create policy dependencies_select on issue_dependencies for select using (app.in_org(organization_id) and app.allowed('project.read'));
create policy dependencies_insert on issue_dependencies for insert with check (app.in_org(organization_id) and app.allowed('issue.write'));
create policy decisions_select on decisions for select using (
  app.in_org(organization_id) and (app.allowed('project.read') or app.allowed('client.read') or app.allowed('decision.write'))
);
create policy decisions_insert on decisions for insert with check (app.in_org(organization_id) and app.allowed('decision.write'));
create policy decisions_update on decisions for update using (app.in_org(organization_id) and app.allowed('decision.write'));
create policy decision_revisions_select on decision_revisions for select using (
  app.in_org(organization_id) and (app.allowed('project.read') or app.allowed('client.read') or app.allowed('decision.write'))
);
create policy decision_revisions_insert on decision_revisions for insert with check (app.in_org(organization_id) and app.allowed('decision.write'));
create policy documents_select on documents for select using (app.in_org(organization_id) and app.allowed('project.read'));
create policy documents_insert on documents for insert with check (app.in_org(organization_id) and app.allowed('project.write'));
create policy document_revisions_select on document_revisions for select using (app.in_org(organization_id) and app.allowed('project.read'));
create policy document_revisions_insert on document_revisions for insert with check (app.in_org(organization_id) and app.allowed('project.write'));

create policy courses_select on courses for select using (app.in_org(organization_id) and app.allowed('class.read'));
create policy courses_insert on courses for insert with check (app.in_org(organization_id) and app.allowed('class.write'));
create policy sections_select on sections for select using (
  app.in_org(organization_id) and (
    app.allowed('gradebook.read') or app.allowed('class.write')
    or exists (
      select 1 from enrollments e
      where e.section_id = sections.id and e.user_id = app.current_user_id() and e.status = 'active'
    )
  )
);
create policy sections_insert on sections for insert with check (app.in_org(organization_id) and app.allowed('class.write'));
create policy categories_select on categories for select using (app.in_org(organization_id) and app.allowed('class.read'));
create policy categories_insert on categories for insert with check (app.in_org(organization_id) and app.allowed('class.write'));
create policy enrollments_select on enrollments for select using (
  app.in_org(organization_id) and (app.allowed('gradebook.read') or app.allowed('class.write') or user_id = app.current_user_id())
);
create policy enrollments_insert on enrollments for insert with check (app.in_org(organization_id) and app.allowed('class.write'));
create policy enrollments_update on enrollments for update using (app.in_org(organization_id) and app.allowed('class.write'));
create policy assignments_select on assignments for select using (
  app.in_org(organization_id) and exists (select 1 from sections s where s.id = assignments.section_id)
);
create policy assignments_insert on assignments for insert with check (app.in_org(organization_id) and app.allowed('class.write'));
create policy submissions_select on submissions for select using (
  app.in_org(organization_id) and (app.allowed('gradebook.read') or user_id = app.current_user_id())
);
create policy submissions_insert on submissions for insert with check (
  app.in_org(organization_id)
  and user_id = app.current_user_id()
  and app.allowed('assignment.submit')
  and exists (
    select 1 from assignments a
    join enrollments e on e.section_id = a.section_id
    where a.id = assignment_id and a.published and e.user_id = app.current_user_id() and e.status = 'active'
  )
);
create policy grades_select on grades for select using (
  app.in_org(organization_id) and (
    app.allowed('gradebook.read')
    or (
      posted_at is not null and exists (
        select 1 from submissions s where s.id = grades.submission_id and s.user_id = app.current_user_id()
      )
    )
  )
);
create policy grades_insert on grades for insert with check (app.in_org(organization_id) and app.allowed('grade.write'));
create policy grades_update on grades for update using (app.in_org(organization_id) and app.allowed('grade.write'));
create policy attendance_sessions_select on attendance_sessions for select using (
  app.in_org(organization_id) and (app.allowed('attendance.write') or app.allowed('gradebook.read') or app.allowed('class.read'))
);
create policy attendance_sessions_insert on attendance_sessions for insert with check (app.in_org(organization_id) and app.allowed('attendance.write'));
create policy attendance_marks_select on attendance_marks for select using (
  app.in_org(organization_id) and (app.allowed('attendance.write') or app.allowed('gradebook.read') or user_id = app.current_user_id())
);
create policy attendance_marks_insert on attendance_marks for insert with check (app.in_org(organization_id) and app.allowed('attendance.write'));
create policy attendance_marks_update on attendance_marks for update using (app.in_org(organization_id) and app.allowed('attendance.write'));
create policy announcements_select on announcements for select using (app.in_org(organization_id) and app.allowed('class.read'));
create policy announcements_insert on announcements for insert with check (app.in_org(organization_id) and app.allowed('class.write'));
create policy resources_select on resources for select using (app.in_org(organization_id) and app.allowed('class.read'));
create policy resources_insert on resources for insert with check (app.in_org(organization_id) and app.allowed('class.write'));

create policy study_terms_all on study_terms for all using (app.in_org(organization_id) and app.allowed('study.read'))
  with check (app.in_org(organization_id) and app.allowed('study.write'));
create policy study_courses_all on study_courses for all using (app.in_org(organization_id) and app.allowed('study.read'))
  with check (app.in_org(organization_id) and app.allowed('study.write'));
create policy study_meetings_all on study_meetings for all using (app.in_org(organization_id) and app.allowed('study.read'))
  with check (app.in_org(organization_id) and app.allowed('study.write'));
create policy study_assessments_all on study_assessments for all using (app.in_org(organization_id) and app.allowed('study.read'))
  with check (app.in_org(organization_id) and app.allowed('study.write'));
create policy study_sessions_all on study_sessions for all using (app.in_org(organization_id) and app.allowed('study.read'))
  with check (app.in_org(organization_id) and app.allowed('study.write'));
create policy study_readings_all on study_readings for all using (app.in_org(organization_id) and app.allowed('study.read'))
  with check (app.in_org(organization_id) and app.allowed('study.write'));
create policy study_places_all on study_places for all using (app.in_org(organization_id) and app.allowed('study.read'))
  with check (app.in_org(organization_id) and app.allowed('study.write'));

create policy clients_select on clients for select using (app.in_org(organization_id) and app.allowed('client.read'));
create policy clients_insert on clients for insert with check (app.in_org(organization_id) and app.allowed('client.write'));
create policy sites_select on sites for select using (app.in_org(organization_id) and app.allowed('client.read'));
create policy sites_insert on sites for insert with check (app.in_org(organization_id) and app.allowed('client.write'));
create policy engagements_select on engagements for select using (app.in_org(organization_id) and app.allowed('client.read'));
create policy engagements_insert on engagements for insert with check (app.in_org(organization_id) and app.allowed('client.write'));
create policy deliverables_select on deliverables for select using (app.in_org(organization_id) and app.allowed('client.read'));
create policy deliverables_insert on deliverables for insert with check (app.in_org(organization_id) and app.allowed('client.write'));
create policy work_logs_select on work_logs for select using (app.in_org(organization_id) and (app.allowed('client.read') or app.allowed('time.write')));
create policy work_logs_insert on work_logs for insert with check (app.in_org(organization_id) and app.allowed('time.write'));
create policy practice_expenses_select on practice_expenses for select using (app.in_org(organization_id) and app.allowed('client.write'));
create policy practice_expenses_insert on practice_expenses for insert with check (app.in_org(organization_id) and app.allowed('client.write'));

do $$ begin
  execute format('grant connect on database %I to fieldworks_app', current_database());
end $$;

grant usage on schema public, app, extensions to fieldworks_app;
grant execute on all functions in schema extensions to fieldworks_app;
grant select, insert, update, delete on all tables in schema public to fieldworks_app;
grant usage, select on all sequences in schema public to fieldworks_app;
grant execute on all functions in schema app to fieldworks_app;

commit;
