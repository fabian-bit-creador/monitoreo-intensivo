import { describe, expect, it } from "vitest";
import {
  groupsLayout,
  labLayout,
  layoutError,
  layoutFromTemplate,
  resizeLayout,
  rowsLayout,
  suggestedGroups,
  suggestedLab,
  suggestedRows,
  toggleSlot,
  type RoomLayout,
} from "./room-layouts";

const cells = (layout: RoomLayout, row: number) =>
  layout.slots.filter((slot) => slot.row === row).map((slot) => slot.col);

const groupSizes = (layout: RoomLayout) => {
  const sizes = new Map<string, number>();
  for (const slot of layout.slots) sizes.set(slot.group ?? "", (sizes.get(slot.group ?? "") ?? 0) + 1);
  return Object.fromEntries(sizes);
};

describe("sala en filas", () => {
  it("deja un pasillo cada N puestos", () => {
    const layout = rowsLayout({ rows: 5, seatsPerRow: 6, aisleEvery: 2 });
    expect(layout).toMatchObject({ kind: "rows", rows: 5, cols: 8 });
    expect(cells(layout, 0)).toEqual([0, 1, 3, 4, 6, 7]);
    expect(layout.slots).toHaveLength(30);
  });

  it("sin pasillos, los puestos van juntos", () => {
    const layout = rowsLayout({ rows: 2, seatsPerRow: 4, aisleEvery: 0 });
    expect(layout.cols).toBe(4);
    expect(cells(layout, 1)).toEqual([0, 1, 2, 3]);
  });

  it("nunca pasa de 20 × 20", () => {
    const layout = rowsLayout({ rows: 40, seatsPerRow: 30, aisleEvery: 0 });
    expect(layout).toMatchObject({ rows: 20, cols: 20 });
    expect(layoutError(layout)).toBeNull();
  });
});

describe("laboratorio", () => {
  it("cada mesón tiene estudiantes a ambos lados y un nombre", () => {
    const layout = labLayout({ benchesPerRow: 2, benchRows: 2, seatsPerSide: 3 });
    expect(layout).toMatchObject({ kind: "lab", rows: 5, cols: 7 });
    expect(groupSizes(layout)).toEqual({ "Mesón 1": 6, "Mesón 2": 6, "Mesón 3": 6, "Mesón 4": 6 });
    expect(cells(layout, 0)).toEqual([0, 1, 2, 4, 5, 6]);
    expect(cells(layout, 2)).toEqual([]); // pasillo entre filas de mesones
    expect(layout.slots.filter((slot) => slot.group === "Mesón 1").map((slot) => `${slot.row}-${slot.col}`))
      .toEqual(["0-0", "0-1", "0-2", "1-0", "1-1", "1-2"]);
  });
});

describe("trabajo grupal", () => {
  it("arma islas de 4 con su número de grupo", () => {
    const layout = groupsLayout({ groups: 7, groupSize: 4, groupsPerRow: 3 });
    expect(layout).toMatchObject({ kind: "groups", rows: 8, cols: 8 });
    expect(layout.slots).toHaveLength(28);
    expect(groupSizes(layout)["Grupo 7"]).toBe(4);
    expect(layout.slots.filter((slot) => slot.group === "Grupo 2").map((slot) => `${slot.row}-${slot.col}`))
      .toEqual(["0-3", "0-4", "1-3", "1-4"]);
  });

  it("las islas de 6 tienen 3 puestos por lado", () => {
    const layout = groupsLayout({ groups: 2, groupSize: 6, groupsPerRow: 3 });
    expect(layout).toMatchObject({ rows: 2, cols: 7 });
    expect(groupSizes(layout)).toEqual({ "Grupo 1": 6, "Grupo 2": 6 });
  });
});

