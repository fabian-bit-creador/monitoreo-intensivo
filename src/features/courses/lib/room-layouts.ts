import type { RoomSlot, RoomTemplate } from "@/types/monitoring";

/**
 * Formas de sala (ADR 0004). Una sala es una grilla de hasta 20 × 20 celdas;
 * cada puesto es una celda y un pasillo es una celda sin puesto. Los puestos
 * de un mesón o de un grupo comparten su nombre de grupo.
 */
export type RoomLayoutKind = "rows" | "lab" | "groups" | "custom";
export type LayoutSlot = { row: number; col: number; group?: string };
export type RoomLayout = { kind: RoomLayoutKind; rows: number; cols: number; slots: LayoutSlot[] };

export const MAX_ROOM_SIZE = 20;

export type RowsOptions = { rows: number; seatsPerRow: number; aisleEvery: number };
export type LabOptions = { benchesPerRow: number; benchRows: number; seatsPerSide: number };
export type GroupsOptions = { groups: number; groupSize: 4 | 6; groupsPerRow: number };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : min)));

/** Filas de puestos individuales, con un pasillo cada `aisleEvery` puestos (0 = sin pasillos). */
export function rowsLayout(options: RowsOptions): RoomLayout {
  const rows = clamp(options.rows, 1, MAX_ROOM_SIZE);
  let seatsPerRow = clamp(options.seatsPerRow, 1, MAX_ROOM_SIZE);
  const aisleEvery = clamp(options.aisleEvery, 0, seatsPerRow);
  const aislesFor = (seats: number) => (aisleEvery > 0 ? Math.floor((seats - 1) / aisleEvery) : 0);
  // Los pasillos también ocupan columnas: se recortan puestos hasta caber en 20.
  while (seatsPerRow + aislesFor(seatsPerRow) > MAX_ROOM_SIZE) seatsPerRow -= 1;
  const aisles = aislesFor(seatsPerRow);
  const slots: LayoutSlot[] = [];
  for (let row = 0; row < rows; row += 1) {
    let col = 0;
    for (let seat = 0; seat < seatsPerRow; seat += 1) {
      if (aisleEvery > 0 && seat > 0 && seat % aisleEvery === 0) col += 1;
      slots.push({ row, col });
      col += 1;
    }
  }
  return { kind: "rows", rows, cols: seatsPerRow + aisles, slots };
}

/**
 * Mesones de laboratorio: cada mesón tiene estudiantes a ambos lados (dos
 * filas de `seatsPerSide`). Entre mesones queda un pasillo.
 */
export function labLayout(options: LabOptions): RoomLayout {
  const seatsPerSide = clamp(options.seatsPerSide, 1, 6);
  const benchesPerRow = clamp(options.benchesPerRow, 1, Math.floor((MAX_ROOM_SIZE + 1) / (seatsPerSide + 1)));
  const benchRows = clamp(options.benchRows, 1, Math.floor((MAX_ROOM_SIZE + 1) / 3));
  const slots: LayoutSlot[] = [];
  let bench = 0;
  for (let benchRow = 0; benchRow < benchRows; benchRow += 1) {
    for (let benchCol = 0; benchCol < benchesPerRow; benchCol += 1) {
      bench += 1;
      for (let side = 0; side < 2; side += 1) {
        for (let seat = 0; seat < seatsPerSide; seat += 1) {
          slots.push({
            row: benchRow * 3 + side,
            col: benchCol * (seatsPerSide + 1) + seat,
            group: `Mesón ${bench}`,
          });
        }
      }
    }
  }
  return {
    kind: "lab",
    rows: benchRows * 3 - 1,
    cols: benchesPerRow * (seatsPerSide + 1) - 1,
    slots,
  };
}

/** Islas de 4 (2 × 2) o 6 (2 × 3) estudiantes separadas por pasillos. */
export function groupsLayout(options: GroupsOptions): RoomLayout {
  const width = options.groupSize === 6 ? 3 : 2;
  const groupsPerRow = clamp(options.groupsPerRow, 1, Math.floor((MAX_ROOM_SIZE + 1) / (width + 1)));
  const maxGroups = groupsPerRow * Math.floor((MAX_ROOM_SIZE + 1) / 3);
  const groups = clamp(options.groups, 1, maxGroups);
  const islandRows = Math.ceil(groups / groupsPerRow);
  const slots: LayoutSlot[] = [];
  for (let index = 0; index < groups; index += 1) {
    const top = Math.floor(index / groupsPerRow) * 3;
    const left = (index % groupsPerRow) * (width + 1);
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < width; col += 1) {
        slots.push({ row: top + row, col: left + col, group: `Grupo ${index + 1}` });
      }
    }
  }
  return {
    kind: "groups",
    rows: islandRows * 3 - 1,
    cols: Math.min(groups, groupsPerRow) * (width + 1) - 1,
    slots,
  };
}

