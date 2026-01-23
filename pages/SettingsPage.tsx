
import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import Card, { CardContent, CardHeader } from '../components/ui/Card';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { Link } from 'react-router-dom';
import { UserIcon, RefreshCwIcon, SaveIcon } from '../components/icons/Icon';
import { useToast } from '../hooks/useToast';

const SettingsPage: React.FC = () => {
    const { profile, updateProfile, refreshProfile } = useAppStore();
    const { addToast } = useToast();
    const [formData, setFormData] = useState(profile);
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Solo sincronizar si el ID cambia para evitar bucles de renderizado
    useEffect(() => {
        if (profile.id) {
            setFormData(profile);
        }
    }, [profile.id, profile.plan, profile.hourly_rate_cents]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
             const { checked } = e.target as HTMLInputElement;
             setFormData(prev => ({ ...prev, [name]: checked }));
        } else {
             setFormData(prev => ({ ...prev, [name]: value }));
        }
    };
    
    const handleSkillsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const skillsArray = e.target.value.split(',').map(s => s.trim());
        setFormData(prev => ({ ...prev, skills: skillsArray }));
    };
    
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                addToast('La imagen es demasiado grande. Máx 2MB.', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, avatar_url: reader.result as string }));
                addToast('Imagen cargada. Pulsa guardar para confirmar.', 'info');
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            // Limpiar datos antes de enviar
            const dataToUpdate = { ...formData };
            await updateProfile(dataToUpdate);
            await refreshProfile();
            addToast('Perfil actualizado correctamente.', 'success');
        } catch (err: any) {
            addToast(err.message || 'Error al guardar cambios.', 'error');
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white">Ajustes</h1>
                 <Button as={Link} to="/public-profile" variant="secondary">Ver Perfil Público</Button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
                 <Card>
                    <CardHeader>
                        <h2 className="text-lg font-semibold text-white">Información General</h2>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-6 mb-4">
                             <div className="relative group">
                                {formData.avatar_url ? (
                                    <img src={formData.avatar_url} alt="Avatar" className="w-24 h-24 rounded-full object-cover border-2 border-primary-500/20" />
                                ) : (
                                    <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center border-2 border-dashed border-gray-700">
                                        <UserIcon className="w-10 h-10 text-gray-500" />
                                    </div>
                                )}
                                <button 
                                    type="button" 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 rounded-full transition-opacity text-white text-xs font-bold"
                                >
                                    CAMBIAR
                                </button>
                             </div>
                            <div>
                                <h3 className="font-bold text-white text-lg">{formData.full_name || 'Sin Nombre'}</h3>
                                <p className="text-sm text-gray-400">{formData.email}</p>
                                <span className={`inline-block mt-2 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${formData.plan === 'Pro' || formData.plan === 'Teams' ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-gray-800 text-gray-500'}`}>
                                    Plan {formData.plan}
                                </span>
                                <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" className="hidden" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input label="Nombre Completo" name="full_name" value={formData.full_name} onChange={handleInputChange} />
                            <Input label="Nombre del Negocio" name="business_name" value={formData.business_name} onChange={handleInputChange} />
                            <Input label="NIF/CIF" name="tax_id" value={formData.tax_id} onChange={handleInputChange} />
                            <Input 
                                label="Tarifa por Hora (€)" 
                                name="hourly_rate_cents" 
                                type="number" 
                                value={(formData.hourly_rate_cents || 0) / 100} 
                                onChange={(e) => setFormData(p => ({...p, hourly_rate_cents: Math.round(Number(e.target.value) * 100)}))} 
                            />
                        </div>
                        <Input label="Color principal para PDFs" name="pdf_color" type="color" value={formData.pdf_color} onChange={handleInputChange} wrapperClassName="flex items-center gap-4" />
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader>
                        <h2 className="text-lg font-semibold text-white">Perfil Profesional</h2>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div>
                            <label htmlFor="bio" className="block text-sm font-medium text-gray-300 mb-1">Biografía Corta</label>
                            <textarea id="bio" name="bio" rows={4} value={formData.bio || ''} onChange={handleInputChange} className="block w-full px-3 py-2 border border-gray-700 rounded-lg bg-gray-800 text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all" placeholder="Describe tu especialidad..."/>
                         </div>
                        <Input label="Habilidades (separadas por comas)" name="skills" value={formData.skills?.join(', ') || ''} onChange={handleSkillsChange} placeholder="React, TypeScript, UI/UX..." />
                        <Input label="URL del Portafolio" name="portfolio_url" type="url" value={formData.portfolio_url || ''} onChange={handleInputChange} placeholder="https://miportafolio.com" />
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader>
                        <h2 className="text-lg font-semibold text-white">Recordatorios Automáticos</h2>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-xl border border-gray-700">
                            <div>
                                <label htmlFor="payment_reminders_enabled" className="font-bold text-gray-200">Activar recordatorios</label>
                                <p className="text-xs text-gray-500">Notificar a clientes sobre facturas pendientes.</p>
                            </div>
                            <button type="button" onClick={() => setFormData(p => ({...p, payment_reminders_enabled: !p.payment_reminders_enabled}))} className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${formData.payment_reminders_enabled ? 'bg-primary-600' : 'bg-gray-700'}`}>
                                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.payment_reminders_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>
                         <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Mensaje Factura Próxima</label>
                                <textarea name="reminder_template_upcoming" rows={3} value={formData.reminder_template_upcoming} onChange={handleInputChange} className="block w-full px-3 py-2 border border-gray-700 rounded-lg bg-gray-800 text-white font-mono text-xs" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Mensaje Factura Vencida</label>
                                <textarea name="reminder_template_overdue" rows={3} value={formData.reminder_template_overdue} onChange={handleInputChange} className="block w-full px-3 py-2 border border-gray-700 rounded-lg bg-gray-800 text-white font-mono text-xs" />
                            </div>
                         </div>
                    </CardContent>
                </Card>

                <div className="flex justify-end sticky bottom-4 z-10">
                    <Button type="submit" disabled={isSaving} className="shadow-2xl shadow-primary-500/40 min-w-[150px]">
                        {isSaving ? <RefreshCwIcon className="w-5 h-5 animate-spin" /> : <SaveIcon className="w-5 h-5 mr-2" />}
                        {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                    </Button>
                </div>
            </form>
        </div>
    );
};

export default SettingsPage;
