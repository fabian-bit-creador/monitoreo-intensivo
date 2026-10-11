-- Monitoreo Intensivo · asignar por N° completa grupo por grupo (ADR 0004).
--
-- En una sala de trabajo grupal o de laboratorio, los N° consecutivos quedan
-- en el mismo grupo o mesón: se llenan los grupos en el orden de su primer
-- puesto. Los puestos sin grupo siguen el orden de lectura de la sala.

create or replace function public.assign_seats_by_number(p_template_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app.require_uid();
  v_template public.room_templates := app.lock_arrangeable_template(p_template_id);
  v_count integer;
begin
  with slots as (
    select s.seat_row, s.seat_col,
           min(s.seat_row * 100 + s.seat_col) over (
             partition by coalesce(s.group_label, s.seat_row || '-' || s.seat_col)
           ) as group_start
    from public.room_slots s
    where s.template_id = p_template_id and s.status = 'available'
  ),
  free_slots as (
    select s.seat_row, s.seat_col, row_number() over (order by s.group_start, s.seat_row, s.seat_col) as position
    from slots s
    where not exists (
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
