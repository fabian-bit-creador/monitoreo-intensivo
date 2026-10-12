-- Monitoreo Intensivo · esquema inicial (ADR 0003).
--
-- Principios:
-- * Cada tabla tiene RLS. Los usuarios autenticados solo LEEN lo que su rol
--   y sus cursos asignados permiten.
-- * Nadie escribe directamente en las tablas: los cambios entran por funciones
--   que verifican auth.uid(), aplican las reglas del dominio y son
--   idempotentes cuando el cliente envía su propio identificador.
-- * La historia no se borra: no hay permiso DELETE para usuarios y archivar
--   cambia estados.

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 200),
  created_at timestamptz not null default now()
);

create table public.school_memberships (
  school_id uuid not null references public.schools (id),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'coordinator', 'teacher')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (school_id, user_id)
);

create table public.school_invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  role text not null check (role in ('admin', 'coordinator', 'teacher')),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null
);
create unique index school_invitations_pending_key
  on public.school_invitations (school_id, email) where accepted_at is null;

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  academic_year integer not null check (academic_year between 2000 and 2100),
  archived_at timestamptz,
  legacy_id text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, legacy_id)
);
-- Un nombre de curso no se repite en el mismo año entre los cursos vigentes.
create unique index courses_active_name_key
  on public.courses (school_id, academic_year, lower(btrim(name))) where archived_at is null;

create table public.course_teachers (
  school_id uuid not null,
  course_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (course_id, user_id),
  foreign key (school_id, course_id) references public.courses (school_id, id),
  foreign key (school_id, user_id) references public.school_memberships (school_id, user_id) on delete cascade
);
create index course_teachers_user_idx on public.course_teachers (user_id);

-- La persona, que puede tener matrículas en distintos cursos y años.
create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 200),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  legacy_id text,
  created_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, legacy_id)
);

-- La matrícula en un curso: N° de lista y estado. La aplicación la trata como
-- «estudiante del curso».
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  course_id uuid not null,
  student_id uuid not null,
  list_number integer check (list_number > 0),
  active boolean not null default true,
  enrolled_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  legacy_id text,
  unique (course_id, student_id),
  unique (course_id, id),
  unique (school_id, legacy_id),
  foreign key (school_id, course_id) references public.courses (school_id, id),
  foreign key (school_id, student_id) references public.students (school_id, id)
);
create unique index enrollments_active_number_key
  on public.enrollments (course_id, list_number) where active and list_number is not null;
create index enrollments_student_idx on public.enrollments (student_id);

create table public.room_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  course_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '',
  row_count integer not null check (row_count between 1 and 20),
  column_count integer not null check (column_count between 1 and 20),
  active boolean not null default true,
  legacy_id text,
  created_at timestamptz not null default now(),
  unique (course_id, id),
  unique (school_id, legacy_id),
  foreign key (school_id, course_id) references public.courses (school_id, id)
);

-- Puestos existentes de una plantilla. Un pasillo es un puesto que no existe.
create table public.room_slots (
  template_id uuid not null references public.room_templates (id),
  seat_row integer not null check (seat_row between 0 and 19),
  seat_col integer not null check (seat_col between 0 and 19),
  status text not null default 'available' check (status in ('available', 'unavailable')),
  primary key (template_id, seat_row, seat_col)
);

-- Puesto vigente de cada matrícula por plantilla. La unicidad del puesto se
-- verifica al final de la transacción para permitir intercambios.
create table public.seat_assignments (
  course_id uuid not null,
  template_id uuid not null,
  enrollment_id uuid not null,
  seat_row integer not null,
  seat_col integer not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (template_id, enrollment_id),
  constraint seat_assignments_seat_key unique (template_id, seat_row, seat_col)
    deferrable initially deferred,
  foreign key (course_id, template_id) references public.room_templates (course_id, id),
  foreign key (course_id, enrollment_id) references public.enrollments (course_id, id),
  foreign key (template_id, seat_row, seat_col)
    references public.room_slots (template_id, seat_row, seat_col)
);

