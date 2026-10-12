-- Importa un respaldo de la aplicación o los datos exportados del Site
-- anterior (misma forma: MonitoringState) a un establecimiento.
--
-- * Solo administración del establecimiento.
-- * Repetible: cada fila guarda su identificador anterior en legacy_id y una
--   segunda importación no duplica nada.
-- * p_teacher_map asigna cada docente anterior con clases a un usuario
--   miembro: la autoría queda en usuarios reales, no en nombres.
-- * Las observaciones de estudiantes fuera de la nómina de su clase no se
--   importan (tampoco contaban en los informes) y se informan.

create function public.import_legacy_state(
  p_school_id uuid,
  p_state jsonb,
  p_teacher_map jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_uid();
  v_year integer := extract(year from now() at time zone 'America/Santiago')::integer;
  v_before jsonb;
  v_skipped integer;
  v_unmapped text;
begin
  if not app.has_role(p_school_id, array['admin']) then
    raise exception 'Solo administración puede importar datos.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_state -> 'courses') <> 'array'
    or jsonb_typeof(p_state -> 'students') <> 'array'
    or jsonb_typeof(p_state -> 'sessions') <> 'array'
    or jsonb_typeof(p_state -> 'observations') <> 'array' then
    raise exception 'El respaldo no tiene la forma esperada.';
  end if;
  p_teacher_map := coalesce(p_teacher_map, '{}'::jsonb);

  select string_agg(distinct s ->> 'teacherId', ', ') into v_unmapped
  from jsonb_array_elements(p_state -> 'sessions') s
  where not exists (
    select 1 from public.school_memberships m
    where m.school_id = p_school_id and m.active
      and m.user_id::text = p_teacher_map ->> (s ->> 'teacherId')
  );
  if v_unmapped is not null then
    raise exception 'Falta asignar a un miembro del establecimiento estos docentes: %.', v_unmapped;
  end if;

  select jsonb_build_object(
    'courses', (select count(*) from public.courses where school_id = p_school_id),
    'students', (select count(*) from public.enrollments where school_id = p_school_id),
    'sessions', (select count(*) from public.class_sessions where school_id = p_school_id),
    'observations', (
      select count(*) from public.observations o
      join public.class_sessions s on s.id = o.session_id
      where s.school_id = p_school_id
    )
  ) into v_before;

  -- Cursos.
  begin
    insert into public.courses (school_id, name, academic_year, legacy_id, created_by, created_at)
    select p_school_id, btrim(c ->> 'name'),
      coalesce(extract(year from (c ->> 'createdAt')::timestamptz at time zone 'America/Santiago')::integer, v_year),
      c ->> 'id', v_uid, coalesce((c ->> 'createdAt')::timestamptz, now())
    from jsonb_array_elements(p_state -> 'courses') c
    on conflict (school_id, legacy_id) do nothing;
  exception when unique_violation then
    raise exception 'Ya existe en el establecimiento un curso con el mismo nombre que uno del respaldo.';
  end;

  -- Plantillas y puestos.
  insert into public.room_templates (school_id, course_id, name, description, row_count, column_count, active, legacy_id, created_at)
  select p_school_id, c.id, btrim(t ->> 'name'), coalesce(t ->> 'description', ''),
    (t ->> 'rowCount')::integer, (t ->> 'columnCount')::integer, coalesce((t ->> 'active')::boolean, true),
    t ->> 'id', coalesce((t ->> 'createdAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_state -> 'roomTemplates', '[]'::jsonb)) t
  join public.courses c on c.school_id = p_school_id and c.legacy_id = t ->> 'courseId'
  on conflict (school_id, legacy_id) do nothing;

  insert into public.room_slots (template_id, seat_row, seat_col, status)
  select t.id, (s ->> 'seatRow')::integer, (s ->> 'seatCol')::integer, s ->> 'status'
  from jsonb_array_elements(coalesce(p_state -> 'roomSlots', '[]'::jsonb)) s
  join public.room_templates t on t.school_id = p_school_id and t.legacy_id = s ->> 'templateId'
  on conflict do nothing;

  -- Cursos sin plantilla reciben la sala habitual, como al crear uno.
  perform app.add_default_template(c.school_id, c.id, c.name)
  from public.courses c
  where c.school_id = p_school_id and c.legacy_id is not null
    and not exists (select 1 from public.room_templates t where t.course_id = c.id);

  -- Estudiantes: la persona y su matrícula comparten el identificador anterior.
  insert into public.students (school_id, full_name, display_name, legacy_id)
  select p_school_id, btrim(s ->> 'fullName'),
    coalesce(nullif(btrim(s ->> 'displayName'), ''), app.display_name(s ->> 'fullName')), s ->> 'id'
  from jsonb_array_elements(p_state -> 'students') s
  join public.courses c on c.school_id = p_school_id and c.legacy_id = s ->> 'courseId'
  on conflict (school_id, legacy_id) do nothing;

  begin
    insert into public.enrollments (school_id, course_id, student_id, list_number, active, withdrawn_at, legacy_id)
    select p_school_id, c.id, st.id, (s ->> 'number')::integer, coalesce((s ->> 'active')::boolean, true),
      case when coalesce((s ->> 'active')::boolean, true) then null else now() end, s ->> 'id'
    from jsonb_array_elements(p_state -> 'students') s
    join public.courses c on c.school_id = p_school_id and c.legacy_id = s ->> 'courseId'
    join public.students st on st.school_id = p_school_id and st.legacy_id = s ->> 'id'
    on conflict (school_id, legacy_id) do nothing;
  exception when unique_violation then
    raise exception 'El respaldo tiene N° de lista repetidos dentro de un curso.';
  end;

  insert into public.seat_assignments (course_id, template_id, enrollment_id, seat_row, seat_col, updated_by)
  select t.course_id, t.id, e.id, (a ->> 'seatRow')::integer, (a ->> 'seatCol')::integer, v_uid
  from jsonb_array_elements(coalesce(p_state -> 'seatAssignments', '[]'::jsonb)) a
  join public.room_templates t on t.school_id = p_school_id and t.legacy_id = a ->> 'templateId'
  join public.enrollments e on e.school_id = p_school_id and e.legacy_id = a ->> 'studentId' and e.course_id = t.course_id
  where exists (
    select 1 from public.room_slots rs
    where rs.template_id = t.id and rs.seat_row = (a ->> 'seatRow')::integer and rs.seat_col = (a ->> 'seatCol')::integer
  )
  -- El puesto único es diferible y no puede ser árbitro: se usa la clave primaria.
  on conflict (template_id, enrollment_id) do nothing;

  -- Docentes de los cursos: quienes dictaron sus clases y quien importa.
  insert into public.course_teachers (school_id, course_id, user_id)
  select distinct p_school_id, c.id, (p_teacher_map ->> (s ->> 'teacherId'))::uuid
  from jsonb_array_elements(p_state -> 'sessions') s
  join public.courses c on c.school_id = p_school_id and c.legacy_id = s ->> 'courseId'
  on conflict do nothing;
  insert into public.course_teachers (school_id, course_id, user_id)
  select p_school_id, c.id, v_uid from public.courses c
  where c.school_id = p_school_id and c.legacy_id is not null
  on conflict do nothing;

  -- Clases, en el orden original para que su número crezca igual.
  insert into public.class_sessions (
    id, school_id, course_id, teacher_id, room_template_id, date, module, objective, success_criteria,
    status, started_at, closed_at, legacy_id, created_at
  )
  select gen_random_uuid(), p_school_id, c.id, (p_teacher_map ->> (s ->> 'teacherId'))::uuid,
    coalesce(
      (select t.id from public.room_templates t where t.school_id = p_school_id and t.legacy_id = s ->> 'roomTemplateId'),
      (select t.id from public.room_templates t where t.course_id = c.id order by t.created_at, t.id limit 1)
    ),
    (s ->> 'date')::date,
    coalesce(nullif(btrim(s ->> 'module'), ''), 'Práctica independiente'),
    coalesce(nullif(btrim(s ->> 'objective'), ''), 'Actividad de práctica independiente'),
    coalesce(nullif(btrim(s ->> 'successCriteria'), ''), 'Cumple los criterios de éxito definidos para la actividad.'),
    s ->> 'status',
    coalesce((s ->> 'startedAt')::timestamptz, (s ->> 'date')::timestamptz),
    case when s ->> 'status' = 'closed'
      then coalesce((s ->> 'closedAt')::timestamptz, (s ->> 'startedAt')::timestamptz, (s ->> 'date')::timestamptz)
    end,
    s ->> 'id',
    coalesce((s ->> 'startedAt')::timestamptz, now())
  from jsonb_array_elements(p_state -> 'sessions') s
  join public.courses c on c.school_id = p_school_id and c.legacy_id = s ->> 'courseId'
  order by (s ->> 'id')::bigint
  on conflict (school_id, legacy_id) do nothing;

  -- Nómina de cada clase. Si el respaldo trae la fotografía, se usa; si no,
  -- el N°, el nombre y el puesto que el estudiante tiene en el respaldo.
  insert into public.session_students (
    course_id, session_id, enrollment_id, list_number, full_name, display_name, seat_row, seat_col, present
  )
  select cs.course_id, cs.id, e.id,
    case when r ? 'number' then (r ->> 'number')::integer else (st ->> 'number')::integer end,
    coalesce(r ->> 'fullName', st ->> 'fullName'),
    coalesce(r ->> 'displayName', st ->> 'displayName', app.display_name(st ->> 'fullName')),
    case when r ? 'seatRow' then (r ->> 'seatRow')::integer else sa.seat_row end,
    case when r ? 'seatCol' then (r ->> 'seatCol')::integer else sa.seat_col end,
    coalesce((r ->> 'present')::boolean, true)
  from jsonb_array_elements(coalesce(p_state -> 'sessionStudents', '[]'::jsonb)) r
  join public.class_sessions cs on cs.school_id = p_school_id and cs.legacy_id = r ->> 'sessionId'
  join public.enrollments e on e.school_id = p_school_id and e.legacy_id = r ->> 'studentId' and e.course_id = cs.course_id
  join lateral (
    select s from jsonb_array_elements(p_state -> 'students') s where s ->> 'id' = r ->> 'studentId' limit 1
  ) as source(st) on true
  left join public.seat_assignments sa on sa.template_id = cs.room_template_id and sa.enrollment_id = e.id
  on conflict do nothing;

  -- Observaciones, en orden cronológico.
  insert into public.observations (
    id, session_id, enrollment_id, round, code, progress, note, observed_at, recorded_at, recorded_by, legacy_id
  )
  select gen_random_uuid(), cs.id, e.id,
    greatest(1, least(3, coalesce((o ->> 'round')::integer, 1))),
    o ->> 'code',
    case o ->> 'code'
      when 'I' then 0
      when 'C' then 100
      else greatest(1, least(99, coalesce(nullif((o ->> 'progress')::integer, 0), 50)))
    end,
    left(nullif(btrim(coalesce(o ->> 'note', '')), ''), 500),
    (o ->> 'createdAt')::timestamptz,
    (o ->> 'createdAt')::timestamptz,
    cs.teacher_id,
    o ->> 'id'
  from jsonb_array_elements(p_state -> 'observations') o
  join public.class_sessions cs on cs.school_id = p_school_id and cs.legacy_id = o ->> 'sessionId'
  join public.enrollments e on e.school_id = p_school_id and e.legacy_id = o ->> 'studentId'
  where o ->> 'code' in ('I', 'R', 'C')
    and exists (
      select 1 from public.session_students ss
      where ss.session_id = cs.id and ss.enrollment_id = e.id
    )
  order by (o ->> 'createdAt')::timestamptz, (o ->> 'id')::bigint
  on conflict (session_id, legacy_id) do nothing;

  select count(*) into v_skipped
  from jsonb_array_elements(p_state -> 'observations') o
  where not exists (
    select 1 from public.observations ob
    join public.class_sessions cs on cs.id = ob.session_id
    where cs.school_id = p_school_id and cs.legacy_id = o ->> 'sessionId' and ob.legacy_id = o ->> 'id'
  );

  return jsonb_build_object(
    'courses', (select count(*) from public.courses where school_id = p_school_id) - (v_before ->> 'courses')::integer,
    'students', (select count(*) from public.enrollments where school_id = p_school_id) - (v_before ->> 'students')::integer,
    'sessions', (select count(*) from public.class_sessions where school_id = p_school_id) - (v_before ->> 'sessions')::integer,
    'observations', (
      select count(*) from public.observations o
      join public.class_sessions s on s.id = o.session_id
      where s.school_id = p_school_id
    ) - (v_before ->> 'observations')::integer,
    'skippedObservations', v_skipped
  );
end;
$$;

revoke execute on function public.import_legacy_state(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.import_legacy_state(uuid, jsonb, jsonb) to authenticated;
