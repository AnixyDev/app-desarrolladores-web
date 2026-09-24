-- Los cobros hechos con Stripe desde la pagina publica de pago no dejaban
-- ninguna fila en public.payments: el webhook marcaba invoices.paid y nada
-- mas. Eso hacia que remaining_cents (que se calcula sumando payments) siguiera
-- mostrando el importe completo despues de pagar, y que el historial del
-- cliente y las previsiones no vieran el cobro.
--
-- Se anade la referencia al PaymentIntent para poder registrarlos, y un indice
-- unico parcial que impide duplicar el mismo cobro si Stripe reintenta el
-- evento. Es parcial (where ... is not null) para que los pagos manuales,
-- que no tienen PaymentIntent, no choquen entre si.

alter table public.payments
  add column if not exists stripe_payment_intent_id text;

create unique index if not exists payments_stripe_payment_intent_id_key
  on public.payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

comment on column public.payments.stripe_payment_intent_id is
  'PaymentIntent de Stripe cuando el cobro vino de la pagina publica de pago. Nulo en los pagos registrados a mano o conciliados del banco.';;