-- `id` lo genera el cliente: reintentar «iniciar clase» no la duplica.
-- `seq` es el número creciente que la aplicación usa como id visible.
create table public.class_sessions (
  id uuid primary key,
  seq bigint generated always as identity unique,
  school_id uuid not null,
  course_id uuid not null,
  teacher_id uuid not null references public.profiles (id),
  room_template_id uuid not null,
  date date not null,
  module text not null check (char_length(btrim(module)) between 1 and 200),
  objective text not null check (char_length(btrim(objective)) between 1 and 2000),
  success_criteria text not null check (char_length(btrim(success_criteria)) between 1 and 2000),
  status text not null default 'active' check (status in ('active', 'closed')),
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  version integer not null default 1,
  legacy_id text,
  created_at timestamptz not null default now(),
  unique (course_id, id),
  unique (school_id, legacy_id),
  foreign key (school_id, course_id) references public.courses (school_id, id),
  foreign key (course_id, room_template_id) references public.room_templates (course_id, id),
  check ((status = 'closed') = (closed_at is not null))
);
create index class_sessions_teacher_idx on public.class_sessions (teacher_id);
create index class_sessions_course_idx on public.class_sessions (course_id);

-- Nómina de cada clase: fotografía de N°, nombre y puesto al iniciarla, más
-- la asistencia. Cambiar después la nómina no altera esta fotografía.
create table public.session_students (
  course_id uuid not null,
  session_id uuid not null,
  enrollment_id uuid not null,
  list_number integer,
  full_name text not null,
  display_name text not null,
  seat_row integer,
  seat_col integer,
  present boolean not null default true,
  present_changed_at timestamptz,
  primary key (session_id, enrollment_id),
  foreign key (course_id, session_id) references public.class_sessions (course_id, id),
  foreign key (course_id, enrollment_id) references public.enrollments (course_id, id)
);
create index session_students_enrollment_idx on public.session_students (enrollment_id);

-- Registro I/R/C. Solo inserción. `id` lo genera el cliente (idempotencia),
-- `observed_at` es la hora del registro en el dispositivo y `seq` desempata.
-- La clave foránea a session_students exige que el estudiante pertenezca a la
-- nómina de la clase.
create table public.observations (
  id uuid primary key,
  seq bigint generated always as identity unique,
  session_id uuid not null,
  enrollment_id uuid not null,
  round smallint not null check (round between 1 and 3),
  code text not null check (code in ('I', 'R', 'C')),
  progress smallint not null,
  note text check (note is null or char_length(note) <= 500),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.profiles (id) on delete set null,
  legacy_id text,
  unique (session_id, legacy_id),
  foreign key (session_id, enrollment_id)
    references public.session_students (session_id, enrollment_id),
  check (
    (code = 'I' and progress = 0)
    or (code = 'C' and progress = 100)
    or (code = 'R' and progress between 1 and 99)
  )
);
create index observations_session_idx on public.observations (session_id, observed_at, seq);

-- ---------------------------------------------------------------------------
-- 2. Funciones de permisos (esquema app, no expuesto por la API)
-- ---------------------------------------------------------------------------

create function app.require_uid() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Inicia sesión para continuar.' using errcode = '28000';
  end if;
  return v_uid;
end;
$$;

create function app.is_member(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.school_memberships m
    where m.school_id = p_school and m.user_id = auth.uid() and m.active
  );
$$;

create function app.has_role(p_school uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.school_memberships m
    where m.school_id = p_school and m.user_id = auth.uid() and m.active and m.role = any (p_roles)
  );
$$;

-- Enseña el curso: está asignado y sigue siendo miembro activo.
create function app.teaches(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.course_teachers t
    join public.school_memberships m
      on m.school_id = t.school_id and m.user_id = t.user_id and m.active
    where t.course_id = p_course and t.user_id = auth.uid()
  );
$$;

create function app.can_view_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.teaches(p_course) or exists (
    select 1 from public.courses c
    where c.id = p_course and app.has_role(c.school_id, array['admin', 'coordinator'])
  );
$$;

create function app.can_manage_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course and app.has_role(c.school_id, array['admin'])
  );
$$;

-- Ve una clase quien la dicta (si sigue siendo miembro) y la coordinación o
-- administración del establecimiento.
create function app.can_view_session(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.class_sessions s
    where s.id = p_session
      and (
        (s.teacher_id = auth.uid() and app.is_member(s.school_id))
        or app.has_role(s.school_id, array['admin', 'coordinator'])
      )
  );
$$;

create function app.can_view_student(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrollments e
    where e.student_id = p_student and app.can_view_course(e.course_id)
  );
$$;

create function app.can_view_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user = auth.uid() or exists (
    select 1 from public.school_memberships m
    where m.user_id = p_user and app.has_role(m.school_id, array['admin', 'coordinator'])
  );
$$;

-- Igual que displayName() de la aplicación: «Ana Rivas Soto» → «Ana R.».
create function app.display_name(p_full_name text) returns text
language sql immutable set search_path = '' as $$
  select case
    when coalesce(array_length(parts, 1), 0) = 0 then ''
    when array_length(parts, 1) = 1 then parts[1]
    else parts[1] || ' ' || left(parts[2], 1) || '.'
  end
  from (select regexp_split_to_array(btrim(p_full_name), '\s+') as parts) as split;
