# Documentación oficial de Verifactu (AEAT)

Copia de trabajo de la documentación técnica de la Agencia Tributaria para
el desarrollo de Verifactu en DevFreelancer. Ver el plan en el proyecto
(`claude/plan-verifactu.md`).

## esquemas/ — oficiales, verificados el 06/10/2026

Descargados de la propia AEAT desde una Edge Function de Supabase
(`https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/`),
con su huella SHA-256 comprobada contra el original. Las huellas están en
`SHA256SUMS`. **Si la AEAT publica una versión nueva, se vuelven a descargar
y se comparan las huellas.**

Aviso: las copias que circulan en librerías públicas estaban desfasadas en
5 de los 7 esquemas (por ejemplo, `RespuestaConsultaLR.xsd` usa «Correcto»
y no «Correcta», y la consulta tiene un tipo propio de SistemaInformatico).
Usar siempre estos.

| Archivo | Para qué |
|---|---|
| SistemaFacturacion.wsdl | Servicio SOAP. Pruebas: `https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP` (certificado personal; `prewww10` para certificado de sello). Producción: `www1.agenciatributaria.gob.es` / `www10`. |
| SuministroLR.xsd | Mensaje de envío (RegFactuSistemaFacturacion: cabecera + hasta 1.000 registros). |
| SuministroInformacion.xsd | Tipos comunes: RegistroAlta, RegistroAnulacion, desgloses, SistemaInformatico… |
| RespuestaSuministro.xsd | Respuesta al envío (Correcto / AceptadoConErrores / Incorrecto, TiempoEsperaEnvio). |
| ConsultaLR.xsd, RespuestaConsultaLR.xsd | Consulta de registros enviados. |
| EventosSIF.xsd, RespuestaValRegistNoVeriFactu.xsd | Solo modalidad «No Veri\*Factu»: DevFreelancer no los usa (decisión de Ana: solo VERI\*FACTU). |

## Documentación técnica (PDF) — no se guarda en el repositorio

Se consulta en la sede de la AEAT, «Información técnica» de Verifactu
(https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/informacion-tecnica.html).
Versiones con las que se trabaja:

| Documento | Versión |
|---|---|
| Algoritmo de la huella (Veri-Factu_especificaciones_huella_hash_registros.pdf) | 0.1.2 |
| Características del QR (DetalleEspecificacTecnCodigoQRfactura.pdf) | 0.4.7 |
| Servicio web (Veri-Factu_Descripcion_SWeb.pdf) | 1.0.3 — idéntico al oficial, comprobado el 06/10/2026 |
| Validaciones y errores (Validaciones_Errores_Veri-Factu.pdf) | 1.2.0 |
| Ejemplos de declaración responsable | — |

## Huella: ejemplo oficial (prueba de la fase 1)

Cadena (sin escapar nada, sin espacios al inicio ni al final de cada valor):

```
IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00
```

SHA-256 en hexadecimal y MAYÚSCULAS:
`3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60`
(comprobado aquí con `sha256sum`).

## Fase 0: resultado de la prueba de conexión (06/10/2026)

Desde una Edge Function de Supabase (`supabase-edge-runtime-1.77.0`, compatible con Deno 2.1.4):

1. Sin certificado, `prewww1.aeat.es` responde **403**.
2. Con un certificado autofirmado desechable responde **401** (certificado no reconocido): el runtime presenta el certificado de cliente con `Deno.createHttpClient({ cert, key })`.
3. Con el certificado FNMT de Ana (el que ya estaba subido en Ajustes, leído y descifrado igual que lo guarda `manage-secrets`) responde un **SOAP Fault `Codigo[4118]`** a un sobre vacío: **autenticación aceptada**.
4. `node-forge` abre el `.p12` (también con cifrado antiguo, como los de la FNMT).

Conclusión: **el envío puede vivir en Supabase**; no hace falta un servidor aparte.
La función temporal `aeat-prueba-conexion` quedó desactivada (responde 410) y se puede borrar desde el panel.