describe("sugerencias y validez", () => {
  it.each([1, 18, 30, 45, 80])("las formas sugeridas alcanzan para %i estudiantes", (count) => {
    for (const layout of [
      rowsLayout(suggestedRows(count)),
      labLayout(suggestedLab(count)),
      groupsLayout(suggestedGroups(count, 4)),
      groupsLayout(suggestedGroups(count, 6)),
    ]) {
      expect(layoutError(layout)).toBeNull();
      expect(layout.slots.length).toBeGreaterThanOrEqual(Math.min(count, layout.slots.length));
    }
    expect(rowsLayout(suggestedRows(count)).slots.length).toBeGreaterThanOrEqual(count);
    expect(groupsLayout(suggestedGroups(count, 6)).slots.length).toBeGreaterThanOrEqual(count);
  });

  it("cualquier combinación de parámetros produce una sala válida", () => {
    for (let a = 0; a <= 22; a += 3) {
      for (let b = 0; b <= 22; b += 4) {
        for (let c = 0; c <= 7; c += 2) {
          expect(layoutError(rowsLayout({ rows: a, seatsPerRow: b, aisleEvery: c }))).toBeNull();
          expect(layoutError(labLayout({ benchesPerRow: a, benchRows: b, seatsPerSide: c }))).toBeNull();
          expect(layoutError(groupsLayout({ groups: a * b, groupSize: c > 3 ? 6 : 4, groupsPerRow: b }))).toBeNull();
        }
      }
    }
  });

  it("detecta puestos fuera de la sala, repetidos o una sala vacía", () => {
    expect(layoutError({ kind: "custom", rows: 2, cols: 2, slots: [] })).toBe("La sala necesita al menos un puesto.");
    expect(layoutError({ kind: "custom", rows: 2, cols: 2, slots: [{ row: 2, col: 0 }] })).toBe("Hay puestos fuera de la sala.");
    expect(layoutError({ kind: "custom", rows: 2, cols: 2, slots: [{ row: 0, col: 0 }, { row: 0, col: 0 }] }))
      .toBe("Hay puestos repetidos.");
    expect(layoutError({ kind: "custom", rows: 21, cols: 2, slots: [{ row: 0, col: 0 }] })).toMatch("hasta 20");
  });
});

describe("ajustes a mano", () => {
  it("tocar un puesto lo quita y tocar un pasillo lo agrega, con el grupo del vecino", () => {
    const base = groupsLayout({ groups: 1, groupSize: 4, groupsPerRow: 1 });
    const without = toggleSlot(base, 0, 1);
    expect(without.slots).toHaveLength(3);
    const back = toggleSlot(without, 0, 1);
    expect(back.slots).toEqual(base.slots);
    const grown = toggleSlot(resizeLayout(base, 2, 3), 0, 2);
    expect(grown.slots.find((slot) => slot.row === 0 && slot.col === 2)).toEqual({ row: 0, col: 2, group: "Grupo 1" });
  });

  it("no deja una sala sin puestos", () => {
    const one: RoomLayout = { kind: "custom", rows: 1, cols: 1, slots: [{ row: 0, col: 0 }] };
    expect(toggleSlot(one, 0, 0)).toBe(one);
  });

  it("achicar la grilla quita los puestos que quedan fuera", () => {
    const layout = resizeLayout(rowsLayout({ rows: 3, seatsPerRow: 3, aisleEvery: 0 }), 2, 2);
    expect(layout).toMatchObject({ rows: 2, cols: 2 });
    expect(layout.slots).toHaveLength(4);
  });

  it("lee la forma de una sala guardada, con sus grupos y sin los puestos no disponibles", () => {
    const template = {
      id: "t", courseId: "c", name: "Sala", description: "", rowCount: 2, columnCount: 2,
      active: true, createdAt: "", layout: "groups" as const,
    };
    const layout = layoutFromTemplate(template, [
      { templateId: "t", seatRow: 1, seatCol: 1, status: "available", groupLabel: "Grupo 1" },
      { templateId: "t", seatRow: 0, seatCol: 0, status: "available" },
      { templateId: "t", seatRow: 0, seatCol: 1, status: "unavailable" },
      { templateId: "otra", seatRow: 1, seatCol: 0, status: "available" },
    ]);
    expect(layout).toEqual({
      kind: "groups", rows: 2, cols: 2, slots: [{ row: 0, col: 0 }, { row: 1, col: 1, group: "Grupo 1" }],
    });
  });
});