$$;

-- Lugar de la sala habitual: 7 × 6 sin asignaciones.
create function app.add_default_template(p_school uuid, p_course uuid, p_course_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_template uuid;
begin
  insert into public.room_templates (school_id, course_id, name, description, row_count, column_count)
  values (p_school, p_course, 'Sala habitual', 'Distribución habitual de ' || p_course_name, 7, 6)
  returning id into v_template;
  insert into public.room_slots (template_id, seat_row, seat_col)
  select v_template, r, c from generate_series(0, 6) as r, generate_series(0, 5) as c;
  return v_template;
end;
$$;

-- Valida una nómina [{number, fullName}]: de 1 a 80, nombres no vacíos y N°
-- positivos sin repetir.
create function app.validate_roster(p_entries jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare
  v_count integer;
begin
  if jsonb_typeof(p_entries) <> 'array' then
    raise exception 'La nómina debe ser una lista.';
  end if;
  v_count := jsonb_array_length(p_entries);
  if v_count = 0 then
    raise exception 'No se encontraron nombres para importar.';
  end if;
  if v_count > 80 then
    raise exception 'Una nómina puede tener hasta 80 estudiantes.';
  end if;
  -- CASE fija el orden de evaluación: no se convierte a número lo que no lo es.
  if exists (
    select 1 from jsonb_array_elements(p_entries) e
    where coalesce(btrim(e ->> 'fullName'), '') = ''
       or case
            when jsonb_typeof(e -> 'number') = 'number'
              then (e ->> 'number')::numeric < 1
                or (e ->> 'number')::numeric <> trunc((e ->> 'number')::numeric)
            else true
          end
  ) then
    raise exception 'Cada estudiante necesita un nombre y un N° de lista válido.';
  end if;
  if (select count(distinct (e ->> 'number')::integer) from jsonb_array_elements(p_entries) e) <> v_count then
    raise exception 'Hay N° de lista repetidos.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Perfiles: uno por usuario de Auth
-- ---------------------------------------------------------------------------

create function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

insert into public.profiles (id, full_name)
select id, coalesce(raw_user_meta_data ->> 'full_name', '') from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. RLS: solo lectura según rol y asignación
-- ---------------------------------------------------------------------------

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.school_memberships enable row level security;
alter table public.school_invitations enable row level security;
alter table public.courses enable row level security;
alter table public.course_teachers enable row level security;
alter table public.students enable row level security;
alter table public.enrollments enable row level security;
alter table public.room_templates enable row level security;
alter table public.room_slots enable row level security;
alter table public.seat_assignments enable row level security;
alter table public.class_sessions enable row level security;
alter table public.session_students enable row level security;
alter table public.observations enable row level security;

create policy "Miembros ven su establecimiento" on public.schools
  for select to authenticated using (app.is_member(id));
create policy "Perfil propio y del equipo para administración" on public.profiles
  for select to authenticated using (app.can_view_profile(id));
create policy "Membresía propia; administración y coordinación ven todas" on public.school_memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or app.has_role(school_id, array['admin', 'coordinator']));
create policy "Administración ve las invitaciones" on public.school_invitations
  for select to authenticated using (app.has_role(school_id, array['admin']));
create policy "Cursos visibles" on public.courses
  for select to authenticated using (app.can_view_course(id));
create policy "Asignaciones de cursos visibles" on public.course_teachers
  for select to authenticated using (app.can_view_course(course_id));
create policy "Estudiantes de cursos visibles" on public.students
  for select to authenticated using (app.can_view_student(id));
create policy "Matrículas de cursos visibles" on public.enrollments
  for select to authenticated using (app.can_view_course(course_id));
create policy "Plantillas de cursos visibles" on public.room_templates
  for select to authenticated using (app.can_view_course(course_id));
create policy "Puestos de plantillas visibles" on public.room_slots
  for select to authenticated using (
    exists (select 1 from public.room_templates t where t.id = template_id and app.can_view_course(t.course_id))
  );
create policy "Distribución de cursos visibles" on public.seat_assignments
  for select to authenticated using (app.can_view_course(course_id));
create policy "Clases propias; administración y coordinación ven todas" on public.class_sessions
  for select to authenticated using (app.can_view_session(id));
create policy "Nómina y asistencia de clases visibles" on public.session_students
  for select to authenticated using (app.can_view_session(session_id));
create policy "Observaciones de clases visibles" on public.observations
  for select to authenticated using (app.can_view_session(session_id));

-- Supabase concede por defecto todos los permisos a anon y authenticated en
-- el esquema public: aquí se dejan solo las lecturas.
revoke all on table
  public.schools, public.profiles, public.school_memberships, public.school_invitations,
  public.courses, public.course_teachers, public.students, public.enrollments,
  public.room_templates, public.room_slots, public.seat_assignments, public.class_sessions,
  public.session_students, public.observations
from anon, authenticated;
grant select on table
  public.schools, public.profiles, public.school_memberships, public.school_invitations,
  public.courses, public.course_teachers, public.students, public.enrollments,
  public.room_templates, public.room_slots, public.seat_assignments, public.class_sessions,
  public.session_students, public.observations
to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Operaciones (RPC). Verifican permisos con auth.uid().
-- ---------------------------------------------------------------------------

-- Iniciar clase: crea la clase y la fotografía de su nómina. Reintentar con
-- el mismo id devuelve la clase existente.
create function public.start_session(
  p_id uuid,
  p_course_id uuid,
  p_room_template_id uuid,
  p_date date,
  p_module text,
  p_objective text,
  p_success_criteria text
) returns public.class_sessions
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_uid();
  v_course public.courses;
  v_session public.class_sessions;
begin
  select * into v_course from public.courses where id = p_course_id and archived_at is null;
  if not found or not app.teaches(p_course_id) then
    raise exception 'No tienes asignado este curso.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.room_templates t
    where t.id = p_room_template_id and t.course_id = p_course_id and t.active
  ) then
    raise exception 'La plantilla de sala no corresponde al curso.';
  end if;
  if p_date is null then
    raise exception 'La fecha es obligatoria.';
  end if;
  if not exists (select 1 from public.enrollments e where e.course_id = p_course_id and e.active) then
    raise exception 'El curso no tiene estudiantes activos.';
  end if;

  insert into public.class_sessions (
    id, school_id, course_id, teacher_id, room_template_id, date, module, objective, success_criteria
  ) values (
    p_id, v_course.school_id, p_course_id, v_uid, p_room_template_id, p_date,
    coalesce(nullif(btrim(p_module), ''), 'Práctica independiente'),
    coalesce(nullif(btrim(p_objective), ''), 'Actividad de práctica independiente'),
    coalesce(nullif(btrim(p_success_criteria), ''), 'Cumple los criterios de éxito definidos para la actividad.')
  )
  on conflict (id) do nothing
  returning * into v_session;

  if v_session.id is null then
    select * into v_session from public.class_sessions where id = p_id;
    if v_session.teacher_id <> v_uid or v_session.course_id <> p_course_id then
      raise exception 'Ese identificador de clase ya está en uso.';
    end if;
    return v_session;
  end if;

  insert into public.session_students (
    course_id, session_id, enrollment_id, list_number, full_name, display_name, seat_row, seat_col
  )
  select e.course_id, v_session.id, e.id, e.list_number, s.full_name, s.display_name, a.seat_row, a.seat_col
  from public.enrollments e
  join public.students s on s.id = e.student_id
  left join public.seat_assignments a
    on a.template_id = p_room_template_id and a.enrollment_id = e.id
  where e.course_id = p_course_id and e.active;

  return v_session;
