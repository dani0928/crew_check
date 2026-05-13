-- 러닝크루 출석 체크 DB 스키마

create table members (
  id bigint generated always as identity primary key,
  name text not null,
  created_at timestamptz default now()
);

create table sessions (
  id bigint generated always as identity primary key,
  date date not null unique,
  created_at timestamptz default now()
);

create table attendance (
  id bigint generated always as identity primary key,
  session_id bigint not null references sessions(id) on delete cascade,
  member_id bigint not null references members(id) on delete cascade,
  checked_in_at timestamptz default now(),
  unique(session_id, member_id)
);

-- RLS 활성화 (anon key로 읽기/쓰기 허용)
alter table members enable row level security;
alter table sessions enable row level security;
alter table attendance enable row level security;

create policy "allow all" on members for all using (true) with check (true);
create policy "allow all" on sessions for all using (true) with check (true);
create policy "allow all" on attendance for all using (true) with check (true);
