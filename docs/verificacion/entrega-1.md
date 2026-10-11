# Verificación de la entrega 1: integridad y resguardo

Sirve para revisar los PR #8 (1a) y #9 (1b) en el Preview de Vercel o en local con
`npm run build && npm run start`. Usa **solo datos ficticios**.

## Pruebas automáticas

```bash
npm run check   # tipos, lint, 229 pruebas y build
```

Las pruebas del repositorio local simulan varias pestañas sobre el mismo almacenamiento
(`local-storage-monitoring-repository.test.ts`). Las de nómina comprueban que el informe de una
clase anterior no cambia al actualizar la nómina (`roster-update.test.ts`).

## 1a. Resguardo local

| # | Pasos | Resultado esperado |
|---|---|---|
| 1 | Abre la aplicación en dos pestañas. En la primera, registra C a un estudiante. En la segunda, sin recargar, marca ausente a otro | Se conservan ambos cambios y cada pestaña ve el de la otra sin recargar |
| 2 | Configuración → Respaldo → **Descargar respaldo** | Se descarga `monitoreo-respaldo-AAAA-MM-DD.json` |
| 3 | **Restaurar respaldo** con ese archivo y luego **Reemplazar datos** | La vista previa muestra cursos, estudiantes, clases y observaciones; después aparece «Respaldo restaurado» y Configuración lista «Datos reemplazados al restaurar» |
| 4 | Restaurar un archivo que no es JSON | El modal informa el error y no cambia ningún dato |
| 5 | En la consola: `localStorage.setItem("monitoreo-intensivo:v1", JSON.stringify({ version: 99, state: {} }))` y recarga | Pantalla «Hay datos de una versión más nueva»; los datos guardados no cambian |
| 6 | En la consola: `localStorage.setItem("monitoreo-intensivo:v1", "{dañado")` y recarga | Pantalla «No pudimos abrir los datos guardados»; «Empezar de nuevo» se habilita solo después de descargar la copia |
| 7 | En celular (390 px), abre Configuración | La tarjeta Respaldo muestra los botones apilados y sin desplazamiento horizontal |

La falla de escritura (almacenamiento lleno) se cubre con pruebas automáticas: la barra muestra
«Sin guardar» y el aviso aparece dentro de la hoja de registro.

## 1b. Nómina

Prepara planillas ficticias con las columnas `N°` y `Nombre Completo Alumno`.

| # | Pasos | Resultado esperado |
|---|---|---|
| 1 | Una planilla con la hoja «Instrucciones» primero y la nómina en la segunda hoja | La vista previa lee la segunda hoja |
| 2 | Crea un curso «III°B Ficticio» con 3 estudiantes, escribiendo el nombre en el modal | Se crea sin ventanas emergentes del navegador |
| 3 | Vuelve a subir esa nómina con dos N° intercambiados, un estudiante nuevo y uno menos | Propone **Actualizar la nómina** de III°B Ficticio, resume los cambios y no crea otro curso |
| 4 | En III°A: Historial → clase del 29 de julio → **Excel**. Luego actualiza la nómina de III°A con el N° 1 y el 2 intercambiados, sin el 05 y con un estudiante 41. Vuelve a exportar la misma clase | Los dos Excel son idénticos |
| 5 | En la clase en curso de III°A, mira el mapa. Finaliza la clase y abre una nueva | En la clase en curso sigue el 05 y no aparece el 41; en la nueva aparece el 41 sin puesto y no aparece el 05 |
| 6 | Dos filas con el mismo nombre y distinto N° | Aviso de homónimos; se importan ambos |
| 7 | Una planilla sin encabezado con títulos («Lista de estudiantes», «Profesor jefe: …») y los nombres en una columna | Toma solo los nombres y pide revisar la lista |
| 8 | Un N° repetido, o la plantilla descargada en blanco | Error dentro del modal y el botón de carga deshabilitado |
| 9 | Selecciona el curso pendiente III°C e importa una nómina | Propone completar III°C; queda operativo sin duplicarse |
