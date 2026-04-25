import React, { useState } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { User, Bell, Shield, CreditCard, Globe } from '@/components/icons/Icon';
import { useToast } from '@/hooks/useToast';

const SettingsPage: React.FC = () => {
  const { profile, updateProfile } = useAppStore();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    full_name: profile?.full_name || '',
    email: profile?.email || '',
    company_name: profile?.company_name || '',
    website: profile?.website || '',
  });

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

  const SectionTitle = ({ icon: Icon, title }: { icon: any; title: string }) => (
    <h3 className="text-lg font-bold text-white flex items-center mb-4">
      <Icon className="w-5 h-5 mr-2 text-primary-400" />
      {title}
    </h3>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Configuración</h1>
        <p className="text-gray-400">Gestiona tu cuenta, preferencias y facturación</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <aside className="space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-2 rounded-lg bg-primary-600 text-white font-medium transition-colors">
            <User className="w-4 h-4" /> Perfil
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors">
            <Bell className="w-4 h-4" /> Notificaciones
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors">
            <Shield className="w-4 h-4" /> Seguridad
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors">
            <CreditCard className="w-4 h-4" /> Facturación
          </button>
        </aside>

        <div className="md:col-span-3 space-y-6">
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
                    value={formData.email}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input 
                    label="Nombre de Empresa" 
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  />
                  <Input 
                    label="Sitio Web" 
                    placeholder="https://..."
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
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
                <p className="text-lg font-bold text-white uppercase">{profile?.plan_id || 'Free'}</p>
                <p className="text-sm text-gray-400">Tu plan actual incluye todas las funciones básicas.</p>
              </div>
              <Button variant="outline">Cambiar Plan</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
