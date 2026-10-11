-- Monitoreo Intensivo · espacios personales y salas configurables (ADR 0004).
--
-- * Cada persona tiene su espacio personal: un establecimiento de un solo
--   miembro donde es administración. Así puede crear cursos sin depender de
--   un colegio. Los permisos y la RLS no cambian.
-- * Las salas pueden tener forma de filas, laboratorio o trabajo grupal. Un
--   pasillo es una celda sin puesto y cada puesto puede pertenecer a un grupo.

-- ---------------------------------------------------------------------------
-- 1. Espacios
-- ---------------------------------------------------------------------------

alter table public.schools
  add column kind text not null default 'institution' check (kind in ('institution', 'personal')),
  add column owner_id uuid references public.profiles (id) on delete cascade;
alter table public.schools
  add constraint schools_personal_owner_check check ((kind = 'personal') = (owner_id is not null));
create unique index schools_personal_owner_key on public.schools (owner_id) where kind = 'personal';

-- Crea, si falta, el espacio personal de una persona y la deja como
-- administración. Es idempotente.
create function app.ensure_personal_space(p_user uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid;
begin
  select id into v_school from public.schools where kind = 'personal' and owner_id = p_user;
  if v_school is null then
    insert into public.schools (name, kind, owner_id) values ('Mi espacio', 'personal', p_user)
    on conflict (owner_id) where kind = 'personal' do nothing
    returning id into v_school;
    if v_school is null then
      select id into v_school from public.schools where kind = 'personal' and owner_id = p_user;
    end if;
  end if;
  insert into public.school_memberships (school_id, user_id, role)
  values (v_school, p_user, 'admin')
  on conflict (school_id, user_id) do update set role = 'admin', active = true;
  return v_school;
end;
$$;

create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  perform app.ensure_personal_space(new.id);
  return new;
end;
$$;

-- Quienes ya tenían cuenta reciben su espacio.
select app.ensure_personal_space(id) from public.profiles;

-- ---------------------------------------------------------------------------
-- 2. Salas configurables
-- ---------------------------------------------------------------------------

-- classic: salas anteriores, que se dibujan como siempre.
alter table public.room_templates
  add column layout text not null default 'classic'
    check (layout in ('classic', 'rows', 'lab', 'groups', 'custom'));
alter table public.room_slots
  add column group_label text
    check (group_label is null or char_length(btrim(group_label)) between 1 and 40);

-- Valida una forma de sala: [{row, col, group?}] dentro de la grilla, sin
-- repetir puestos y con al menos uno.
create function app.validate_room(p_layout text, p_rows integer, p_cols integer, p_slots jsonb)
returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_layout is null or p_layout not in ('rows', 'lab', 'groups', 'custom') then
    raise exception 'Tipo de sala no válido.';
  end if;
  if p_rows is null or p_cols is null or p_rows not between 1 and 20 or p_cols not between 1 and 20 then
    raise exception 'La sala puede tener entre 1 y 20 filas y entre 1 y 20 columnas.';
  end if;
  if jsonb_typeof(p_slots) is distinct from 'array' or jsonb_array_length(p_slots) = 0 then
    raise exception 'La sala necesita al menos un puesto.';
  end if;
  -- CASE fija el orden de evaluación: no se convierte a número lo que no lo es.
  if exists (
    select 1 from jsonb_array_elements(p_slots) s
    where case
      when jsonb_typeof(s -> 'row') = 'number' and jsonb_typeof(s -> 'col') = 'number' then
        (s ->> 'row')::numeric <> trunc((s ->> 'row')::numeric)
        or (s ->> 'col')::numeric <> trunc((s ->> 'col')::numeric)
        or (s ->> 'row')::numeric not between 0 and p_rows - 1
        or (s ->> 'col')::numeric not between 0 and p_cols - 1
      else true
    end
  ) then
    raise exception 'Hay puestos fuera de la sala.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_slots) s
    where coalesce(jsonb_typeof(s -> 'group'), 'null') not in ('null', 'string')
       or (jsonb_typeof(s -> 'group') = 'string' and char_length(btrim(s ->> 'group')) not between 1 and 40)
  ) then
    raise exception 'El nombre de un grupo debe tener entre 1 y 40 caracteres.';
  end if;
  if (
    select count(distinct ((s ->> 'row')::integer, (s ->> 'col')::integer)) from jsonb_array_elements(p_slots) s
  ) <> jsonb_array_length(p_slots) then
    raise exception 'Hay puestos repetidos.';
  end if;
