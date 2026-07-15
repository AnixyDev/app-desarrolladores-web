import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import { Building, Briefcase, TrashIcon, Users, Star } from 'lucide-react';
import { Job } from '@/types';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/useToast';
import { redirectToCheckout } from '@/services/stripeService';

const UpgradePromptModal = lazy(() => import('@/components/modals/UpgradePromptModal'));
const ConfirmationModal = lazy(() => import('@/components/modals/ConfirmationModal'));

const MyJobPostsPage: React.FC = () => {
    const { jobs, applications, profile, deleteJob } = useAppStore();
    const { addToast } = useToast();
    const navigate = useNavigate();

    const [jobToDelete, setJobToDelete] = useState<Job | null>(null);
    const [featuringJobId, setFeaturingJobId] = useState<string | null>(null);

    const myJobs = jobs.filter(j => j.postedByUserId === profile?.id); 
    
    // Solo mostramos el modal si el perfil está cargado Y es Free
    const showUpgrade = profile && profile.id && profile.plan === 'Free';

    const getApplicantCount = (jobId: string) => {
        return applications.filter(app => app.jobId === jobId).length;
    };

    const confirmDelete = async () => {
        if (!jobToDelete) return;
        const result = await deleteJob(jobToDelete.id);
        setJobToDelete(null);
        if (result.success) {
            addToast('Oferta eliminada.', 'success');
        } else {
            addToast(result.message || 'No se pudo eliminar la oferta.', 'error');
        }
    };

    // La oferta ya existe y se publica siempre primero como normal (ver
    // JobPostForm.tsx). "Destacar" es un upsell posterior: el job_id viaja
    // en el metadata de la sesión de Stripe y el webhook (checkout.session.completed,
    // itemKey === 'featuredJobPost') marca isfeatured=true al confirmarse el
    // pago. Así el trabajo del formulario nunca se pierde si el pago falla
    // o se cancela — la oferta ya está publicada de todos modos.
    const handleFeatureJob = async (job: Job) => {
        setFeaturingJobId(job.id);
        try {
            await redirectToCheckout('featuredJobPost', { job_id: job.id });
        } catch (error) {
            addToast((error as Error).message || 'No se pudo iniciar el pago.', 'error');
            setFeaturingJobId(null);
        }
    };

    if (showUpgrade) {
        return (
            <Suspense fallback={null}>
                <UpgradePromptModal
                    isOpen={true}
                    onClose={() => navigate('/job-market')}
                    featureName="gestionar tus ofertas publicadas"
                />
            </Suspense>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
                    <Building className="w-6 h-6"/> Mis Ofertas Publicadas
                </h1>
                <Button as={Link} to="/post-job">Publicar Nueva Oferta</Button>
            </div>
            
            {myJobs.length === 0 ? (
                 <EmptyState
                    icon={Briefcase}
                    title="Aún no has publicado ninguna oferta"
                    message="Atrae al mejor talento para tu proyecto publicando una oferta en nuestro marketplace."
                    action={{ text: 'Publicar Oferta', onClick: () => navigate('/post-job') }}
                />
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="border-b border-gray-800">
                                    <tr>
                                        <th className="p-4">Título de la Oferta</th>
                                        <th className="p-4">Fecha de Publicación</th>
                                        <th className="p-4">Postulaciones</th>
                                        <th className="p-4 text-right sticky right-0 bg-gray-900">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {myJobs.map(job => (
                                        <tr key={job.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                                            <td className="p-4 font-semibold text-white">
                                                <Link to={`/job-market/${job.id}`} className="hover:text-primary-400 flex items-center gap-2">
                                                    {job.isFeatured && <Star className="w-4 h-4 text-fuchsia-500 fill-current shrink-0" />}
                                                    {job.titulo}
                                                </Link>
                                            </td>
                                            <td className="p-4 text-gray-300">{job.fechaPublicacion}</td>
                                            <td className="p-4 text-white font-semibold">
                                                <Link to={`/job-market/${job.id}/applicants`} className="flex items-center gap-2 text-primary-400 hover:underline">
                                                    <Users className="w-4 h-4"/>
                                                    <span>{getApplicantCount(job.id)}</span>
                                                </Link>
                                            </td>
                                            <td className="p-4 text-right sticky right-0 bg-gray-900/95 backdrop-blur-sm">
                                                <div className="flex gap-2 justify-end">
                                                    {!job.isFeatured && (
                                                        <Button
                                                            size="sm"
                                                            variant="secondary"
                                                            disabled={featuringJobId === job.id}
                                                            onClick={() => handleFeatureJob(job)}
                                                            title="Destacar esta oferta"
                                                        >
                                                            <Star className="w-4 h-4 text-fuchsia-500" />
                                                        </Button>
                                                    )}
                                                    <Button size="sm" variant="danger" onClick={() => setJobToDelete(job)}><TrashIcon className="w-4 h-4"/></Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Suspense fallback={null}>
                {jobToDelete && (
                    <ConfirmationModal
                        isOpen={!!jobToDelete}
                        onClose={() => setJobToDelete(null)}
                        onConfirm={confirmDelete}
                        title="¿Eliminar oferta?"
                        message={`¿Seguro que quieres eliminar "${jobToDelete.titulo}"? Esto no borrará las postulaciones ya recibidas.`}
                    />
                )}
            </Suspense>
        </div>
    );
};

export default MyJobPostsPage;