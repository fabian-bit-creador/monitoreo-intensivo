# LiquidApp — auditoría y versión corregida

Esta carpeta **no es parte de la aplicación Monitoreo Intensivo**. Contiene material de
retroalimentación docente sobre un proyecto de estudiantes, guardado aquí para tener
historial de versiones.

## Contexto

LiquidApp es el proyecto del Grupo 1 de IV°A (Administración de Empresas, mención
Recursos Humanos) para la Feria Técnico Profesional 2026 del Colegio Cardenal José
María Caro: un simulador de liquidaciones de sueldo y finiquitos según la legislación
laboral chilena.

Se auditó la entrega del 7 de septiembre de 2026 (`Enlace_LiquidApp.htm`, 1.080 líneas)
y se reescribió con las correcciones aplicadas.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `auditoria.html` | Informe de auditoría: 23 hallazgos priorizados y 13 parámetros legales verificados contra la fuente oficial. |
| `LiquidApp.html` | Versión corregida del simulador. Un solo archivo autocontenido, sin dependencias externas. |

## La versión corregida

Se abre con doble clic. **No necesita servidor, ni instalación, ni conexión a internet:**
el CSS, los íconos (SVG) y el motor de cálculo están dentro del archivo.

- `?pruebas=1` en la dirección corre las 22 pruebas del motor al abrir la página.
  También hay un botón "Verificar el motor de cálculo" dentro de la calculadora.
- Todos los valores legales viven en el objeto `PARAMETROS`, al principio del script.
  **Ese es el único lugar donde hay que actualizar cifras** cuando cambie la ley.
- La página no envía datos a ningún servidor. La memoria del navegador guarda los montos
  de la última simulación, pero nunca nombres ni RUT.

## Parámetros vigentes al momento de la revisión

| Parámetro | Valor | Fuente |
| --- | --- | --- |
| UTM septiembre 2026 | $71.721 | SII |
| Ingreso mínimo mensual | $553.553 desde el 1 de mayo de 2026 | Ley de reajuste |
| Valor UF | ≈ $40.875 | Banco Central |
| Tope imponible AFP y salud | 90,0 UF | Superintendencia de Pensiones |
| Tope imponible cesantía | 135,2 UF | Superintendencia de Pensiones |
| Jornada semanal ordinaria | 42 horas desde el 26/04/2026 | Ley 21.561 |

## Qué queda pendiente para el equipo

1. Confirmar con Recursos Humanos si el aguinaldo del establecimiento es imponible.
2. Agregar la UTM de octubre, noviembre y diciembre de 2026 cuando el SII las publique.
3. Validar contra tres liquidaciones reales anonimizadas y autorizadas.
4. Escribir el guion de demostración de tres minutos para el stand.
5. Probar en un celular real, sin conexión, el día anterior a la Feria.
