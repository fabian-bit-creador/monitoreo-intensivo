# Diferencias conocidas respecto del Site original

## Intencionales

| Elemento | Site original | Migración 0.1 | Motivo |
| --- | --- | --- | --- |
| Persistencia | Cloudflare D1 administrado por ChatGPT Sites | `localStorage` por navegador | Evitar infraestructura permanente en esta etapa |
| Sincronización | Estado compartido del Site | No existe sincronización entre dispositivos | Multiusuario queda fuera de alcance |
| Identidad | Selector de docente en enlace público | Mismo selector, sin autenticación | Autenticación compleja queda fuera de alcance |
| Datos | Registros y nómina reales en el despliegue original | 40 estudiantes ficticios y sesiones demo | Privacidad y repositorio seguro |
| Indicador superior | “Sincronizado” | “Guardado local” | Describir honestamente la persistencia |
| Infraestructura | Vinext, Wrangler, D1 y scripts de Sites | Next.js estándar compatible con Vercel | Independencia de ChatGPT Work |

## No trasladado

- Historial real de clases del Site.
- Código e historial Git que contenían nombres reales de estudiantes.
- Configuración y credenciales internas de ChatGPT Sites.
- Base de datos original y sus migraciones.

## Fidelidad conservada

Se preservaron estructura, colores, tipografía, tarjetas, navegación, breakpoints, mapa de puestos, sala/taller, tres recorridos, registro I/R/C, porcentajes, asistencia, movimiento de puestos, KPI, informes, recomendaciones, historial, importación y exportaciones.

Una comparación visual final con datos equivalentes debe realizarse en el Preview Deployment de Vercel, ya que la fuente original contiene datos que deliberadamente no forman parte de este repositorio.
