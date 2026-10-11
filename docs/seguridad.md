# Seguridad

## Cabeceras de la página (`next.config.ts`)

| Cabecera | Efecto |
|---|---|
| `Content-Security-Policy` | Scripts, estilos, fuentes e imágenes solo del propio sitio. Conexiones solo al propio sitio y, si la compilación usa Supabase, a ese proyecto. Sin `<object>` y sin formularios hacia otros dominios. |
| `frame-ancestors 'none'` y `X-Frame-Options: DENY` | Nadie puede incrustar la app en otra página para engañar clics. |
| `X-Content-Type-Options: nosniff` | El navegador no reinterpreta archivos como scripts. |
| `Referrer-Policy: strict-origin-when-cross-origin` | Los enlaces externos no reciben la ruta interna. |
| `Permissions-Policy` | Cámara, micrófono, ubicación, pagos y USB desactivados. |

`script-src` incluye `'unsafe-inline'` porque la página es estática y Next.js inserta scripts en
línea que no pueden llevar nonce. La protección principal sigue en pie: ningún script ni conexión
puede venir de otro dominio. HSTS lo agrega Vercel.

Si se agrega un servicio externo (analítica, fuentes, otra API), hay que sumarlo a la política;
si no, el navegador lo bloqueará y lo mostrará en la consola.

## Dependencias

- Ejecutar `npm audit --omit=dev` antes de cada entrega y usar versiones publicadas hace al menos
  dos semanas.
- SheetJS ya no publica en npm: `xlsx` se instala desde `cdn.sheetjs.com` (0.20.3), que corrige la
  contaminación de prototipos y el ReDoS de la 0.18.5.
- Riesgo aceptado el 11-10-2026: quedan dos avisos altos cuya corrección aún no cumple dos semanas.
  - Los de `next` afectan `use cache`, Draft Mode, Image Optimization, las rutas de imágenes de
    metadatos, la caché autoalojada y el servidor de desarrollo, que esta app no usa.
  - `source-map-js` solo corre al compilar.

  Hay que actualizar `next` a 16.4 cuando cumpla dos semanas.

## Revisión del repositorio (11-10-2026)

Se revisaron todas las ramas y el historial completo. No se encontró nada de lo siguiente:

- instrucciones ocultas para agentes de IA;
- caracteres invisibles o bidireccionales;
- scripts de instalación propios;
- llamadas de red a dominios desconocidos;
- secretos, salvo la contraseña de la base temporal de la CI.

Todos los autores de los commits son conocidos. La CI no usa secretos ni `pull_request_target`.

## Correos sospechosos

Ningún correo legítimo de este proyecto pide contraseñas, códigos ni pagos. Ante un correo
dudoso:

1. No abrir adjuntos ni enlaces.
2. Revisar el remitente real y los encabezados SPF y DKIM.
3. Reportarlo como phishing.