end;
$$;

-- Agregar una sala al curso (por ejemplo, el laboratorio). Quien enseña el
-- curso o la administración. Reintentar con el mismo id no la duplica.
create function public.create_room_template(
  p_id uuid,
  p_course_id uuid,
  p_name text,
  p_layout text,
  p_rows integer,
  p_cols integer,
  p_slots jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_course public.courses;
  v_existing public.room_templates;
  v_name text := btrim(coalesce(p_name, ''));
begin
  perform app.require_uid();
  select * into v_course from public.courses where id = p_course_id and archived_at is null;
  if not found or not (app.teaches(p_course_id) or app.can_manage_course(p_course_id)) then
    raise exception 'No puedes crear salas en este curso.' using errcode = '42501';
  end if;
  select * into v_existing from public.room_templates where id = p_id;
  if found then
    if v_existing.course_id <> p_course_id then
      raise exception 'Ese identificador de sala ya está en uso.';
    end if;
    return p_id;
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'Escribe el nombre de la sala.';
  end if;
  perform app.validate_room(p_layout, p_rows, p_cols, p_slots);

  insert into public.room_templates (id, school_id, course_id, name, description, row_count, column_count, layout)
  values (p_id, v_course.school_id, p_course_id, v_name, '', p_rows, p_cols, p_layout);
  insert into public.room_slots (template_id, seat_row, seat_col, group_label)
  select p_id, (s ->> 'row')::integer, (s ->> 'col')::integer, nullif(btrim(s ->> 'group'), '')
  from jsonb_array_elements(p_slots) s;
  return p_id;
end;
$$;

-- Cambiar la forma de una sala. Quien queda sin puesto pasa a «Sin puesto
-- asignado»; las demás asignaciones se conservan. Devuelve cuántos
-- estudiantes quedaron sin puesto.
create function public.update_room_layout(
  p_template_id uuid,
  p_name text,
  p_layout text,
  p_rows integer,
  p_cols integer,
  p_slots jsonb
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_template public.room_templates := app.lock_arrangeable_template(p_template_id);
  v_name text := btrim(coalesce(p_name, ''));
  v_released integer;
begin
  if char_length(v_name) not between 1 and 120 then
    raise exception 'Escribe el nombre de la sala.';
  end if;
  perform app.validate_room(p_layout, p_rows, p_cols, p_slots);

  delete from public.seat_assignments a
  where a.template_id = p_template_id
    and not exists (
      select 1 from jsonb_array_elements(p_slots) s
      where (s ->> 'row')::integer = a.seat_row and (s ->> 'col')::integer = a.seat_col
    );
  get diagnostics v_released = row_count;

  delete from public.room_slots r
  where r.template_id = p_template_id
    and not exists (
      select 1 from jsonb_array_elements(p_slots) s
      where (s ->> 'row')::integer = r.seat_row and (s ->> 'col')::integer = r.seat_col
    );
  insert into public.room_slots (template_id, seat_row, seat_col, status, group_label)
  select p_template_id, (s ->> 'row')::integer, (s ->> 'col')::integer, 'available', nullif(btrim(s ->> 'group'), '')
  from jsonb_array_elements(p_slots) s
  on conflict (template_id, seat_row, seat_col)
  do update set status = 'available', group_label = excluded.group_label;

  update public.room_templates
  set name = v_name, layout = p_layout, row_count = p_rows, column_count = p_cols
  where id = v_template.id;
  return v_released;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Permisos de ejecución
-- ---------------------------------------------------------------------------

revoke execute on function
  public.create_room_template(uuid, uuid, text, text, integer, integer, jsonb),
  public.update_room_layout(uuid, text, text, integer, integer, jsonb)
from public, anon, authenticated;
grant execute on function
  public.create_room_template(uuid, uuid, text, text, integer, integer, jsonb),
  public.update_room_layout(uuid, text, text, integer, integer, jsonb)
to authenticated;
revoke execute on function
  app.ensure_personal_space(uuid),
  app.validate_room(text, integer, integer, jsonb)
from public, anon, authenticated;
