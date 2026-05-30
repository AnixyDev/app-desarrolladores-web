import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Solo permitir solicitudes autorizadas (ej. mediante service role o un secreto compartido)
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
      .lte('next_date', today)

    if (fetchError) throw fetchError

    const results = []

    for (const rec of (recurringInvoices || [])) {
      // 2. Generar la nueva factura
      const subtotal = rec.items.reduce((sum: number, item: any) => sum + item.price_cents * item.quantity, 0)
      const taxAmount = subtotal * (rec.tax_percent / 100)
      const total = Math.round(subtotal + taxAmount)

      const { data: newInvoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          user_id: rec.user_id,
          client_id: rec.client_id,
          project_id: rec.project_id,
          invoice_number: `INV-REC-${Date.now().toString().slice(-6)}`,
          issue_date: today,
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          items: rec.items,
          subtotal_cents: subtotal,
          tax_percent: rec.tax_percent,
          total_cents: total,
          paid: false
        })
        .select()
        .single()

      if (invoiceError) {
        console.error(`Error generating invoice for recurring ${rec.id}:`, invoiceError)
        continue
      }

      // 3. Calcular la siguiente fecha
      const nextDate = new Date(rec.next_date)
      if (rec.frequency === 'monthly') {
        nextDate.setMonth(nextDate.getMonth() + 1)
      } else if (rec.frequency === 'yearly') {
        nextDate.setFullYear(nextDate.getFullYear() + 1)
      }
      const nextDateStr = nextDate.toISOString().split('T')[0]

      // 4. Actualizar la factura recurrente
      const { error: updateError } = await supabase
        .from('recurring_invoices')
        .update({ next_date: nextDateStr })
        .eq('id', rec.id)

      if (updateError) {
        console.error(`Error updating next_date for recurring ${rec.id}:`, updateError)
      }

      results.push({ recurring_id: rec.id, invoice_id: newInvoice.id })
    }

    return new Response(JSON.stringify({ processed: results.length, details: results }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error: any) {
    console.error('Error processing recurring invoices:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
