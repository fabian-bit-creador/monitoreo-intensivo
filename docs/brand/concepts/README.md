# Conceptos de marca

Propuestas para reemplazar el ícono actual, que es `Activity` de lucide: una línea de
electrocardiograma genérica que no dice nada de una sala de clases.

**Ninguno está aprobado como identidad definitiva.** Se prefiere provisionalmente el
concepto B.

| Archivo | Concepto | Idea |
|---|---|---|
| `logo-a-sala.svg` | La sala | Nueve puestos; tres observados en I, R y C |
| `logo-b-recorrido.svg` | **Recorrido** *(preferido)* | Trazo en serpentina por tres filas que cierra en verde |
| `logo-c-puesto.svg` | El puesto observado | Cuatro puestos, uno bajo observación en turquesa |

## Notas de implementación

Los tres usan `viewBox="0 0 24 24"` y `currentColor`, para heredar el color del contexto:
navy `#17375E` sobre fondo claro, blanco dentro del cuadro navy de la barra superior.

**Cuando se integre, debe hacerse como componente React inline.** A través de `<img>` el SVG
no hereda `currentColor` y el ícono quedaría del color equivocado en uno de los dos fondos.

Ajustes por concepto:

- **B** a 16 px: subir `stroke-width` a `2.9` y el radio del punto a `3.2`.
- **C** sobre fondo navy: el punto interior pasa de blanco a `#0F2948`.
- **A** y **C** sobre fondo navy: la opacidad de los puestos apagados sube de `.22` a `.38`.
