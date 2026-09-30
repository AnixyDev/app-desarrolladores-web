// Baja de la cuenta (30/09/2026, a petición de Ana). Se llega desde
// Ajustes → Seguridad → «Eliminar mi cuenta». La baja la hace la Edge
// Function eliminar-cuenta; aquí se explica qué pasa, se ofrece descargar las
// facturas y se pide confirmar escribiendo el email.
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/hooks/useAppStore';
import { supabase } from '@/lib/supabaseClient';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { DownloadIcon, TrashIcon } from '@/components/icons/Icon';
import { zipDeFacturas } from '@/lib/descargaFacturas';
import { confirmacionValida, ANOS_CONSERVACION_FISCAL } from '../supabase/functions/_shared/eliminar-cuenta';

const EliminarCuentaPage: React.FC = () => {
  const { profile, invoices, fiscalRecords, getClientById } = useAppStore(useShallow(s => ({
    profile: s.profile, invoices: s.invoices, fiscalRecords: s.fiscalRecords, getClientById: s.getClientById,
  })));

  const facturas = useMemo(() => (invoices ?? []).filter(f => f.user_id === profile?.id), [invoices, profile?.id]);
  const esAdmin = String(profile?.role ?? '').toLowerCase() === 'admin';
  const tienePlanDePago = !!profile?.plan && String(profile.plan).toLowerCase() !== 'free';

  const [descargando, setDescargando] = useState<string | null>(null);
  const [descargado, setDescargado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [entiendo, setEntiendo] = useState(false);
  const [email, setEmail] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeBorrar = !esAdmin && entiendo && confirmacionValida(email, profile?.email) && !borrando;

  const descargar = async () => {
    if (!profile) return;
    setAviso(null);
    setDescargando('Preparando…');
    try {
      const { blob, sinCliente } = await zipDeFacturas({
        facturas, cliente: getClientById, perfil: profile, registrosFiscales: fiscalRecords ?? [],
        alAvanzar: (h, t) => setDescargando(`Generando ${Math.min(h + 1, t)} de ${t}…`),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `facturas-devfreelancer-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDescargado(true);
      if (sinCliente.length) setAviso(`Estas facturas no tienen cliente y solo van en el CSV: ${sinCliente.join(', ')}.`);
    } catch (e) {
      console.error('Descarga de facturas:', e);
      setAviso('No se pudieron generar los PDF. Inténtalo de nuevo.');
    } finally {
      setDescargando(null);
    }
  };

  const eliminar = async () => {
    if (!puedeBorrar) return;
    setBorrando(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke('eliminar-cuenta', { body: { confirmacion: email } });
      if (err) {
        const detalle = await (err as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(detalle?.error ?? 'No se pudo eliminar la cuenta. Inténtalo de nuevo.');
      }
      if (!data?.ok) throw new Error(data?.error ?? 'No se pudo eliminar la cuenta.');
      try { await supabase.auth.signOut(); } catch { /* la sesión ya no existe */ }
      // Recarga completa: vacía el store con los datos que ya no existen.
      window.location.assign('/cuenta-eliminada');
    } catch (e) {
      setError((e as Error).message);
      setBorrando(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link to="/settings" className="text-sm text-gray-400 hover:text-white">← Volver a Ajustes</Link>
        <h1 className="text-2xl font-bold text-white mt-2">Eliminar mi cuenta</h1>
        <p className="text-gray-400 mt-1">Esta acción es definitiva: no se puede deshacer ni recuperar la cuenta después.</p>
      </div>

      {esAdmin && (
        <div className="rounded-lg border border-yellow-600/50 bg-yellow-900/20 p-4 text-sm text-yellow-200">
          Esta es la cuenta de administración de la plataforma y no se puede eliminar desde aquí.
        </div>
      )}

      <Card>
        <CardHeader><h2 className="text-lg font-semibold text-white">Qué pasa al eliminarla</h2></CardHeader>
        <CardContent className="space-y-4 text-sm text-gray-300">
          <div>
            <p className="font-medium text-white">Se borra, en el momento:</p>
            <ul className="list-disc pl-5 mt-1 space-y-0.5 text-gray-400">
              <li>tu perfil, clientes, proyectos, tareas y horas;</li>
              <li>presupuestos, propuestas, contratos, recibos y gastos;</li>
              <li>chats con la IA, base de conocimiento, conexiones bancarias y certificado digital;</li>
              <li>tu logo y los ficheros subidos, tu equipo y tus ofertas de empleo.</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-white">Se conserva {ANOS_CONSERVACION_FISCAL} años, porque la ley obliga:</p>
            <p className="text-gray-400 mt-1">
              Tus facturas, sus registros fiscales (Veri*Factu) y los cobros asociados se guardan bloqueados, sin acceso
              para nadie, hasta el 31 de diciembre del cuarto año tras tu última factura. Después se borran solos.
              {facturas.length > 0 && ' Por eso te recomendamos descargarlas antes: después de la baja ya no podrás.'}
            </p>
          </div>
          {tienePlanDePago && (
            <div>
              <p className="font-medium text-white">Tu suscripción ({profile?.plan}):</p>
              <p className="text-gray-400 mt-1">Se cancela en el mismo momento y no se te volverá a cobrar. El periodo en curso no se reembolsa.</p>
            </div>
          )}
          <p className="text-gray-500">
            Si eres cliente de otros freelancers en su portal, sus fichas y documentos son suyos: no se borran, solo se desengancha tu acceso.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="text-lg font-semibold text-white">1. Descarga tus facturas</h2></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {facturas.length === 0 ? (
            <p className="text-gray-400">No tienes facturas emitidas.</p>
          ) : (
            <>
              <p className="text-gray-400">
                Un ZIP con el PDF de cada una de tus {facturas.length} {facturas.length === 1 ? 'factura' : 'facturas'} (con su QR tributario)
                y un resumen en CSV para abrir con Excel.
              </p>
              <Button variant="secondary" onClick={descargar} disabled={!!descargando}>
                <DownloadIcon className="w-4 h-4 mr-2" />
                {descargando ?? (descargado ? 'Descargar otra vez' : 'Descargar mis facturas')}
              </Button>
              {descargado && !aviso && <p className="text-green-400">Descargadas. Guárdalas en un sitio seguro.</p>}
              {aviso && <p className="text-yellow-300">{aviso}</p>}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border border-red-800/60">
        <CardHeader><h2 className="text-lg font-semibold text-red-300">2. Confirma la baja</h2></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <label className="flex items-start gap-2 text-gray-300">
            <input type="checkbox" className="mt-1" checked={entiendo} onChange={e => setEntiendo(e.target.checked)} disabled={esAdmin} />
            Entiendo que se borrarán mis datos para siempre y que no podré recuperar la cuenta.
          </label>
          <label className="block">
            <span className="block text-gray-300 mb-1">Escribe el email de tu cuenta (<strong className="text-white">{profile?.email}</strong>) para confirmar:</span>
            <input
              type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} disabled={esAdmin}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              placeholder={profile?.email ?? 'tu@email.com'}
            />
          </label>
          {error && <p className="text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2 justify-end">
            <Link to="/settings"><Button variant="secondary" type="button">Cancelar</Button></Link>
            <Button variant="danger" onClick={eliminar} disabled={!puedeBorrar}>
              <TrashIcon className="w-4 h-4 mr-2" />
              {borrando ? 'Eliminando…' : 'Eliminar mi cuenta definitivamente'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EliminarCuentaPage;
