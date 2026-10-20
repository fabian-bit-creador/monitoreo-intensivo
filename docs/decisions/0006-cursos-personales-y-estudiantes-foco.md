# ADR 0006: cursos personales y estudiantes foco

- Estado: aceptada
- Fecha: 2026-10-18

## Contexto

La interfaz piloto permitía cambiar el «docente activo» y mostraba nombres de otras personas. Ese modelo no corresponde al uso real: cada docente inicia sesión con su propia cuenta y debe acceder únicamente a sus cursos, estudiantes, clases e informes.

El primer uso también necesita una configuración guiada. El docente define el curso, el año académico, el tamaño esperado de la nómina y cuántos estudiantes foco tendrá; luego descarga una plantilla numerada, carga la nómina, elige los estudiantes foco y configura la sala.

## Decisión

1. La identidad activa proviene siempre de la sesión autenticada. La aplicación no ofrece un selector de docentes.
2. Cada curso pertenece a la cuenta que lo creó mediante `courses.created_by`. Las políticas y funciones de base de datos verifican esa propiedad en cada lectura y escritura.
3. El espacio personal de la cuenta es el destino predeterminado y obligatorio para los cursos creados desde esta experiencia.
4. Un curso conserva su año académico y puede archivarse. Archivar es la acción normal de retiro y requiere confirmación; los datos históricos permanecen asociados.
5. `enrollments.is_focus` representa la selección vigente. `session_students.is_focus` guarda la fotografía de esa condición al iniciar cada clase, igual que el nombre, número y puesto.
6. La configuración inicial se considera completa cuando existe al menos un curso activo con nómina. El borrador del asistente puede conservarse localmente para recuperarse después de cerrar la ventana.

## Consecuencias

- La navegación incorpora «Mis cursos» para crear, seleccionar, editar, archivar y restaurar cursos.
- La estrella de foco se muestra en las vistas del estudiante y queda estable en los informes históricos de cada clase.
- Los administradores de un establecimiento dejan de obtener acceso implícito a los cursos personales de otros docentes.
- La eliminación definitiva y la política de retención histórica quedan fuera de esta decisión; hasta definirlas, se usa archivado recuperable.
