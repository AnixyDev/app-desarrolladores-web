// pages/JobDetailPage.tsx
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAppStore } from '../hooks/useAppStore.tsx';
import Card, { CardContent, CardHeader } from '../components/ui/Card.tsx';
import Button from '../components/ui/Button.tsx';
import { DollarSign, Clock, Zap, Star, Briefcase } from 'lucide-react';
import { Job } from '../types.ts';

const ProposalGeneratorModal = lazy(() => import('../components/modals/ProposalGeneratorModal.tsx'));
const UpgradePromptModal = lazy(() => import('../components/modals/UpgradePromptModal.tsx'));

const JobDetailPage: React.FC = () => {
    const { jobId } = useParams<{ jobId: string }>();
    const { getJobById, saveJob, savedJobIds, profile } = useAppStore();
    
    const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
    const [descriptionHtml, setDescriptionHtml] = useState<string | null>(null);

    const job = jobId ? getJobById(jobId) : null;
    
    useEffect(() => {
        if (job) {
            import('marked').then(markedModule => {
                const html = markedModule.marked.parse(job.descripcionLarga || job.descripcionCorta) as string;
                setDescriptionHtml(html);
            });
        }
    }, [job]);

    if (!job) {
        return <div className="text-center text-red-500">Oferta de trabajo no encontrada.</div>;
    }
    
    const handleApplyClick = () => {
        if (profile?.plan === 'Free') {
            setIsUpgradeModalOpen(true);
        } else {
            setIsProposalModalOpen(true);
        }
    };

    const isSaved = savedJobIds.includes(job.id);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">{job.titulo}</h1>
                    <p className="text-lg text-primary-400">{job.cliente}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={() => saveJob(job.id)}>
                        <Star className={`w-4 h-4 mr-2 ${isSaved ? 'fill-current text-yellow-400' : ''}`} />
                        {isSaved ? 'Guardada' : 'Guardar'}
                    </Button>
                    <Button onClick={handleApplyClick}>
                        <Zap className="w-4 h-4 mr-2" />
                        Aplicar con IA
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader><h2 className="text-xl font-semibold">Descripción del Proyecto</h2></CardHeader>
                        <CardContent>
                            {descriptionHtml === null ? (
                                <p className="text-gray-400">Cargando descripción...</p>
                            ) : (
                                <div className="prose prose-invert max-w-none text-gray-300" dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
                            )}
                        </CardContent>
                    </Card>
                </div>
                <div className="space-y-6">
                    <Card>
                        <CardHeader><h2 className="text-lg font-semibold">Detalles Clave</h2></CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center text-white">
                                <DollarSign className="w-5 h-5 mr-3 text-green-400" />
                                <span>{job.presupuesto.toLocaleString('es-ES')} € (Presupuesto Fijo)</span>
                            </div>
                            <div className="flex items-center text-white">
                                <Clock className="w-5 h-5 mr-3 text-yellow-400" />
                                <span>{job.duracionSemanas} semanas (Duración Estimada)</span>
                            </div>
                            <div className="flex items-center text-white">
                                <Briefcase className="w-5 h-5 mr-3 text-blue-400" />
                                <span>Publicado: {job.fechaPublicacion}</span>
                            </div>
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader><h2 className="text-lg font-semibold">Habilidades Requeridas</h2></CardHeader>
                        <CardContent className="flex flex-wrap gap-2">
                            {job.habilidades.map((skill) => (
                                <span key={skill} className="px-3 py-1 text-sm font-medium rounded-full bg-gray-800 text-fuchsia-500 border border-fuchsia-900/50">
                                    {skill}
                                </span>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            </div>
            
            <Suspense fallback={null}>
                {job && isProposalModalOpen && (
                    <ProposalGeneratorModal 
                        isOpen={isProposalModalOpen}
                        onClose={() => setIsProposalModalOpen(false)}
                        job={job}
                    />
                )}
                {isUpgradeModalOpen && (
                    <UpgradePromptModal
                        isOpen={isUpgradeModalOpen}
                        onClose={() => setIsUpgradeModalOpen(false)}
                        featureName="aplicar a ofertas de trabajo"
                    />
                )}
            </Suspense>
        </div>
    );
};

export default JobDetailPage;