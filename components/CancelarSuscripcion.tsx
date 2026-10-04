// Cancelar la suscripción desde Facturación eligiendo cuándo: al final del
// periodo pagado (se puede reanudar hasta ese día) o en el momento.
// La operación la hace el servidor (cancelar-suscripcion).
import React, { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { RefreshCwIcon } from '@/components/icons/Icon';
import { gestionarCancelacion, type EstadoSuscripcion } from '@/services/stripeService';
import { formatearFecha } from '@/lib/utils';

interface Props {
  /** Se llama tras cancelar o reanudar, para refrescar el perfil. */
  onCambio?: () => void;
}

type Cuando = 'al_final' | 'ahora';

const CancelarSuscripcion: React.FC<Props> = ({ onCambio }) => {
  const [estado, setEstado] = useState<EstadoSuscripcion | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [cuando, setCuando] = useState<Cuando>('al_final');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    gestionarCancelacion('estado')
      .then((e) => { if (vivo) setEstado(e); })
      .catch(() => { /* sin estado no se muestra la tarjeta */ });
    return () => { vivo = false; };
  }, []);

  if (!estado?.tieneSuscripcion) return null;

  const fin = estado.finPeriodo ? formatearFecha(estado.finPeriodo) : 'el final del periodo pagado';

  const ejecutar = async (accion: 'al_final' | 'ahora' | 'reanudar') => {
    setTrabajando(true);
    setError(null);
    try {
      const nuevo = await gestionarCancelacion(accion);
      setEstado(nuevo);
      setAbierto(false);
      setAviso(
        accion === 'reanudar' ? 'Listo: tu suscripción seguirá renovándose con normalidad.'
        : accion === 'al_final' ? `Cancelación programada: mantienes tu plan hasta el ${fin}.`
        : 'Suscripción cancelada. Tu cuenta ha pasado al plan gratuito y conservas todos tus datos.',
      );
      onCambio?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <section aria-labelledby="cancelar-titulo" className="max-w-3xl mx-auto rounded-2xl border border-gray-800 bg-gray-900/60 p-6 sm:p-8 space-y-4">
      <h2 id="cancelar-titulo" className="text-lg font-bold text-white">Cancelar suscripción</h2>

      {aviso && <p role="status" className="text-sm text-green-400">{aviso}</p>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

      {estado.cancelacionProgramada ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-300">
            Tu suscripción no se renovará: mantienes tu plan hasta el <strong className="text-white">{fin}</strong> y después
            tu cuenta pasará al plan gratuito, sin perder datos.
            {estado.esFundadores && ' Si la reanudas antes de esa fecha, conservas tu precio de fundador.'}
          </p>
          <Button onClick={() => ejecutar('reanudar')} disabled={trabajando}>
            {trabajando ? <RefreshCwIcon className="w-4 h-4 animate-spin" /> : 'Reanudar suscripción'}
          </Button>
        </div>
      ) : !abierto ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-gray-400">Sin permanencia. Eliges si termina ahora o al final del periodo ya pagado.</p>
          <Button variant="secondary" onClick={() => { setAbierto(true); setAviso(null); }}>Cancelar suscripción</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <fieldset className="space-y-3">
            <legend className="text-sm text-gray-300 mb-2">¿Cuándo quieres que termine?</legend>
            <label className={`flex gap-3 rounded-xl border p-4 cursor-pointer ${cuando === 'al_final' ? 'border-primary-500 bg-primary-500/5' : 'border-gray-700'}`}>
              <input type="radio" name="cuando" value="al_final" checked={cuando === 'al_final'} onChange={() => setCuando('al_final')} className="mt-1 accent-primary-500" />
              <span>
                <span className="block font-semibold text-white">Al final del periodo pagado (el {fin})</span>
                <span className="block text-sm text-gray-400">Sigues con tu plan hasta ese día y no se renueva. Puedes reanudarla antes si cambias de idea.</span>
              </span>
            </label>
            <label className={`flex gap-3 rounded-xl border p-4 cursor-pointer ${cuando === 'ahora' ? 'border-primary-500 bg-primary-500/5' : 'border-gray-700'}`}>
              <input type="radio" name="cuando" value="ahora" checked={cuando === 'ahora'} onChange={() => setCuando('ahora')} className="mt-1 accent-primary-500" />
              <span>
                <span className="block font-semibold text-white">Ahora mismo</span>
                <span className="block text-sm text-gray-400">Tu cuenta pasa al plan gratuito en este momento. No se devuelve la parte no usada del periodo.</span>
              </span>
            </label>
          </fieldset>

          {estado.esFundadores && (
            <p className="text-sm rounded-lg border border-yellow-600/50 bg-yellow-500/10 text-yellow-200 p-3">
              Tienes el Plan Fundadores. Si la suscripción termina, pierdes el precio de fundador y la plaza no se recupera.
            </p>
          )}

          <p className="text-xs text-gray-500">
            En los dos casos conservas todos tus datos. Si contrataste como consumidor hace menos de 14 días, puedes ejercer el
            derecho de desistimiento con devolución escribiendo a{' '}
            <a href="mailto:soporte@devfreelancer.app" className="underline">soporte@devfreelancer.app</a>.
          </p>

          <div className="flex flex-wrap gap-3">
            <Button variant="danger" onClick={() => ejecutar(cuando)} disabled={trabajando}>
              {trabajando ? <RefreshCwIcon className="w-4 h-4 animate-spin" /> : cuando === 'ahora' ? 'Cancelar ahora' : 'Cancelar al final del periodo'}
            </Button>
            <Button variant="secondary" onClick={() => setAbierto(false)} disabled={trabajando}>Mantener mi suscripción</Button>
          </div>
        </div>
      )}
    </section>
  );
};

export default CancelarSuscripcion;
