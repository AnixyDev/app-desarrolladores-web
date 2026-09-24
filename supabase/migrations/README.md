# Migraciones

Historial de cambios del esquema de la base de datos, tal como está registrado
en producción. Recuperado con `supabase migration fetch` el 24/09/2026.

## Lee esto antes de tocar nada

**`supabase db pull` y `supabase db reset` NO funcionan en este proyecto, y no
es un error tuyo.**

El primer archivo, `20251216210335_remote_schema.sql`, está vacío. No se perdió:
nunca llegó a guardarse. Es la entrada que Supabase creó al enlazar el proyecto
con la CLI, y el contenido de esa "foto inicial" no se registró en la tabla de
historial. La siguiente migración es del 4 de julio de 2026, así que **los siete
meses de esquema que hay entre medias —`profiles`, `clients`, `projects`,
`invoices`, `tasks`, lo básico— no están en ninguno de estos archivos.**

Por eso, cualquier comando que reconstruya la base de datos reproduciendo estas
migraciones desde cero falla en la segunda:

```
Applying migration 20251216210335_remote_schema.sql...
Applying migration 20260704094652_fix_rls_with_check_true_policies.sql...
ERROR: relation "public.contract_templates" does not exist
```

Lógico: esa tabla se creó durante los meses que faltan.

## Entonces, ¿para qué sirven estos archivos?

Para **leer el historial**. Qué cambió, cuándo y por qué. Es documentación real
del proyecto, y hasta el 24/09/2026 solo existía dentro de Supabase.

Para **seguir adelante**. `supabase db push` sí funciona: compara lo local con
lo remoto por número de versión, sin reproducir nada. A día de hoy responde
"Remote database is up to date".

## Para reconstruir la base de datos desde cero

No uses esta carpeta. Usa `../schema/`:

1. `../schema/esquema-actual.sql` — volcado completo del esquema `public`.
   51 tablas, 126 políticas RLS, 23 funciones, 9 tipos enumerados.
2. `../schema/fuera-de-public.sql` — lo que el volcado no se lleva: el
   disparador de `auth.users` que crea los perfiles, los tres cubos de
   almacenamiento, las políticas de `storage` y las dos tareas de `pg_cron`.

En ese orden.

## Cómo hacer un cambio de esquema a partir de ahora

1. `supabase migration new nombre_del_cambio`
2. Escribe el SQL en el archivo que ha creado.
3. `supabase db push` para aplicarlo.
4. **Regenera el volcado** — si no, `schema/` se queda atrás y vuelve el
   problema que esto venía a resolver:
   ```
   supabase db dump -f supabase/schema/esquema-actual.sql
   ```
5. El archivo de migración **y** el volcado actualizado van en el mismo PR.

Si el cambio toca algo fuera del esquema `public` (un cubo de almacenamiento,
una tarea de cron, un disparador sobre `auth.users`), actualiza también
`schema/fuera-de-public.sql` a mano: `db dump` no lo ve.

## Lo que NO hay que hacer nunca

Cuando `db pull` falla, la CLI sugiere esto:

```
supabase migration repair --status reverted 20251216210335
supabase migration repair --status reverted 20260704094652
... (78 líneas)
```

**No lo ejecutes.** No revierte nada en la base de datos, pero borra el registro
de que esas 78 migraciones se aplicaron. A partir de ahí, un `db push`
intentaría aplicarlas todas otra vez sobre un esquema que ya las tiene.
