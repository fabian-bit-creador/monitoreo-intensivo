"use client";

import { useSyncExternalStore } from "react";
import {
  inspectBrowserData,
  type LocalDataSnapshot,
  type SavedCopy,
} from "@/features/monitoring/repositories";
import { downloadText } from "@/lib/download";
import { backupFileName, createBackup } from "../lib/backup";

let snapshot: LocalDataSnapshot | null | undefined;
const noUpdates = () => () => undefined;

function readOnce() {
  if (snapshot === undefined) snapshot = inspectBrowserData();
  return snapshot;
}

/**
 * Datos que el modo sin cuenta dejó en este navegador. Con cuentas no se
 * borran ni se suben: solo se ofrecen para descargar. En el servidor no hay
 * navegador, así que la primera pintura no muestra nada.
 */
export function useBrowserLocalData() {
  return useSyncExternalStore(noUpdates, readOnce, () => null);
}

/** Respaldo restaurable si los datos se pueden leer; si no, tal como están. */
export function downloadBrowserData(data: LocalDataSnapshot) {
  const text = data.state ? JSON.stringify(createBackup(data.state), null, 2) : data.raw;
  downloadText(backupFileName("monitoreo-respaldo-navegador"), text);
}

export function downloadBrowserCopy(copy: SavedCopy) {
  downloadText(backupFileName(`monitoreo-copia-${copy.kind === "restore" ? "restauracion" : "recuperacion"}`), copy.raw);
}
