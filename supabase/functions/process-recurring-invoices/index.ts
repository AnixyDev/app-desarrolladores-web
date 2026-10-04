import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { esLlamadaDelServicio } from '../_shared/llamada-servicio.ts'
// El calculo de fechas vive aparte para que vitest pueda cubrirlo en CI.
// Ver src/test/fechas-recurrentes.test.ts
import { siguienteFecha } from './fechas.ts'
// Importes (IVA e IRPF), también probados con vitest: src/test/importes-recurrentes.test.ts
import { importesDeRecurrente } from './importes.ts'

serve(async (req) => {
  // Solo permitir solicitudes autorizadas (la tarea programada de pg_cron
  // envia la clave de servicio en la cabecera Authorization).
  const authHeader = req.headers.get('Authorization')
  if (!esLlamadaDelServicio(authHeader, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))) {
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

    // CAMBIO (29/09): el cliente y el proyecto de cada recurrente se comprueban
    // contra su dueño antes de emitir. Esta función usa la clave de servicio
    // (sin RLS): una fila con el cliente de OTRO usuario habría producido una
    // factura a nombre de ese cliente ajeno. El disparador de referencias
    // propias ya impide crear filas así, pero las antiguas no pasaron por él.
    const filas = recurringInvoices || []
    const idsClientes = [...new Set(filas.map((r: any) => r.client_id).filter(Boolean))]
    const idsProyectos = [...new Set(filas.map((r: any) => r.project_id).filter(Boolean))]
    const dueñoDeCliente = new Map<string, string>()
    const tipoFiscalDeCliente = new Map<string, string | null>()
    const dueñoDeProyecto = new Map<string, string>()
    if (idsClientes.length) {
      const { data, error } = await supabase.from('clients').select('id, user_id, tipo_fiscal').in('id', idsClientes)
      if (error) throw error
      for (const c of data ?? []) {
        dueñoDeCliente.set(c.id, c.user_id)
        tipoFiscalDeCliente.set(c.id, c.tipo_fiscal ?? null)
      }
    }
    if (idsProyectos.length) {
      const { data, error } = await supabase.from('projects').select('id, user_id').in('id', idsProyectos)
      if (error) throw error
      for (const p of data ?? []) dueñoDeProyecto.set(p.id, p.user_id)
    }

    // Registro fiscal (huella encadenada): solo para quien lo tiene activado,
    // igual que al crear una factura desde la app.
    const idsUsuarios = [...new Set(filas.map((r: any) => r.user_id).filter(Boolean))]
    const conRegistroFiscal = new Set<string>()
    if (idsUsuarios.length) {
      const { data, error } = await supabase.from('profiles').select('id, veri_factu_enabled').in('id', idsUsuarios)
      if (error) throw error
      for (const p of data ?? []) if (p.veri_factu_enabled) conRegistroFiscal.add(p.id)
    }

    const results: Array<{ recurring_id: string; invoice_id: string }> = []
    const omitidas: Array<{ recurring_id: string; motivo: string }> = []
    const avisos: Array<{ recurring_id: string; invoice_id: string; aviso: string }> = []

    for (const rec of filas) {
      if (!rec.client_id || dueñoDeCliente.get(rec.client_id) !== rec.user_id) {
        console.error(`Recurrente ${rec.id}: el cliente no existe o no es del mismo usuario — se omite`)
        omitidas.push({ recurring_id: rec.id, motivo: 'cliente no valido' })
        continue
      }
      if (rec.project_id && dueñoDeProyecto.get(rec.project_id) !== rec.user_id) {
        console.error(`Recurrente ${rec.id}: el proyecto no existe o no es del mismo usuario — se omite`)
        omitidas.push({ recurring_id: rec.id, motivo: 'proyecto no valido' })
        continue
      }

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

      // 3. Importes: base + IVA − IRPF de la recurrente (sin IVA ni IRPF si el
      //    cliente es de otro país). Se redondea también el subtotal: las
      //    columnas son enteras y una cantidad decimal dejaba céntimos sueltos.
      const importes = importesDeRecurrente(
        rec.items,
        rec.tax_percent,
        rec.irpf_percent,
        tipoFiscalDeCliente.get(rec.client_id),
      )
      if (!importes) {
        console.error(`Recurrente ${rec.id}: importes no numericos — se omite`)
        omitidas.push({ recurring_id: rec.id, motivo: 'importes no numericos' })
        continue
      }

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
          subtotal_cents: importes.subtotal,
          tax_percent: importes.taxPercent,
          irpf_percent: importes.irpfPercent,
          total_cents: importes.total,
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

      // 6. Registro fiscal con huella, como cualquier factura emitida desde la
      //    app. Va después de avanzar la fecha: una factura ya registrada queda
      //    bloqueada y no se podría deshacer. Si falla, la factura queda emitida
      //    sin registro y se informa para revisarla (no se repite mañana).
      if (conRegistroFiscal.has(rec.user_id)) {
        const { error: fiscalError } = await supabase.rpc('registrar_factura_fiscal', {
          p_invoice_id: newInvoice.id,
          p_user: rec.user_id,
        })
        if (fiscalError) {
          console.error(`Recurrente ${rec.id}: factura ${newInvoice.id} emitida SIN registro fiscal:`, fiscalError)
          avisos.push({ recurring_id: rec.id, invoice_id: newInvoice.id, aviso: 'sin registro fiscal: ' + fiscalError.message })
        }
      }

      results.push({ recurring_id: rec.id, invoice_id: newInvoice.id })
    }

    return new Response(
      JSON.stringify({ processed: results.length, skipped: omitidas.length, details: results, omitidas, avisos }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error: any) {
    console.error('Error processing recurring invoices:', error)
    return new Response(JSON.stringify({ error: 'Error procesando las facturas recurrentes' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