end;
$$;

-- La clase debe ser propia, estar en curso y seguir siendo miembro. Bloquea
-- la fila para que un cierre simultáneo espere.
create function app.lock_own_active_session(p_session uuid) returns public.class_sessions
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.class_sessions;
begin
  select * into v_session from public.class_sessions where id = p_session for share;
  if not found or v_session.teacher_id <> app.require_uid() or not app.is_member(v_session.school_id) then
    raise exception 'No puedes modificar esta clase.' using errcode = '42501';
  end if;
  if v_session.status <> 'active' then
    raise exception 'La clase está cerrada. Reábrela para seguir registrando.';
  end if;
  return v_session;
end;
$$;

-- Registrar observación. Reintentar con el mismo id no la duplica.
create function public.record_observation(
  p_id uuid,
  p_session_id uuid,
  p_enrollment_id uuid,
  p_round integer,
  p_code text,
  p_progress integer,
  p_note text,
  p_observed_at timestamptz
) returns public.observations
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_uid();
  v_observation public.observations;
  v_observed timestamptz := least(coalesce(p_observed_at, now()), now() + interval '2 minutes');
begin
  select * into v_observation from public.observations where id = p_id;
  if found then
    if v_observation.session_id <> p_session_id or v_observation.enrollment_id <> p_enrollment_id then
      raise exception 'Ese identificador de observación ya está en uso.';
    end if;
    return v_observation;
  end if;

  perform app.lock_own_active_session(p_session_id);
  if not exists (
    select 1 from public.session_students
    where session_id = p_session_id and enrollment_id = p_enrollment_id
  ) then
    raise exception 'El estudiante no pertenece a la nómina de esta clase.';
  end if;
  if p_code is null or p_code not in ('I', 'R', 'C') then
    raise exception 'El código debe ser I, R o C.';
  end if;

  insert into public.observations (
    id, session_id, enrollment_id, round, code, progress, note, observed_at, recorded_by
  ) values (
    p_id, p_session_id, p_enrollment_id,
    greatest(1, least(3, coalesce(p_round, 1))),
    p_code,
    case p_code
      when 'I' then 0
      when 'C' then 100
      else greatest(1, least(99, coalesce(nullif(p_progress, 0), 50)))
    end,
    nullif(btrim(coalesce(p_note, '')), ''),
    v_observed,
    v_uid
  )
  on conflict (id) do nothing
  returning * into v_observation;

  if v_observation.id is null then
    select * into v_observation from public.observations where id = p_id;
    return v_observation;
  end if;

  -- Registrar a un estudiante lo deja presente, salvo que una marca de
  -- asistencia posterior diga otra cosa.
  update public.session_students
  set present = true, present_changed_at = v_observed
  where session_id = p_session_id and enrollment_id = p_enrollment_id
    and (present_changed_at is null or present_changed_at <= v_observed);

  return v_observation;
