# CLAUDE.md — DevFreelancer (devfreelancer.app)

Contexto fijo para Claude. Léelo antes de explorar: casi todo lo que necesitas está aquí.

## Cómo trabajar con Ana
- Habla siempre en **español**, breve y claro. Ana no es técnica en SQL/terminal: pasos simples, click a click.
- **Diagnostica antes de proponer**: mira el esquema real, la función desplegada y los logs (MCP) antes de escribir código.
- Mejoras de producto: **consúltalas antes**; si mejoran el producto, se hacen.
- Entrega del frontend: `git format-patch --binary` → Ana lo descarga en `~/Descargas/"Anixy dev"/` y lo aplica en su clon `~/Escritorio/captacion-clientes-web/app-desarrolladores-web` con rama nueva + `git am` + `git push` + PR.
  - Si la rama ya existe, `git checkout -b` falla y `git am` aplica en main: usa siempre un nombre nuevo.
- Base de datos y Edge Functions: **las aplica Claude directamente por MCP** (Supabase). Ana no toca SQL.
- Commits con las líneas de atribución que indique la sesión.

## Stack
React 18 + TypeScript + Vite + Zustand (slices en `hooks/store/`) + Tailwind · Supabase (Postgres + RLS + Auth + Edge Functions Deno + Vault + pg_cron + pg_net) · Stripe · Vercel · Gemini · Resend · Enable Banking. Gestor: **pnpm** (no npm).

IDs: Supabase `umqsjycqypxvhbhmidma` (plan **Free**) · Vercel team `team_xzF5B90IkoXJcMFKZecBMdt0`, proyecto `prj_mxtiOSpQUKJdADkGNIxqNWuCe7Ao` · repo `AnixyDev/app-desarrolladores-web` (main).

## Mapa del repo
| Ruta | Qué hay |
|---|---|
| `pages/` | Una página por ruta (rutas en `App.tsx`). `pages/legal/` textos legales y `/garantias`. |
| `components/` | UI por área (`settings/`, `ui/`, `layout/`, `modals/`…). |
| `hooks/store/*Slice.ts` | Estado y llamadas a Supabase. Carga inicial en `authSlice.ts` (lo que no se añade ahí no se carga al refrescar). |
| `lib/` | Lógica pura (testeable). `lib/verifactu/` reglas fiscales del front. |
| `services/pdfService.ts` | PDFs de facturas + QR tributario. |
| `supabase/migrations/` | Migraciones (nombre `AAAAMMDDhhmmss_nombre.sql`). |
| `supabase/functions/` | Edge Functions; código común en `_shared/`. `config.toml` fija `verify_jwt` de cada una. |
| `supabase/pruebas/*.sql` | Pruebas SQL: transacción que acaba en `raise exception` (no deja nada). |
| `src/test/` | Vitest. |
| `docs/verifactu/aeat/` | XSD/WSDL oficiales de la AEAT (no editar; `.gitattributes` binario). |
| `scripts/smoke-paginas.mjs` | Prueba de humo: pinta las 38 páginas. |

## Comandos
```bash
pnpm install
npx tsc --noEmit -p .
npx vitest run                       # ~660 pruebas
VITE_SUPABASE_URL=https://ejemplo.supabase.co VITE_SUPABASE_ANON_KEY=clave-falsa-solo-para-el-build-de-ci \
  VITE_STRIPE_PUBLISHABLE_KEY=pk_test_falsa_solo_para_el_build_de_ci pnpm build
CHROMIUM_PARA_PRUEBAS=/opt/pw-browsers/chromium node scripts/smoke-paginas.mjs
```

