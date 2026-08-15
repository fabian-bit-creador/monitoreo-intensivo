# ADR 0001: persistencia portable en la primera migración

- Estado: aceptada
- Fecha: 2026-08-15

## Contexto

El Site original guarda cursos, estudiantes, plantillas, sesiones y observaciones en Cloudflare D1 mediante una ruta API ligada al entorno de ChatGPT Sites. La réplica debe ejecutarse localmente y poder desplegarse en Vercel, sin añadir todavía autenticación ni una base permanente.

## Decisión

Definir un contrato de repositorio y utilizar `localStorage` como implementación de demostración. El estado inicial se genera desde datos ficticios. Las reglas y vistas reciben el mismo modelo independientemente del almacenamiento.

## Consecuencias

- La aplicación funciona sin cuentas, secretos ni infraestructura externa.
- Los cambios persisten solo en el navegador y dispositivo utilizados.
- No existe sincronización multiusuario en esta etapa.
- Supabase podrá incorporarse mediante un nuevo adaptador y políticas de acceso, sin reescribir la lógica visual.
- Esta diferencia respecto del Site original se documenta explícitamente y no se presenta como capacidad multiusuario.
