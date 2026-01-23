
// pages/MyApplicationsPage.tsx
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useAppStore } from '../hooks/useAppStore.tsx';
import Card, { CardContent, CardHeader } from '../components/ui/Card.tsx';
import { Send, Briefcase } from 'lucide-react';
import { JobApplication } from '../types.ts';
import { Link, useNavigate } from 'react-router-dom';
import EmptyState from '../components/ui/EmptyState.tsx';

const UpgradePromptModal = lazy(() => import('../components/modals/UpgradePromptModal.tsx'));

const applicationStatusConfig = {
    sent: { label: 'Enviada', className: 'bg-blue-500/20 text-blue-400' },
    viewed: { label: 'En Revisión', className: 'bg-purple-500/20 text-purple-400' },
    accepted: { label: 'Aceptada', className: 'bg-green-500/20 text-green-400' },
    rejected: { label: 'Rechazada', className: 'bg-red-500/20 text-red-400' },
};

const MyApplicationsPage: React.FC = () => {
    const { applications, getJobById, profile } = useAppStore();
    const navigate = useNavigate();
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
    
    useEffect(() => {
        // CORRECCIÓN: Solo si el perfil está cargado y es explícitamente Free
        if (profile && profile.id && profile.plan === 'Free') {
            setIsUpgradeModalOpen(true);
        }
    }, [profile?.plan]);

    if (!profile || !profile.id) return null;
    
    const userApplications = applications.filter(app => app.userId === profile.id);

    // Si el usuario es Pro/Teams, ignoramos el modal
    if (isUpgradeModalOpen && profile.plan === 'Free') {
        return (
            <Suspense fallback={null}>
                <UpgradePromptModal
                    isOpen={isUpgradeModalOpen}
                    onClose={() => navigate('/job-market')}
                    featureName="ver tus postulaciones"
                />
            </Suspense>
        );
    }

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
                <Send className="w-6 h-6"/> Mis Postulaciones
            </h1>
            
            {userApplications.length === 0 ? (
                <EmptyState 
                    icon={Briefcase}
                    title="Aún no has aplicado a ninguna oferta"
                    message="Explora el mercado de proyectos y encuentra tu próximo desafío. ¡Aplica con la ayuda de nuestra IA!"
                    action={{ text: 'Buscar Proyectos', onClick: () => navigate('/job-market') }}
                />
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="border-b border-gray-800">
                                    <tr>
                                        <th className="p-4">Oferta</th>
                                        <th className="p-4">Cliente</th>
                                        <th className="p-4">Fecha de Postulación</th>
                                        <th className="p-4">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {userApplications.map(app => {
                                        const job = getJobById(app.jobId);
                                        const statusInfo = applicationStatusConfig[app.status] || applicationStatusConfig.sent;
                                        return (
                                            <tr key={app.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                                                <td className="p-4 font-semibold text-white">
                                                    <Link to={`/job-market/${job?.id}`} className="hover:text-primary-400">{job?.titulo || 'Oferta no encontrada'}</Link>
                                                </td>
                                                <td className="p-4 text-gray-300">{job?.cliente}</td>
                                                <td className="p-4 text-gray-300">{new Date(app.appliedAt).toLocaleDateString()}</td>
                                                <td className="p-4">
                                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusInfo.className}`}>
                                                        {statusInfo.label}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default MyApplicationsPage;
