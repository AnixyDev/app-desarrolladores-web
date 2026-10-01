-- Cumplimiento fiscal (registro encadenado + QR tributario) activado por
-- defecto en las cuentas nuevas, en modalidad «No VERI*FACTU».
-- Desde el 1 de julio de 2027 toda factura de un autónomo emitida con un
-- sistema informático debe llevarlo (RD 1007/2023, plazos del RDL 15/2025).
-- Las cuentas existentes no cambian: cada usuario decide en Ajustes.
alter table public.profiles alter column veri_factu_enabled set default true;