end;
$$;

-- Modificar asistencia. Gana la marca más reciente: un reintento atrasado no
-- pisa un cambio posterior.
create function public.set_attendance(
  p_session_id uuid,
  p_enrollment_id uuid,
  p_present boolean,
  p_changed_at timestamptz
) returns public.session_students
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.session_students;
  v_changed timestamptz := least(coalesce(p_changed_at, now()), now() + interval '2 minutes');
begin
  perform app.lock_own_active_session(p_session_id);
  if p_present is null then
    raise exception 'Indica si el estudiante está presente.';
  end if;
  update public.session_students
  set present = p_present, present_changed_at = v_changed
  where session_id = p_session_id and enrollment_id = p_enrollment_id
    and (present_changed_at is null or present_changed_at <= v_changed)
  returning * into v_row;
  if v_row.session_id is null then
    select * into v_row from public.session_students
    where session_id = p_session_id and enrollment_id = p_enrollment_id;
    if not found then
      raise exception 'No se encontró al estudiante en esta clase.';
    end if;
  end if;
  return v_row;
end;
$$;

-- Cerrar o reabrir. Es idempotente: repetir el mismo estado no cambia nada.
create function public.set_session_status(p_session_id uuid, p_status text)
returns public.class_sessions
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.class_sessions;
begin
  if p_status is null or p_status not in ('active', 'closed') then
    raise exception 'Estado de clase no válido.';
  end if;
  select * into v_session from public.class_sessions where id = p_session_id for update;
  if not found or v_session.teacher_id <> app.require_uid() or not app.is_member(v_session.school_id) then
    raise exception 'No puedes modificar esta clase.' using errcode = '42501';
  end if;
  if v_session.status = p_status then
    return v_session;
  end if;
  update public.class_sessions
  set status = p_status,
      closed_at = case when p_status = 'closed' then now() end,
      version = version + 1
  where id = p_session_id
  returning * into v_session;
  return v_session;
end;
$$;

-- Plantilla cuyo curso se puede ordenar: quien lo enseña o administración.
create function app.lock_arrangeable_template(p_template uuid) returns public.room_templates
language plpgsql security definer set search_path = '' as $$
declare
  v_template public.room_templates;
begin
  perform app.require_uid();
  select * into v_template from public.room_templates where id = p_template;
  if not found or not (app.teaches(v_template.course_id) or app.can_manage_course(v_template.course_id)) then
    raise exception 'No puedes ordenar esta sala.' using errcode = '42501';
  end if;
  -- Un movimiento a la vez por plantilla.
  perform pg_advisory_xact_lock(hashtextextended(p_template::text, 0));
  return v_template;
end;
$$;

