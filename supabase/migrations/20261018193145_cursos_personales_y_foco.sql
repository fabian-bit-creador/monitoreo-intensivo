-- ADR 0006: cada cuenta administra y consulta únicamente los cursos que creó.
alter table public.courses
  add column focus_student_count integer not null default 0
  check (focus_student_count between 0 and 80);

alter table public.enrollments
  add column is_focus boolean not null default false;

alter table public.session_students
  add column is_focus boolean not null default false;

create function app.sync_course_focus_count() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_course uuid := coalesce(new.course_id, old.course_id);
begin
  update public.courses c
  set focus_student_count = (
    select count(*) from public.enrollments e
    where e.course_id = v_course and e.active and e.is_focus
  )
  where c.id = v_course;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger enrollments_sync_focus_count
after insert or delete or update of active, is_focus on public.enrollments
for each row execute function app.sync_course_focus_count();

create or replace function app.teaches(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course and c.created_by = auth.uid()
  );
$$;

create or replace function app.can_view_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course and c.created_by = auth.uid()
  );
$$;

create or replace function app.can_manage_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course and c.created_by = auth.uid()
  );
$$;

create or replace function app.can_view_session(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.class_sessions s
    join public.courses c on c.id = s.course_id
    where s.id = p_session and c.created_by = auth.uid()
  );
$$;

create or replace function public.start_session(
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
    raise exception 'Este curso no pertenece a tu cuenta.' using errcode = '42501';
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
    course_id, session_id, enrollment_id, list_number, full_name, display_name,
    seat_row, seat_col, is_focus
  )
  select e.course_id, v_session.id, e.id, e.list_number, s.full_name, s.display_name,
    a.seat_row, a.seat_col, e.is_focus
  from public.enrollments e
  join public.students s on s.id = e.student_id
  left join public.seat_assignments a
    on a.template_id = p_room_template_id and a.enrollment_id = e.id
  where e.course_id = p_course_id and e.active;

  return v_session;
end;
$$;

drop function if exists public.create_course(uuid, text, jsonb);

create function public.create_course(
  p_school_id uuid,
  p_name text,
  p_academic_year integer,
  p_entries jsonb,
  p_focus_numbers integer[]
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_uid();
  v_course uuid;
  v_template uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_entry jsonb;
  v_student uuid;
  v_focus integer[] := coalesce(p_focus_numbers, array[]::integer[]);
begin
  if not exists (
    select 1 from public.schools s
    where s.id = p_school_id and s.kind = 'personal' and s.owner_id = v_uid
  ) then
    raise exception 'Solo puedes crear cursos en tu espacio personal.' using errcode = '42501';
  end if;
  if v_name = '' then raise exception 'Escribe el nombre del curso.'; end if;
  if p_academic_year not between 2000 and 2100 then
    raise exception 'El año académico no es válido.';
  end if;
  perform app.validate_roster(p_entries);
  if exists (
    select 1 from unnest(v_focus) as selected(number)
    where not exists (
      select 1 from jsonb_array_elements(p_entries) entry
      where (entry ->> 'number')::integer = selected.number
    )
  ) then
    raise exception 'La selección foco no coincide con la nómina.';
  end if;

  begin
    insert into public.courses (
      school_id, name, academic_year, focus_student_count, created_by
    ) values (
      p_school_id, v_name, p_academic_year,
      coalesce(array_length(v_focus, 1), 0), v_uid
    ) returning id into v_course;
  exception when unique_violation then
    raise exception 'Ya existe el curso «%» este año. Actualiza su nómina en vez de crear otro.', v_name;
  end;

  v_template := app.add_default_template(p_school_id, v_course, v_name);
  insert into public.course_teachers (school_id, course_id, user_id)
  values (p_school_id, v_course, v_uid);

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    insert into public.students (school_id, full_name, display_name)
    values (p_school_id, btrim(v_entry ->> 'fullName'), app.display_name(v_entry ->> 'fullName'))
    returning id into v_student;
    insert into public.enrollments (
      school_id, course_id, student_id, list_number, is_focus
    ) values (
      p_school_id, v_course, v_student, (v_entry ->> 'number')::integer,
      (v_entry ->> 'number')::integer = any(v_focus)
    );
  end loop;

  return jsonb_build_object('courseId', v_course, 'roomTemplateId', v_template);
end;
$$;

create function public.set_focus_students(p_course_id uuid, p_enrollment_ids uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_uid();
  if not app.can_manage_course(p_course_id) then
    raise exception 'Este curso no pertenece a tu cuenta.' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_enrollment_ids, array[]::uuid[])) as selected(enrollment_id)
    where not exists (
      select 1 from public.enrollments e
      where e.id = selected.enrollment_id and e.course_id = p_course_id and e.active
    )
  ) then
    raise exception 'La selección foco contiene un estudiante que no pertenece al curso.';
  end if;
  update public.enrollments
  set is_focus = active and id = any(coalesce(p_enrollment_ids, array[]::uuid[]))
  where course_id = p_course_id;
  update public.courses
  set focus_student_count = (
    select count(*) from public.enrollments e
    where e.course_id = p_course_id and e.active and e.is_focus
  )
  where id = p_course_id;
end;
$$;

create function public.set_course_archived(p_course_id uuid, p_archived boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_uid();
  if not app.can_manage_course(p_course_id) then
    raise exception 'Este curso no pertenece a tu cuenta.' using errcode = '42501';
  end if;
  if p_archived and exists (
    select 1 from public.class_sessions s
    where s.course_id = p_course_id and s.status = 'active'
  ) then
    raise exception 'Cierra la clase en curso antes de archivar este curso.';
  end if;
  update public.courses set archived_at = case when p_archived then now() else null end
  where id = p_course_id;
end;
$$;

create function public.update_course_details(
  p_course_id uuid,
  p_name text,
  p_academic_year integer
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_uid();
  if not app.can_manage_course(p_course_id) then
    raise exception 'Este curso no pertenece a tu cuenta.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 then
    raise exception 'Escribe un nombre de curso válido.';
  end if;
  if p_academic_year not between 2000 and 2100 then
    raise exception 'El año académico no es válido.';
  end if;
  update public.courses
  set name = btrim(p_name), academic_year = p_academic_year
  where id = p_course_id;
end;
$$;

revoke all on function public.create_course(uuid, text, integer, jsonb, integer[]) from public, anon;
revoke all on function public.set_focus_students(uuid, uuid[]) from public, anon;
revoke all on function public.set_course_archived(uuid, boolean) from public, anon;
revoke all on function public.update_course_details(uuid, text, integer) from public, anon;

grant execute on function public.create_course(uuid, text, integer, jsonb, integer[]) to authenticated;
grant execute on function public.set_focus_students(uuid, uuid[]) to authenticated;
grant execute on function public.set_course_archived(uuid, boolean) to authenticated;
grant execute on function public.update_course_details(uuid, text, integer) to authenticated;

grant select (focus_student_count) on public.courses to authenticated;
grant select (is_focus) on public.enrollments to authenticated;
grant select (is_focus) on public.session_students to authenticated;
