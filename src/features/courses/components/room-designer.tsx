import { useState } from "react";
import { AlertTriangle, FlaskConical, LayoutGrid, Users } from "lucide-react";
import {
  groupsLayout,
  labLayout,
  MAX_ROOM_SIZE,
  resizeLayout,
  rowsLayout,
  suggestedGroups,
  suggestedLab,
  suggestedRows,
  toggleSlot,
  type GroupsOptions,
  type LabOptions,
  type RoomLayout,
  type RowsOptions,
} from "@/features/courses/lib/room-layouts";

export type RoomDraft = { name: string; layout: RoomLayout };
type PresetKind = "rows" | "lab" | "groups";

const PRESETS: Array<{ kind: PresetKind; label: string; defaultName: string; icon: typeof LayoutGrid }> = [
  { kind: "rows", label: "Sala en filas", defaultName: "Sala habitual", icon: LayoutGrid },
  { kind: "lab", label: "Laboratorio", defaultName: "Laboratorio", icon: FlaskConical },
  { kind: "groups", label: "Trabajo grupal", defaultName: "Trabajo grupal", icon: Users },
];
const DEFAULT_NAMES = new Set(PRESETS.map((preset) => preset.defaultName));

/** Sala inicial para un curso nuevo: en filas, con lugar para todos. */
export function initialRoomDraft(studentCount: number): RoomDraft {
  return { name: "Sala habitual", layout: rowsLayout(suggestedRows(studentCount)) };
}

type NumberFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

function NumberField({ label, value, min, max, onChange }: NumberFieldProps) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.round(next))));
        }}
      />
    </label>
  );
}

type RoomDesignerProps = {
  studentCount: number;
  value: RoomDraft;
  onChange: (draft: RoomDraft) => void;
};

/**
 * Elegir y ajustar la forma de una sala (ADR 0004): sala en filas,
 * laboratorio o trabajo grupal, con pocos números. Después se puede tocar
 * cualquier celda para quitar o agregar un puesto.
 */
