import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/hooks/useAppStore';
import { supabase } from '@/lib/supabaseClient';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { UserIcon as User, BellIcon as Bell, ShieldIcon as Shield, CreditCard, Globe, RefreshCwIcon, ShieldCheckIcon } from '@/components/icons/Icon';
import { useToast } from '@/hooks/useToast';

type SettingsTab = 'profile' | 'notifications' | 'security' | 'billing' | 'fiscal';

const SettingsPage: React.FC = () => {
  const { profile, updateProfile, logout, updateVeriFactuSettings, verifyFiscalChain } = useAppStore();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  const [formData, setFormData] = useState({
    full_name: profile?.full_name || '',
    business_name: profile?.business_name || '',
  });

  const [notifData, setNotifData] = useState({
    payment_reminders_enabled: profile?.payment_reminders_enabled ?? false,
    reminder_template_upcoming: profile?.reminder_template_upcoming || '',
    reminder_template_overdue: profile?.reminder_template_overdue || '',
  });

  const [fiscalSaving, setFiscalSaving] = useState(false);
  const [fiscalModality, setFiscalModality] = useState<'verifactu' | 'no_verifactu'>(profile?.veri_factu_modality || 'no_verifactu');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; brokenAt?: string } | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateProfile(formData);
      addToast('Perfil actualizado correctamente', 'success');
    } catch (error: any) {
      addToast(error.message || 'Error al actualizar perfil', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotifLoading(true);
    try {
      await updateProfile(notifData);
      addToast('Preferencias de notificaciones guardadas', 'success');
    } catch (error: any) {
      addToast(error.message || 'Error al guardar preferencias', 'error');
    } finally {
      setNotifLoading(false);
    }
  };

  // Abre el portal de facturación de Stripe (gestionar suscripción, ver
  // facturas, cambiar método de pago o cancelar) usando el Edge Function
  // create-portal-session, que ya existía pero no estaba conectado a la UI.
  const handleOpenBillingPortal = async () => {
    setPortalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Debes iniciar sesión de nuevo.');

      const { data, error } = await supabase.functions.invoke('create-portal-session', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) {
        // FunctionsHttpError expone la Response cruda en `.context`; sin
        // esto, error.message es un genérico "Edge Function returned a
        // non-2xx status code" que no dice nada útil al usuario.
        let detail = error.message;
        try {
          const body = await error.context?.json?.();
          if (body?.error) detail = body.error;
        } catch { /* noop: nos quedamos con error.message */ }
        throw new Error(detail);
      }
      if (!data?.url) throw new Error('No se pudo generar el enlace al portal de facturación.');

      window.location.href = data.url;
    } catch (error: any) {
      addToast(error.message || 'Error al abrir el portal de facturación', 'error');
      setPortalLoading(false);
    }
  };

  const SectionTitle = ({ icon: Icon, title }: { icon: any; title: string }) => (
    <h3 className="text-lg font-bold text-white flex items-center mb-4">
      <Icon className="w-5 h-5 mr-2 text-primary-400" />
      {title}
    </h3>
  );

  const TabButton = ({ tab, icon: Icon, label }: { tab: SettingsTab; icon: any; label: string }) => (
    <button
      type="button"
      onClick={() => setActiveTab(tab)}
      className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg font-medium transition-colors ${
        activeTab === tab
          ? 'bg-primary-600 text-white'
          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
      }`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Configuración</h1>
        <p className="text-gray-400">Gestiona tu cuenta, preferencias y facturación</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <aside className="space-y-2">
          <TabButton tab="profile" icon={User} label="Perfil" />
          <TabButton tab="notifications" icon={Bell} label="Notificaciones" />
          <TabButton tab="security" icon={Shield} label="Seguridad" />
          <TabButton tab="billing" icon={CreditCard} label="Facturación" />
          <TabButton tab="fiscal" icon={ShieldCheckIcon} label="Cumplimiento Fiscal" />
        </aside>

        <div className="md:col-span-3 space-y-6">
          {activeTab === 'profile' && (
            <>
              <Card>
                <CardHeader>
                  <SectionTitle icon={User} title="Información Personal" />
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleUpdateProfile} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="Nombre Completo"
                        value={formData.full_name}
                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      />
                      <Input
                        label="Correo Electrónico"
                        disabled
                        value={profile?.email || ''}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="Nombre de Empresa"
                        value={formData.business_name}
                        onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                      />
                    </div>
                    <div className="flex justify-end pt-4">
                      <Button type="submit" isLoading={loading}>
                        Guardar Cambios
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-primary-500/20 bg-primary-500/5">
                <CardHeader>
                  <SectionTitle icon={Globe} title="Plan Actual" />
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold text-white uppercase">{profile?.plan || 'Free'}</p>
                    <p className="text-sm text-gray-400">Tu plan actual incluye todas las funciones básicas.</p>
                  </div>
                  <Button variant="secondary" onClick={() => setActiveTab('billing')}>
                    Cambiar Plan
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === 'notifications' && (
            <Card>
              <CardHeader>
                <SectionTitle icon={Bell} title="Notificaciones" />
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdateNotifications} className="space-y-4">
                  <label className="flex items-center gap-3 text-gray-200">
                    <input
                      type="checkbox"
                      checked={notifData.payment_reminders_enabled}
                      onChange={(e) => setNotifData({ ...notifData, payment_reminders_enabled: e.target.checked })}
                      className="w-4 h-4 accent-primary-500"
                    />
                    Enviar recordatorios de pago automáticos a mis clientes
                  </label>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Mensaje para facturas próximas a vencer</label>
                    <textarea
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white text-sm"
                      rows={3}
                      value={notifData.reminder_template_upcoming}
                      onChange={(e) => setNotifData({ ...notifData, reminder_template_upcoming: e.target.value })}
                      placeholder="Ej: Hola, te recordamos que la factura {numero} vence el {fecha}..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Mensaje para facturas vencidas</label>
                    <textarea
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white text-sm"
                      rows={3}
                      value={notifData.reminder_template_overdue}
                      onChange={(e) => setNotifData({ ...notifData, reminder_template_overdue: e.target.value })}
                      placeholder="Ej: Hola, la factura {numero} está pendiente de pago desde el {fecha}..."
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" isLoading={notifLoading}>
                      Guardar Preferencias
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {activeTab === 'security' && (
            <Card>
              <CardHeader>
                <SectionTitle icon={Shield} title="Seguridad" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between bg-gray-800 p-4 rounded-lg">
                  <div>
                    <p className="text-white font-medium">Método de acceso</p>
                    <p className="text-sm text-gray-400">Inicias sesión con Google ({profile?.email})</p>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-gray-800 p-4 rounded-lg">
                  <div>
                    <p className="text-white font-medium">Cerrar sesión</p>
                    <p className="text-sm text-gray-400">Cierra tu sesión en este dispositivo</p>
                  </div>
                  <Button variant="secondary" onClick={() => logout()}>
                    Cerrar sesión
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'billing' && (
            <Card>
              <CardHeader>
                <SectionTitle icon={CreditCard} title="Facturación" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between bg-gray-800 p-4 rounded-lg">
                  <div>
                    <p className="text-lg font-bold text-white uppercase">{profile?.plan || 'Free'}</p>
                    <p className="text-sm text-gray-400">
                      Estado: {profile?.subscription_status === 'active' ? 'Activa' : (profile?.subscription_status || 'Sin suscripción')}
                    </p>
                  </div>
                </div>

                {profile?.stripe_customer_id ? (
                  <>
                    <p className="text-sm text-gray-400">
                      Gestiona tu suscripción, actualiza tu método de pago, descarga facturas anteriores o cancela tu plan desde el portal seguro de Stripe.
                    </p>
                    <Button onClick={handleOpenBillingPortal} isLoading={portalLoading}>
                      {portalLoading ? <RefreshCwIcon className="w-4 h-4 animate-spin mr-2" /> : null}
                      Abrir portal de facturación
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-400">
                      Todavía no tienes ninguna suscripción de pago activa, así que no hay nada que gestionar en el portal de Stripe. Consulta los planes disponibles para empezar.
                    </p>
                    <Button onClick={() => navigate('/billing')}>
                      Ver planes
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'fiscal' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <SectionTitle icon={ShieldCheckIcon} title="Cumplimiento Veri*Factu" />
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="p-4 bg-blue-900/20 border border-blue-800 rounded-lg text-sm text-blue-200">
                    <p className="font-semibold mb-1">¿Qué es esto?</p>
                    <p>
                      El Real Decreto 1007/2023 exige que el software de facturación garantice la
                      integridad de tus facturas (huella encadenada, sin poder editarlas ni borrarlas
                      una vez emitidas). Para autónomos, es obligatorio desde el <strong>1 de julio de 2027</strong>.
                      Actívalo cuando te corresponda — no hace falta esperar al último día, pero tampoco
                      pasa nada por activarlo ya.
                    </p>
                  </div>

                  <div className="flex items-center justify-between bg-gray-800 p-4 rounded-lg">
                    <div>
                      <p className="font-semibold text-white">Activar cumplimiento fiscal</p>
                      <p className="text-sm text-gray-400">
                        {profile?.veri_factu_enabled
                          ? 'Activado — tus facturas nuevas generan registro fiscal y quedan bloqueadas frente a ediciones.'
                          : 'Desactivado — tus facturas se comportan como hasta ahora (editables y borrables).'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        setFiscalSaving(true);
                        try {
                          await updateVeriFactuSettings(!profile?.veri_factu_enabled, fiscalModality);
                          addToast(!profile?.veri_factu_enabled ? 'Cumplimiento fiscal activado.' : 'Cumplimiento fiscal desactivado.', 'success');
                        } catch (err) {
                          addToast((err as Error).message || 'No se pudo actualizar.', 'error');
                        } finally {
                          setFiscalSaving(false);
                        }
                      }}
                      disabled={fiscalSaving}
                      className={`relative w-14 h-7 rounded-full transition-colors ${profile?.veri_factu_enabled ? 'bg-primary-600' : 'bg-gray-600'}`}
                    >
                      <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${profile?.veri_factu_enabled ? 'translate-x-8' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Modalidad</label>
                    <div className="space-y-2">
                      <label className="flex items-start gap-3 p-3 bg-gray-800 rounded-lg cursor-pointer border border-gray-700 hover:border-gray-600">
                        <input
                          type="radio"
                          name="modality"
                          checked={fiscalModality === 'no_verifactu'}
                          onChange={async () => {
                            setFiscalModality('no_verifactu');
                            if (profile?.veri_factu_enabled) await updateVeriFactuSettings(true, 'no_verifactu');
                          }}
                          className="mt-1"
                        />
                        <div>
                          <p className="text-white font-medium">No Verifactu (recomendado para empezar)</p>
                          <p className="text-xs text-gray-400">Huella encadenada e inmutabilidad garantizadas localmente, sin envío automático a la AEAT. No requiere certificado digital.</p>
                        </div>
                      </label>
                      <label className="flex items-start gap-3 p-3 bg-gray-800 rounded-lg cursor-pointer border border-gray-700 hover:border-gray-600 opacity-60">
                        <input
                          type="radio"
                          name="modality"
                          checked={fiscalModality === 'verifactu'}
                          disabled
                          className="mt-1"
                        />
                        <div>
                          <p className="text-white font-medium">Verifactu (envío en tiempo real) — próximamente</p>
                          <p className="text-xs text-gray-400">Requiere certificado digital y la conexión con la AEAT. Todavía no disponible.</p>
                        </div>
                      </label>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <SectionTitle icon={ShieldCheckIcon} title="Verificación de la cadena de huellas" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-gray-400">
                    Recalcula cada huella de tus facturas emitidas y comprueba que coincide con la
                    guardada — si algo no cuadra, indica una manipulación o un fallo. Esta comprobación
                    es obligatoria ofrecerla en modalidad No Verifactu.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      setVerifying(true);
                      setVerifyResult(null);
                      const result = await verifyFiscalChain();
                      setVerifyResult(result);
                      setVerifying(false);
                    }}
                    disabled={verifying}
                  >
                    {verifying ? <RefreshCwIcon className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheckIcon className="w-4 h-4 mr-2" />}
                    {verifying ? 'Verificando...' : 'Verificar integridad de la cadena'}
                  </Button>
                  {verifyResult && (
                    <div className={`p-3 rounded-lg text-sm ${verifyResult.valid ? 'bg-green-900/20 border border-green-800 text-green-300' : 'bg-red-900/20 border border-red-800 text-red-300'}`}>
                      {verifyResult.valid
                        ? '✅ La cadena de huellas es íntegra — no se ha detectado ninguna alteración.'
                        : `⚠️ Se ha detectado una inconsistencia a partir de la factura ${verifyResult.brokenAt}. Revísalo con tu gestoría.`}
                    </div>
                  )}
                  <Button variant="secondary" onClick={() => navigate('/fiscal')}>
                    Ver registro fiscal completo
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;