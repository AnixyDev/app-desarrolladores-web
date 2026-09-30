-- Eliminar cuenta (30/09/2026): la primera baja real falló al borrar el
-- usuario. Sus `businesses` (Lead Hunter) caen en cascada, pero
-- processed_resend_events.business_id no tenía ON DELETE y lo impedía.
-- Esos registros solo sirven para no procesar dos veces un aviso de Resend
-- de ese business: sin él no significan nada.
alter table public.processed_resend_events drop constraint processed_resend_events_business_id_fkey,
  add constraint processed_resend_events_business_id_fkey
  foreign key (business_id) references public.businesses(id) on delete cascade;
