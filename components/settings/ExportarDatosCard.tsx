// «Tus datos son tuyos»: exportar todo en un clic (Ajustes → Seguridad).
import React, { useState } from 'react';
import Button from '@/components/ui/Button';
import { DownloadIcon } from '@/components/icons/Icon';
import { useAppStore } from '@/hooks/useAppStore';
import { zipDeTodosLosDatos } from '@/lib/exportarDatos';

const ExportarDatosCard: React.FC = () => {
  const [estado, setEstado] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'aviso' | 'error'; texto: string } | null>(null);

  const exportar = async () => {
    setMensaje(null);
    setEstado('Preparando…');
    try {
      const tienda = useAppStore.getState();
      // Recibos y registro fiscal se cargan al abrir su página: aquí se piden siempre.
      await Promise.allSettled([tienda.fetchReceipts(), tienda.fetchFiscalRecords()]);
      const s = useAppStore.getState();
      if (!s.profile) throw new Error('Sin perfil');

      const { blob, sinCliente } = await zipDeTodosLosDatos({
        facturas: s.invoices ?? [],
        cliente: s.getClientById,
        perfil: s.profile,
        registrosFiscales: s.fiscalRecords ?? [],
        alAvanzar: (h, t) => setEstado(t > 0 ? `Generando factura ${Math.min(h + 1, t)} de ${t}…` : 'Preparando…'),
        tablas: {
          clientes: s.clients,
          proyectos: s.projects,
          horas: s.timeEntries,
          presupuestos: s.budgets,
          propuestas: s.proposals,
          contratos: s.contracts,
          'facturas-recurrentes': s.recurringInvoices,
          recibos: s.receipts,
          gastos: s.expenses,
          'gastos-recurrentes': s.recurringExpenses,
          'registro-fiscal': s.fiscalRecords,
        },
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `devfreelancer-mis-datos-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMensaje(sinCliente.length
        ? { tipo: 'aviso', texto: `Descargado. Estas facturas no tienen cliente y van solo en el CSV: ${sinCliente.join(', ')}.` }
        : { tipo: 'ok', texto: 'Descargado. Guárdalo en un sitio seguro.' });
    } catch (e) {
      console.error('Exportar datos:', e);
      setMensaje({ tipo: 'error', texto: 'No se pudo generar la exportación. Inténtalo de nuevo.' });
    } finally {
      setEstado(null);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-800 p-4 rounded-lg">
      <div>
        <p className="text-white font-medium">Exportar todos mis datos</p>
        <p className="text-sm text-gray-400">
          Un ZIP con el PDF de cada factura y un archivo por cada cosa que guardas aquí: clientes, proyectos, horas,
          presupuestos, contratos, gastos… Sin darte de baja y cuantas veces quieras.
        </p>
        {mensaje && (
          <p role="status" className={`mt-2 text-sm ${mensaje.tipo === 'ok' ? 'text-green-400' : mensaje.tipo === 'aviso' ? 'text-yellow-300' : 'text-red-400'}`}>
            {mensaje.texto}
          </p>
        )}
      </div>
      <Button variant="secondary" onClick={exportar} disabled={!!estado} className="shrink-0 justify-center">
        <DownloadIcon className="w-4 h-4 mr-2" />
        {estado ?? 'Exportar'}
      </Button>
    </div>
  );
};

export default ExportarDatosCard;
