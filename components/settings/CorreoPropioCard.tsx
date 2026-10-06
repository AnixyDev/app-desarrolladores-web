import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { MailIcon, CheckCircleIcon, AlertTriangleIcon, LockIcon, ExternalLinkIcon } from '@/components/icons/Icon';
import { useToast } from '@/hooks/useToast';
import { formatearFechaHora } from '@/lib/utils';
import { planPermiteRemitentePropio } from '../../supabase/functions/_shared/remitente-propio';

/**
 * «Enviar desde tu dominio» (Pro y Teams).
 *
 * El usuario conecta su cuenta de Resend con su dominio verificado y sus
 * facturas, presupuestos, recordatorios e invitaciones al portal salen desde
 * su dirección, sin los topes diarios de la plataforma. La clave se guarda
 * cifrada en el servidor (manage-secrets) y solo después de que un correo de
 * prueba haya salido de verdad. Reglas en supabase/functions/_shared/remitente-propio.ts.
 */

interface EstadoResend {
  resend_configured: boolean;
  resend_from_email: string | null;
  resend_configurado_en: string | null;
  resend_ultimo_error: string | null;
  resend_error_en: string | null;
}

const llamar = async (action: string, payload?: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke('manage-secrets', { body: { action, payload } });
  if (error) {
    let detalle = error.message;
    try {
      const cuerpo = await (error as any).context?.json?.();
      if (cuerpo?.error) detalle = cuerpo.error;
    } catch { /* sin cuerpo legible */ }
    throw new Error(detalle);
  }
  return data;
};

interface Props {
  plan: string | null | undefined;
  onVerPlanes: () => void;
}

const CorreoPropioCard: React.FC<Props> = ({ plan, onVerPlanes }) => {
  const { addToast } = useToast();
  const permitido = planPermiteRemitentePropio(plan);

  const [estado, setEstado] = useState<EstadoResend | null>(null);
  const [cargando, setCargando] = useState(true);
  const [clave, setClave] = useState('');
  const [direccion, setDireccion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [editando, setEditando] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try {
      setEstado(await llamar('status'));
    } catch {
      setEstado(null);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clave.trim() || !direccion.trim()) {
      addToast('Rellena la clave de Resend y la dirección de envío.', 'error');
      return;
    }
    setGuardando(true);
    try {
      const r = await llamar('save_resend', { api_key: clave.trim(), from_email: direccion.trim() });
      setClave('');
      setEditando(false);
      addToast(`Conectado. Te hemos enviado un correo de prueba a ${r?.prueba_enviada_a ?? 'tu email'}.`, 'success');
      await cargar();
    } catch (err) {
      addToast((err as Error).message || 'No se pudo conectar tu dominio.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async () => {
    setQuitando(true);
    try {
      await llamar('delete_resend');
      setConfirmarQuitar(false);
      setDireccion('');
      addToast('Desconectado. Tus correos vuelven a salir desde DevFreelancer.', 'success');
      await cargar();
    } catch (err) {
      addToast((err as Error).message || 'No se pudo desconectar.', 'error');
    } finally {
      setQuitando(false);
    }
  };

  const conectado = !!estado?.resend_configured;

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-bold text-white flex items-center mb-1">
          <MailIcon className="w-5 h-5 mr-2 text-primary-400" />
          Enviar desde tu dominio
        </h3>
        <p className="text-sm text-gray-400">
          Tus facturas, presupuestos, recordatorios de cobro e invitaciones al portal saldrán desde tu propia
          dirección (por ejemplo <span className="text-gray-300">facturas@tudominio.com</span>) en vez de desde
          DevFreelancer, y sin el límite diario de envíos.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!permitido ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-gray-700 bg-gray-800/50">
            <p className="text-sm text-gray-300 flex items-start gap-2">
              <LockIcon className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
              Incluido en los planes Pro y Teams.
              {conectado && ' Tu configuración se conserva, pero ahora mismo tus correos salen desde DevFreelancer.'}
            </p>
            <Button variant="secondary" onClick={onVerPlanes}>Ver planes</Button>
          </div>
        ) : cargando ? (
          <p className="text-sm text-gray-500">Cargando…</p>
        ) : conectado && !editando ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-lg border border-green-700/50 bg-green-900/20">
              <CheckCircleIcon className="w-5 h-5 shrink-0 text-green-400" />
              <div className="text-sm">
                <p className="text-white">
                  Enviando desde <strong className="break-all">{estado?.resend_from_email}</strong>
                </p>
                {estado?.resend_configurado_en && (
                  <p className="text-gray-400">Conectado el {formatearFechaHora(estado.resend_configurado_en)}</p>
                )}
              </div>
            </div>

            {estado?.resend_ultimo_error && (
              <div role="alert" className="flex items-start gap-2 p-3 rounded-lg border border-red-700/50 bg-red-900/20">
                <AlertTriangleIcon className="w-5 h-5 shrink-0 text-red-400" />
                <div className="text-sm">
                  <p className="text-white font-semibold">El último envío falló</p>
                  <p className="text-gray-300">{estado.resend_ultimo_error}</p>
                  {estado.resend_error_en && (
                    <p className="text-gray-500 mt-1">{formatearFechaHora(estado.resend_error_en)}</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 justify-end">
              {confirmarQuitar ? (
                <>
                  <span className="text-sm text-gray-300 self-center">¿Volver a enviar desde DevFreelancer?</span>
                  <Button variant="secondary" onClick={() => setConfirmarQuitar(false)} disabled={quitando}>Cancelar</Button>
                  <Button variant="danger" onClick={quitar} isLoading={quitando}>Sí, desconectar</Button>
                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => { setDireccion(estado?.resend_from_email ?? ''); setEditando(true); }}
                  >
                    Cambiar
                  </Button>
                  <Button variant="danger" onClick={() => setConfirmarQuitar(true)}>Desconectar</Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={guardar} className="space-y-4">
            <ol className="text-sm text-gray-400 list-decimal pl-5 space-y-1">
              <li>
                Crea una cuenta gratuita en{' '}
                <a href="https://resend.com/signup" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:underline inline-flex items-center gap-1">
                  resend.com <ExternalLinkIcon className="w-3 h-3" />
                </a>.
              </li>
              <li>
                En <span className="text-gray-300">Domains</span>, añade tu dominio y copia los registros DNS en tu
                proveedor. Espera a que salga «Verified».
              </li>
              <li>
                En <span className="text-gray-300">API Keys</span>, crea una clave con permiso de envío y pégala aquí.
              </li>
            </ol>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                id="resend-from"
                label="Dirección de envío"
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="facturas@tudominio.com"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
              />
              <Input
                id="resend-key"
                label="Clave de Resend"
                type="password"
                autoComplete="off"
                placeholder="re_…"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
              />
            </div>
            <p className="text-xs text-gray-500">
              Al guardar te enviaremos un correo de prueba desde esa dirección. Solo se conecta si llega. La clave se
              guarda cifrada y no se vuelve a mostrar.
            </p>
            <div className="flex justify-end gap-2">
              {editando && (
                <Button type="button" variant="secondary" onClick={() => { setEditando(false); setClave(''); }} disabled={guardando}>
                  Cancelar
                </Button>
              )}
              <Button type="submit" isLoading={guardando}>Probar y conectar</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
};

export default CorreoPropioCard;