/** Sala en filas que alcanza para el curso: 6 puestos por fila con pasillo cada 2. */
export function suggestedRows(studentCount: number): RowsOptions {
  return { rows: clamp(Math.ceil(Math.max(studentCount, 1) / 6), 1, MAX_ROOM_SIZE), seatsPerRow: 6, aisleEvery: 2 };
}

/** Grupos que alcanzan para el curso, con 3 grupos por fila. */
export function suggestedGroups(studentCount: number, groupSize: 4 | 6 = 4): GroupsOptions {
  return { groups: Math.max(1, Math.ceil(studentCount / groupSize)), groupSize, groupsPerRow: 3 };
}

/** Mesones que alcanzan para el curso, con 3 puestos por lado y 2 mesones por fila. */
export function suggestedLab(studentCount: number): LabOptions {
  return { benchesPerRow: 2, benchRows: Math.max(1, Math.ceil(studentCount / 12)), seatsPerSide: 3 };
}

/**
 * Agrega o quita un puesto. Un puesto nuevo hereda el grupo de un vecino;
 * quitar el último puesto no se permite.
 */
export function toggleSlot(layout: RoomLayout, row: number, col: number): RoomLayout {
  const exists = layout.slots.some((slot) => slot.row === row && slot.col === col);
  if (exists) {
    if (layout.slots.length === 1) return layout;
    return { ...layout, slots: layout.slots.filter((slot) => !(slot.row === row && slot.col === col)) };
  }
  const neighbor = layout.slots.find((slot) => slot.group && Math.abs(slot.row - row) + Math.abs(slot.col - col) === 1);
  const slot: LayoutSlot = neighbor?.group ? { row, col, group: neighbor.group } : { row, col };
  return { ...layout, slots: [...layout.slots, slot].sort((a, b) => a.row - b.row || a.col - b.col) };
}

/** Agrega o quita una fila o columna al final de la grilla. */
export function resizeLayout(layout: RoomLayout, rows: number, cols: number): RoomLayout {
  const nextRows = clamp(rows, 1, MAX_ROOM_SIZE);
  const nextCols = clamp(cols, 1, MAX_ROOM_SIZE);
  const slots = layout.slots.filter((slot) => slot.row < nextRows && slot.col < nextCols);
  return slots.length ? { ...layout, rows: nextRows, cols: nextCols, slots } : layout;
}

/** Mensaje si la forma no es válida; null si se puede guardar. */
export function layoutError(layout: RoomLayout): string | null {
  if (layout.rows < 1 || layout.cols < 1 || layout.rows > MAX_ROOM_SIZE || layout.cols > MAX_ROOM_SIZE) {
    return `La sala puede tener hasta ${MAX_ROOM_SIZE} filas y ${MAX_ROOM_SIZE} columnas.`;
  }
  if (!layout.slots.length) return "La sala necesita al menos un puesto.";
  const keys = new Set<string>();
  for (const slot of layout.slots) {
    if (slot.row < 0 || slot.col < 0 || slot.row >= layout.rows || slot.col >= layout.cols) {
      return "Hay puestos fuera de la sala.";
    }
    const key = `${slot.row}-${slot.col}`;
    if (keys.has(key)) return "Hay puestos repetidos.";
    keys.add(key);
  }
  return null;
}

/** La forma de una sala guardada, para editarla. */
export function layoutFromTemplate(template: RoomTemplate, slots: RoomSlot[]): RoomLayout {
  const kind = template.layout && template.layout !== "classic" ? template.layout : "rows";
  return {
    kind,
    rows: template.rowCount,
    cols: template.columnCount,
    slots: slots
      .filter((slot) => slot.templateId === template.id && slot.status === "available")
      .map((slot) => (slot.groupLabel ? { row: slot.seatRow, col: slot.seatCol, group: slot.groupLabel } : { row: slot.seatRow, col: slot.seatCol }))
      .sort((a, b) => a.row - b.row || a.col - b.col),
  };
}
