import React, { useState } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import { supabase } from '@/lib/supabaseClient';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { UserIcon as User, BellIcon as Bell, ShieldIcon as Shield, CreditCard, Globe, RefreshCwIcon } from '@/components/icons/Icon';
import { useToast } from '@/hooks/useToast';

type SettingsTab = 'profile' | 'notifications' | 'security' | 'billing';

const SettingsPage: React.FC = () => {
  const { profile, updateProfile, logout } = useAppStore();
  const { addToast } = useToast();
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

      if (error) throw error;
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
                <p className="text-sm text-gray-400">
                  Gestiona tu suscripción, actualiza tu método de pago, descarga facturas anteriores o cancela tu plan desde el portal seguro de Stripe.
                </p>
                <Button onClick={handleOpenBillingPortal} isLoading={portalLoading}>
                  {portalLoading ? <RefreshCwIcon className="w-4 h-4 animate-spin mr-2" /> : null}
                  Abrir portal de facturación
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
