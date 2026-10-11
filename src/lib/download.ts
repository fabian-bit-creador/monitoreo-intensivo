/** Descarga un texto como archivo desde el navegador. */
export function downloadText(fileName: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revocar en el mismo instante cancela la descarga en algunos navegadores.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