-- Mover o intercambiar puestos, igual que la aplicación local. Sin fila ni
-- columna, deja al estudiante sin puesto.
create function public.move_seat(
  p_template_id uuid,
  p_enrollment_id uuid,
  p_row integer,
  p_col integer
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_uid();
  v_template public.room_templates := app.lock_arrangeable_template(p_template_id);
  v_origin public.seat_assignments;
  v_occupant public.seat_assignments;
begin
  if not exists (
    select 1 from public.enrollments e
    where e.id = p_enrollment_id and e.course_id = v_template.course_id and e.active
  ) then
    raise exception 'El estudiante no pertenece a este curso.';
  end if;

  select * into v_origin from public.seat_assignments
  where template_id = p_template_id and enrollment_id = p_enrollment_id;

  if p_row is null or p_col is null then
    delete from public.seat_assignments
    where template_id = p_template_id and enrollment_id = p_enrollment_id;
    return;
  end if;

  if not exists (
    select 1 from public.room_slots
    where template_id = p_template_id and seat_row = p_row and seat_col = p_col and status = 'available'
  ) then
    raise exception 'Ese puesto no está disponible.';
  end if;

  select * into v_occupant from public.seat_assignments
  where template_id = p_template_id and seat_row = p_row and seat_col = p_col;
  if v_occupant.enrollment_id = p_enrollment_id then
    return;
  end if;
  if v_occupant.enrollment_id is not null then
    if v_origin.enrollment_id is not null then
      update public.seat_assignments
      set seat_row = v_origin.seat_row, seat_col = v_origin.seat_col, updated_at = now(), updated_by = v_uid
      where template_id = p_template_id and enrollment_id = v_occupant.enrollment_id;
    else
      delete from public.seat_assignments
      where template_id = p_template_id and enrollment_id = v_occupant.enrollment_id;
    end if;
  end if;

  insert into public.seat_assignments (course_id, template_id, enrollment_id, seat_row, seat_col, updated_by)
  values (v_template.course_id, p_template_id, p_enrollment_id, p_row, p_col, v_uid)
  on conflict (template_id, enrollment_id)
  do update set seat_row = excluded.seat_row, seat_col = excluded.seat_col,
                updated_at = now(), updated_by = excluded.updated_by;
end;
$$;

-- Asignar puestos por N°: ubica a quienes no tienen puesto en los puestos
-- libres, en orden de lectura de la sala. Es una acción explícita.
create function public.assign_seats_by_number(p_template_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_uid();
  v_template public.room_templates := app.lock_arrangeable_template(p_template_id);
  v_count integer;
begin
  with free_slots as (
    select s.seat_row, s.seat_col, row_number() over (order by s.seat_row, s.seat_col) as position
    from public.room_slots s
    where s.template_id = p_template_id and s.status = 'available'
      and not exists (
        select 1 from public.seat_assignments a
        where a.template_id = p_template_id and a.seat_row = s.seat_row and a.seat_col = s.seat_col
      )
  ),
  unseated as (
    select e.id, row_number() over (order by e.list_number nulls last, st.full_name, e.id) as position
    from public.enrollments e
    join public.students st on st.id = e.student_id
    where e.course_id = v_template.course_id and e.active
      and not exists (
        select 1 from public.seat_assignments a
        where a.template_id = p_template_id and a.enrollment_id = e.id
      )
  )
  insert into public.seat_assignments (course_id, template_id, enrollment_id, seat_row, seat_col, updated_by)
  select v_template.course_id, p_template_id, u.id, f.seat_row, f.seat_col, v_uid
  from unseated u join free_slots f using (position);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Crear un curso con su nómina y la sala habitual. Administración; queda
-- asignada como docente del curso.
create function public.create_course(p_school_id uuid, p_name text, p_entries jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_uid();
  v_course uuid;
  v_template uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_entry jsonb;
  v_student uuid;
begin
  if not app.has_role(p_school_id, array['admin']) then
    raise exception 'Solo administración puede crear cursos.' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'Escribe el nombre del curso.';
  end if;
  perform app.validate_roster(p_entries);

  begin
    insert into public.courses (school_id, name, academic_year, created_by)
    values (p_school_id, v_name, extract(year from now() at time zone 'America/Santiago')::integer, v_uid)
    returning id into v_course;
  exception when unique_violation then
    raise exception 'Ya existe el curso «%» este año. Actualiza su nómina en vez de crear otro.', v_name;
  end;

  v_template := app.add_default_template(p_school_id, v_course, v_name);
  insert into public.course_teachers (school_id, course_id, user_id) values (p_school_id, v_course, v_uid);

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    insert into public.students (school_id, full_name, display_name)
    values (p_school_id, btrim(v_entry ->> 'fullName'), app.display_name(v_entry ->> 'fullName'))
    returning id into v_student;
    insert into public.enrollments (school_id, course_id, student_id, list_number)
    values (p_school_id, v_course, v_student, (v_entry ->> 'number')::integer);
  end loop;

  return jsonb_build_object('courseId', v_course, 'roomTemplateId', v_template);
end;
$$;

-- Actualizar la nómina con un plan calculado en la aplicación:
-- {updates: [{enrollmentId, number, fullName}], adds: [{number, fullName}],
--  withdraws: [enrollmentId]}. Conserva identidades; quien sale se archiva y
-- libera su puesto. Las clases ya iniciadas conservan su fotografía.
create function public.update_roster(p_course_id uuid, p_plan jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_course public.courses;
  v_updates jsonb := coalesce(p_plan -> 'updates', '[]'::jsonb);
  v_adds jsonb := coalesce(p_plan -> 'adds', '[]'::jsonb);
  v_withdraws jsonb := coalesce(p_plan -> 'withdraws', '[]'::jsonb);
  v_entry jsonb;
  v_student uuid;
begin
  perform app.require_uid();
  select * into v_course from public.courses where id = p_course_id and archived_at is null;
  if not found or not app.can_manage_course(p_course_id) then
    raise exception 'Solo administración puede actualizar la nómina.' using errcode = '42501';
  end if;
  if jsonb_array_length(v_adds) > 0 then
    perform app.validate_roster(v_adds);
  end if;
  if jsonb_array_length(v_updates) > 0 then
    perform app.validate_roster(v_updates);
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_updates) u
    where not exists (
      select 1 from public.enrollments e
      where e.id = (u ->> 'enrollmentId')::uuid and e.course_id = p_course_id
    )
  ) or exists (
    select 1 from jsonb_array_elements_text(v_withdraws) w
    where not exists (
      select 1 from public.enrollments e where e.id = w::uuid and e.course_id = p_course_id
    )
  ) then
    raise exception 'El plan menciona estudiantes que no son de este curso.';
  end if;
  if exists (
    select 1 from (
      select e.list_number as number from public.enrollments e
      where e.course_id = p_course_id and e.active and e.list_number is not null
        and e.id not in (select (u ->> 'enrollmentId')::uuid from jsonb_array_elements(v_updates) u)
        and e.id not in (select w::uuid from jsonb_array_elements_text(v_withdraws) w)
      union all
      select (u ->> 'number')::integer from jsonb_array_elements(v_updates) u
      union all
      select (a ->> 'number')::integer from jsonb_array_elements(v_adds) a
    ) as numbers
    group by number having count(*) > 1
  ) then
    raise exception 'La nómina resultante tendría N° de lista repetidos.';
  end if;

  -- Primero se liberan los N° que cambian, para permitir intercambios.
  update public.enrollments
  set list_number = null
  where course_id = p_course_id and (
    id in (select (u ->> 'enrollmentId')::uuid from jsonb_array_elements(v_updates) u)
    or id in (select w::uuid from jsonb_array_elements_text(v_withdraws) w)
  );

  update public.enrollments
  set active = false, withdrawn_at = now()
  where course_id = p_course_id and id in (select w::uuid from jsonb_array_elements_text(v_withdraws) w);
  delete from public.seat_assignments
  where course_id = p_course_id and enrollment_id in (select w::uuid from jsonb_array_elements_text(v_withdraws) w);

  for v_entry in select * from jsonb_array_elements(v_updates) loop
    update public.enrollments
    set list_number = (v_entry ->> 'number')::integer, active = true, withdrawn_at = null
    where id = (v_entry ->> 'enrollmentId')::uuid
    returning student_id into v_student;
    update public.students
    set full_name = btrim(v_entry ->> 'fullName'), display_name = app.display_name(v_entry ->> 'fullName')
    where id = v_student and full_name <> btrim(v_entry ->> 'fullName');
  end loop;

  for v_entry in select * from jsonb_array_elements(v_adds) loop
    insert into public.students (school_id, full_name, display_name)
    values (v_course.school_id, btrim(v_entry ->> 'fullName'), app.display_name(v_entry ->> 'fullName'))
    returning id into v_student;
    insert into public.enrollments (school_id, course_id, student_id, list_number)
    values (v_course.school_id, p_course_id, v_student, (v_entry ->> 'number')::integer);
  end loop;

  if not exists (select 1 from public.room_templates t where t.course_id = p_course_id) then
    perform app.add_default_template(v_course.school_id, p_course_id, v_course.name);
  end if;

  return jsonb_build_object(
    'updated', jsonb_array_length(v_updates),
    'added', jsonb_array_length(v_adds),
    'withdrawn', jsonb_array_length(v_withdraws)
  );
end;
$$;

-- Invitar: administración registra un correo y un rol.
create function public.invite_member(p_school_id uuid, p_email text, p_role text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not app.has_role(p_school_id, array['admin']) then
    raise exception 'Solo administración puede invitar.' using errcode = '42501';
  end if;
  insert into public.school_invitations (school_id, email, role, invited_by)
  values (p_school_id, lower(btrim(p_email)), p_role, auth.uid())
  on conflict (school_id, email) where accepted_at is null
  do update set role = excluded.role, invited_by = excluded.invited_by
  returning id into v_id;
  return v_id;
end;
$$;

-- Aceptar invitaciones del correo verificado de quien inicia sesión.
create function public.claim_invitations() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_uid();
  v_email text;
  v_count integer := 0;
  v_invitation public.school_invitations;
begin
  select lower(email) into v_email from auth.users
  where id = v_uid and email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;
  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  for v_invitation in
    select * from public.school_invitations where email = v_email and accepted_at is null for update
  loop
    insert into public.school_memberships (school_id, user_id, role)
    values (v_invitation.school_id, v_uid, v_invitation.role)
    on conflict (school_id, user_id) do update set role = excluded.role, active = true;
    update public.school_invitations set accepted_at = now(), accepted_by = v_uid where id = v_invitation.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Asignar un curso a un miembro del establecimiento. Administración.
create function public.assign_course_teacher(p_course_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid;
begin
  select school_id into v_school from public.courses where id = p_course_id;
  if v_school is null or not app.has_role(v_school, array['admin']) then
    raise exception 'Solo administración puede asignar cursos.' using errcode = '42501';
  end if;
  insert into public.course_teachers (school_id, course_id, user_id)
  values (v_school, p_course_id, p_user_id)
  on conflict do nothing;
end;
$$;

-- Nombre que aparece en informes y exportaciones. Cada quien edita el suyo.
create function public.update_my_profile(p_full_name text) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
begin
  if char_length(btrim(coalesce(p_full_name, ''))) not between 1 and 200 then
    raise exception 'Escribe tu nombre.';
  end if;
  insert into public.profiles (id, full_name) values (app.require_uid(), btrim(p_full_name))
  on conflict (id) do update set full_name = excluded.full_name
  returning * into v_profile;
  return v_profile;
end;
$$;

-- Primer establecimiento y su administración. Solo el dueño del proyecto,
-- desde el editor SQL: no se concede a usuarios.
create function public.bootstrap_school(p_name text, p_admin_user_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid;
begin
  insert into public.profiles (id) values (p_admin_user_id) on conflict (id) do nothing;
  insert into public.schools (name) values (btrim(p_name)) returning id into v_school;
  insert into public.school_memberships (school_id, user_id, role)
  values (v_school, p_admin_user_id, 'admin');
  return v_school;
end;
$$;

-- Permisos de ejecución: solo usuarios autenticados, y bootstrap para nadie.
revoke execute on function
  public.start_session(uuid, uuid, uuid, date, text, text, text),
  public.record_observation(uuid, uuid, uuid, integer, text, integer, text, timestamptz),
  public.set_attendance(uuid, uuid, boolean, timestamptz),
  public.set_session_status(uuid, text),
  public.move_seat(uuid, uuid, integer, integer),
  public.assign_seats_by_number(uuid),
  public.create_course(uuid, text, jsonb),
  public.update_roster(uuid, jsonb),
  public.invite_member(uuid, text, text),
  public.claim_invitations(),
  public.assign_course_teacher(uuid, uuid),
  public.update_my_profile(text),
  public.bootstrap_school(text, uuid)
from public, anon, authenticated;
grant execute on function
  public.start_session(uuid, uuid, uuid, date, text, text, text),
  public.record_observation(uuid, uuid, uuid, integer, text, integer, text, timestamptz),
  public.set_attendance(uuid, uuid, boolean, timestamptz),
  public.set_session_status(uuid, text),
  public.move_seat(uuid, uuid, integer, integer),
  public.assign_seats_by_number(uuid),
  public.create_course(uuid, text, jsonb),
  public.update_roster(uuid, jsonb),
  public.invite_member(uuid, text, text),
  public.claim_invitations(),
  public.assign_course_teacher(uuid, uuid),
  public.update_my_profile(text)
to authenticated;
-- Las funciones de app solo las ejecutan las políticas (como el usuario) y
-- las operaciones de arriba (como dueño). Los usuarios solo necesitan las de
-- las políticas.
revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function
  app.is_member(uuid),
  app.has_role(uuid, text[]),
  app.teaches(uuid),
  app.can_view_course(uuid),
  app.can_view_session(uuid),
  app.can_view_student(uuid),
  app.can_view_profile(uuid)
to authenticated;
