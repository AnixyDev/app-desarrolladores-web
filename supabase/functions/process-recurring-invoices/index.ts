import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// El calculo de fechas vive aparte para que vitest pueda cubrirlo en CI.
// Ver src/test/fechas-recurrentes.test.ts
import { siguienteFecha } from './fechas.ts'

serve(async (req) => {
  // Solo permitir solicitudes autorizadas (la tarea programada de pg_cron
  // envia la clave de servicio en la cabecera Authorization).
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    const today = new Date().toISOString().split('T')[0]

    // 1. Obtener facturas recurrentes que deben procesarse hoy o antes
    const { data: recurringInvoices, error: fetchError } = await supabase
      .from('recurring_invoices')
      .select('*')
      .lte('next_due_date', today)

    if (fetchError) throw fetchError

    const results: Array<{ recurring_id: string; invoice_id: string }> = []
    const omitidas: Array<{ recurring_id: string; motivo: string }> = []

    for (const rec of (recurringInvoices || [])) {
      // 2. Calcular la fecha siguiente ANTES de emitir nada. Si no sabemos
      //    avanzarla, no se genera factura: mas vale no emitir que emitir en
      //    bucle todos los dias.
      const proximaFecha = siguienteFecha(rec.next_due_date, rec.frequency, rec.start_date)
      if (!proximaFecha) {
        console.error(
          `Recurrente ${rec.id}: frecuencia "${rec.frequency}" no contemplada — se omite sin emitir`
        )
        omitidas.push({ recurring_id: rec.id, motivo: `frecuencia no contemplada: ${rec.frequency}` })
        continue
      }

      if (!Array.isArray(rec.items) || rec.items.length === 0) {
        console.error(`Recurrente ${rec.id}: sin lineas de factura — se omite`)
        omitidas.push({ recurring_id: rec.id, motivo: 'sin lineas' })
        continue
      }

      // 3. Importes. Se redondea el subtotal ademas del total: las columnas son
      //    enteras y una cantidad decimal (1,5 horas) dejaba centimos sueltos,
      //    de modo que subtotal e impuestos podian no sumar el total.
      const subtotal = Math.round(
        rec.items.reduce(
          (sum: number, item: any) => sum + Number(item.price_cents) * Number(item.quantity),
          0
        )
      )
      if (!Number.isFinite(subtotal)) {
        console.error(`Recurrente ${rec.id}: importes no numericos — se omite`)
        omitidas.push({ recurring_id: rec.id, motivo: 'importes no numericos' })
        continue
      }
      const taxPercent = Number(rec.tax_percent ?? 0)
      const total = Math.round(subtotal + subtotal * (taxPercent / 100))

      // 4. Numero de factura correlativo (AEAT). No se usa Date.now(): dos
      //    iteraciones del bucle pueden caer en el mismo milisegundo.
      const { data: invoiceNumber, error: numberError } = await supabase.rpc('generate_invoice_number', {
        p_user_id: rec.user_id,
      })
      if (numberError) {
        console.error(`Recurrente ${rec.id}: error generando numero de factura:`, numberError)
        omitidas.push({ recurring_id: rec.id, motivo: 'no se pudo generar el numero' })
        continue
      }

      const { data: newInvoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          user_id: rec.user_id,
          client_id: rec.client_id,
          project_id: rec.project_id,
          invoice_number: invoiceNumber,
          issue_date: today,
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          items: rec.items,
          subtotal_cents: subtotal,
          tax_percent: taxPercent,
          total_cents: total,
          paid: false,
        })
        .select()
        .single()

      if (invoiceError || !newInvoice) {
        console.error(`Recurrente ${rec.id}: error creando la factura:`, invoiceError)
        omitidas.push({ recurring_id: rec.id, motivo: 'no se pudo crear la factura' })
        continue
      }

      // 5. Avanzar la fecha. Si esto falla y dejamos la factura emitida, manana
      //    la tarea vuelve a seleccionar la misma fila y emite un DUPLICADO.
      //    Antes solo se registraba el error y se seguia. Ahora se deshace la
      //    factura recien creada para que la fila quede coherente y se
      //    reintente limpio en la siguiente ejecucion.
      const { error: updateError } = await supabase
        .from('recurring_invoices')
        .update({ next_due_date: proximaFecha })
        .eq('id', rec.id)

      if (updateError) {
        console.error(
          `Recurrente ${rec.id}: no se pudo avanzar next_due_date, se anula la factura ${newInvoice.id}:`,
          updateError
        )
        const { error: rollbackError } = await supabase
          .from('invoices')
          .delete()
          .eq('id', newInvoice.id)
        if (rollbackError) {
          console.error(
            `Recurrente ${rec.id}: ATENCION, la factura ${newInvoice.id} quedo emitida y la fecha sin avanzar. Revisar a mano.`,
            rollbackError
          )
        }
        omitidas.push({ recurring_id: rec.id, motivo: 'no se pudo avanzar la fecha' })
        continue
      }

      results.push({ recurring_id: rec.id, invoice_id: newInvoice.id })
    }

    return new Response(
      JSON.stringify({ processed: results.length, skipped: omitidas.length, details: results, omitidas }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error: any) {
    console.error('Error processing recurring invoices:', error)
    return new Response(JSON.stringify({ error: error?.message ?? String(error) }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