## Reglas que ya nos han mordido
- **Edge Functions NO se despliegan con git push.** Se despliegan por MCP con el contenido completo de cada archivo (incluidos los `../_shared/*.ts`). Antes de desplegar, `get_edge_function` y compara con el repo: ha habido desfases.
- `apply_migration` devuelve **"cancelled"** si la SQL lleva `drop` (policy/trigger/function). Usa `create or replace trigger`, `do $$ … if not exists (pg_policies) … $$`, `cron.schedule` con el mismo nombre (sustituye).
- `execute_sql` solo devuelve el resultado de la **última** sentencia.
- Cron → función: `net.http_post` con `Authorization: Bearer` + `vault.decrypted_secrets where name='cron_service_role_key'`; la función valida con `_shared/llamada-servicio.ts`. Respuesta en `net._http_response`.
- RLS: `(select auth.uid()) = user_id`. Un disparador que decide por `current_user` **nunca** `SECURITY DEFINER`. Funciones definer que suman/restan importes: rechazar `<= 0`.
- Claves de usuarios (`user_secrets`, `user_api_keys`): cifradas AES-GCM con `APP_ENCRYPTION_KEY`; **sin permisos para anon/authenticated**; solo se leen con la clave de servicio en Edge Functions.
- Stripe webhook: `verify_jwt=false`, `constructEventAsync`, API `2025-09-30.clover` (la suscripción está en `parent.subscription_details.subscription`).
- Gemini: usar alias `gemini-flash-latest` (Google retira modelos sin aviso).
- Importes siempre en **céntimos** (`*_cents`).
- El build de prueba necesita las VITE_ falsas de arriba o la app no arranca.

## Verifactu (estado: fases 0-3 hechas; fase 4 preparada, sin firmar ni activar)
Plan completo en el doc del proyecto `claude/plan-verifactu.md`.
- Solo modalidad VERI*FACTU, con el certificado de cada usuario (`_shared/verifactu-certificado.ts`).
- Registro oficial en `fiscal_records.registro` (jsonb con nombres del XSD); huella SHA-256 mayúsculas; cadena por `orden`. Registros **inmutables** salvo campos `envio_*`, `estado_envio`, `csv_respuesta_aeat`.
- XML: `_shared/verifactu-xml.ts` · SOAP/respuesta: `_shared/verifactu-soap.ts` · envío: función `verifactu-enviar` (cron cada minuto; `{"modo":"prueba"}` manda registros de prueba sin guardarlos).
- Solo VERI*FACTU (No Veri*Factu eliminado). Envío por cuenta: `profiles.verifactu_entorno` (`sin_envio` por defecto · `pruebas` · `produccion`), lo cambia SOLO el servidor con `verifactu_cambiar_entorno(user, entorno)` (exige NIF y certificado). Cada registro guarda su `entorno` (null = interno, no se envía, sin QR); cada entorno tiene su propia cadena (al encender: PrimerRegistro=S).
- AEAT real: además hace falta el secreto `VERIFACTU_PRODUCCION_PERMITIDA=si` en las funciones; sin él, los registros de producción esperan.
- Declaración responsable: `lib/verifactu/declaracionResponsable.ts` (`firmada: false` = borrador, solo lo ve Admin en /declaracion-responsable).
- ImporteTotal = base + IVA (sin IRPF). F1 con destinatario; F2 sin identificar ≤ 400 €; rectificativas por diferencias según la causa que elige el usuario (descuento/cancelación/error de IVA → R1; otro → R4; de una F2 → R5); S1 o N2.
- Cada envío a la AEAT se guarda entero en `verifactu_envios` (inmutable; `fiscal_records.envio_id`). Conservación tras la baja: 6 años.
- Batería contra la AEAT de pruebas: función `verifactu-bateria` (paso 1 y 2, sufijo nuevo cada vez, encadenando con `ultimo`).
- Pruebas: `supabase/pruebas/verifactu-registro.sql`, `src/test/verifactu-*.test.ts`.

## Pendiente conocido
- App.tsx re-renderiza las rutas ~12 veces por carga.
- Factura recurrente: avisar si el cliente no está identificado.
- Modo prueba de Verifactu: la AEAT avisa 2007 (ya existe primer registro) al repetir.