export function RoomDesigner({ studentCount, value, onChange }: RoomDesignerProps) {
  const [rows, setRows] = useState<RowsOptions>(() => suggestedRows(studentCount));
  const [lab, setLab] = useState<LabOptions>(() => suggestedLab(studentCount));
  const [groups, setGroups] = useState<GroupsOptions>(() => suggestedGroups(studentCount));
  const { layout } = value;
  const active: PresetKind = layout.kind === "custom" ? "rows" : layout.kind;

  function apply(next: RoomLayout, kind: PresetKind = active) {
    const preset = PRESETS.find((item) => item.kind === kind)!;
    const name = DEFAULT_NAMES.has(value.name.trim()) || !value.name.trim() ? preset.defaultName : value.name;
    onChange({ name, layout: next });
  }

  function choose(kind: PresetKind) {
    if (kind === "rows") apply(rowsLayout(rows), kind);
    if (kind === "lab") apply(labLayout(lab), kind);
    if (kind === "groups") apply(groupsLayout(groups), kind);
  }

  const seats = layout.slots.length;
  const missing = studentCount - seats;
  const seatAt = new Map(layout.slots.map((slot) => [`${slot.row}-${slot.col}`, slot]));
  const groupIndex = new Map([...new Set(layout.slots.map((slot) => slot.group).filter(Boolean))].map((group, index) => [group, index]));

  return (
    <div className="room-designer form-stack">
      <div className="layout-tabs" role="tablist" aria-label="Tipo de sala">
        {PRESETS.map(({ kind, label, icon: Icon }) => (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={active === kind}
            className={active === kind ? "active" : ""}
            onClick={() => choose(kind)}
          >
            <Icon size={17} /> {label}
          </button>
        ))}
      </div>

      <label>
        <span>Nombre de la sala</span>
        <input value={value.name} maxLength={120} onChange={(event) => onChange({ ...value, name: event.target.value })} />
      </label>

      <div className="layout-params">
        {active === "rows" ? (
          <>
            <NumberField label="Filas" value={rows.rows} min={1} max={MAX_ROOM_SIZE}
              onChange={(next) => { const options = { ...rows, rows: next }; setRows(options); apply(rowsLayout(options)); }} />
            <NumberField label="Puestos por fila" value={rows.seatsPerRow} min={1} max={MAX_ROOM_SIZE}
              onChange={(next) => { const options = { ...rows, seatsPerRow: next }; setRows(options); apply(rowsLayout(options)); }} />
            <label>
              <span>Pasillo</span>
              <select
                value={rows.aisleEvery}
                onChange={(event) => {
                  const options = { ...rows, aisleEvery: Number(event.target.value) };
                  setRows(options);
                  apply(rowsLayout(options));
                }}
              >
                <option value={0}>Sin pasillos</option>
                {[1, 2, 3, 4, 5, 6].map((every) => (
                  <option key={every} value={every}>Cada {every} {every === 1 ? "puesto" : "puestos"}</option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        {active === "lab" ? (
          <>
            <NumberField label="Mesones por fila" value={lab.benchesPerRow} min={1} max={6}
              onChange={(next) => { const options = { ...lab, benchesPerRow: next }; setLab(options); apply(labLayout(options)); }} />
            <NumberField label="Filas de mesones" value={lab.benchRows} min={1} max={7}
              onChange={(next) => { const options = { ...lab, benchRows: next }; setLab(options); apply(labLayout(options)); }} />
            <NumberField label="Puestos por lado" value={lab.seatsPerSide} min={1} max={6}
              onChange={(next) => { const options = { ...lab, seatsPerSide: next }; setLab(options); apply(labLayout(options)); }} />
          </>
        ) : null}
        {active === "groups" ? (
          <>
            <NumberField label="Grupos" value={groups.groups} min={1} max={42}
              onChange={(next) => { const options = { ...groups, groups: next }; setGroups(options); apply(groupsLayout(options)); }} />
            <label>
              <span>Integrantes</span>
              <select
                value={groups.groupSize}
                onChange={(event) => {
                  const options = { ...groups, groupSize: Number(event.target.value) as 4 | 6 };
                  setGroups(options);
                  apply(groupsLayout(options));
                }}
              >
                <option value={4}>4 por grupo</option>
                <option value={6}>6 por grupo</option>
              </select>
            </label>
            <NumberField label="Grupos por fila" value={groups.groupsPerRow} min={1} max={6}
              onChange={(next) => { const options = { ...groups, groupsPerRow: next }; setGroups(options); apply(groupsLayout(options)); }} />
          </>
        ) : null}
      </div>

      <div className={`room-capacity ${missing > 0 ? "short" : ""}`} role="status">
        {missing > 0 ? <AlertTriangle size={16} /> : null}
        <span>
          <strong>{seats} {seats === 1 ? "puesto" : "puestos"}</strong>
          {studentCount ? ` para ${studentCount} ${studentCount === 1 ? "estudiante" : "estudiantes"}` : ""}
          {missing > 0 ? `. Faltan ${missing}: quienes no alcancen quedarán sin puesto.` : "."}
        </span>
      </div>

      <div className="room-preview" aria-label="Forma de la sala">
        <div
          className="room-preview-grid"
          style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(18px, 30px))` }}
        >
          {Array.from({ length: layout.rows * layout.cols }, (_, index) => {
            const row = Math.floor(index / layout.cols);
            const col = index % layout.cols;
            const slot = seatAt.get(`${row}-${col}`);
            const tint = slot?.group ? (groupIndex.get(slot.group)! % 2 ? "tint-b" : "tint-a") : "";
            return (
              <button
                key={`${row}-${col}`}
                type="button"
                className={slot ? `preview-seat ${tint}` : "preview-aisle"}
                title={slot ? `${slot.group ? `${slot.group} · ` : ""}fila ${row + 1}, columna ${col + 1}` : "Pasillo"}
                aria-label={slot
                  ? `Quitar puesto de la fila ${row + 1}, columna ${col + 1}`
                  : `Agregar puesto en la fila ${row + 1}, columna ${col + 1}`}
                onClick={() => apply(toggleSlot(layout, row, col))}
              />
            );
          })}
        </div>
        <div className="room-preview-board">Pizarra</div>
      </div>
      <div className="room-preview-tools">
        <p>Toca una celda para quitar o agregar un puesto.</p>
        <div>
          <button type="button" onClick={() => apply(resizeLayout(layout, layout.rows + 1, layout.cols))} disabled={layout.rows >= MAX_ROOM_SIZE}>+ Fila</button>
          <button type="button" onClick={() => apply(resizeLayout(layout, layout.rows, layout.cols + 1))} disabled={layout.cols >= MAX_ROOM_SIZE}>+ Columna</button>
        </div>
      </div>
    </div>
  );
}
