
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAppStore } from '@/hooks/useAppStore';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { 
    Users as UsersIcon, 
    SparklesIcon, 
    RefreshCwIcon, 
    CheckCircleIcon as CheckCircle, 
    AlertTriangleIcon as AlertTriangle 
} from '@/components/icons/Icon';
import { JobApplication } from '@/types';
import EmptyState from '@/components/ui/EmptyState';
import { summarizeApplicant, AI_CREDIT_COSTS } from '@/services/geminiService';
import { useToast } from '@/hooks/useToast';

const BuyCreditsModal = lazy(() => import('@/components/modals/BuyCreditsModal'));
const UpgradePromptModal = lazy(() => import('@/components/modals/UpgradePromptModal'));

interface ApplicantSummary {
    summary: string;
    pros: string[];
    cons: string[];
}

const JobApplicantsPage: React.FC = () => {
    const { jobId } = useParams<{ jobId: string }>();
    const { getJobById, getApplicationsByJobId, profile, viewApplication, consumeCredits } = useAppStore();
    const { addToast } = useToast();

    const [selectedApplication, setSelectedApplication] = useState<JobApplication | null>(null);
    const [summary, setSummary] = useState<ApplicantSummary | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isBuyCreditsModalOpen, setIsBuyCreditsModalOpen] = useState(false);
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

    const job = jobId ? getJobById(jobId) : null;
    const applications = jobId ? getApplicationsByJobId(jobId) : [];

    useEffect(() => {
        if (selectedApplication) {
            viewApplication(selectedApplication.id);
        }
    }, [selectedApplication, viewApplication]);

    useEffect(() => {
        if (profile?.plan === 'Free') {
            setIsUpgradeModalOpen(true);
        }
    }, [profile?.plan]);
    
    if (isUpgradeModalOpen) {
        return (
            <Suspense fallback={null}>
                <UpgradePromptModal isOpen={true} onClose={() => setIsUpgradeModalOpen(false)} featureName="gestión de candidatos" />
            </Suspense>
        );
    }
    
    if (!job) {
        return <div className="text-center text-red-500">Oferta de trabajo no encontrada.</div>;
    }

    const handleGenerateSummary = async (app: JobApplication) => {
        if (profile.ai_credits < AI_CREDIT_COSTS.summarizeApplicant) {
            setIsBuyCreditsModalOpen(true);
            return;
        }
        
        setSelectedApplication(app);
        setIsLoading(true);
        setIsModalOpen(true);
        setSummary(null);

        try {
            const applicantProfileSummary = profile.bio ? `${profile.bio}. Habilidades: ${profile.skills?.join(', ')}` : `Habilidades: ${profile.skills?.join(', ')}`;
            const result = await summarizeApplicant(job.descripcionLarga || job.descripcionCorta, applicantProfileSummary, app.proposalText);
            setSummary(result);
            consumeCredits(AI_CREDIT_COSTS.summarizeApplicant);
            addToast("Resumen del candidato generado.", "success");
        } catch (error) {
            addToast((error as Error).message, 'error');
            setIsModalOpen(false);
        } finally {
            setIsLoading(false);
        }
    };
    
    const applicationStatusConfig = {
        sent: { label: 'Enviada', className: 'bg-blue-500/20 text-blue-400' },
        viewed: { label: 'En Revisión', className: 'bg-purple-500/20 text-purple-400' },
        accepted: { label: 'Aceptada', className: 'bg-green-500/20 text-green-400' },
        rejected: { label: 'Rechazada', className: 'bg-red-500/20 text-red-400' },
    };

    return (
        <div className="space-y-6">
            <div>
                <Link to="/my-job-posts" className="text-sm text-primary-400 hover:underline">‹ Volver a Mis Ofertas</Link>
                <h1 className="text-3xl font-bold text-white mt-1">{String(job.titulo)}</h1>
                <p className="text-lg text-gray-400">Panel de Postulaciones</p>
            </div>
            
            {applications.length === 0 ? (
                <EmptyState 
                    icon={UsersIcon}
                    title="Aún no hay postulaciones"
                    message="Cuando los freelancers apliquen a tu oferta, aparecerán aquí para que los gestiones."
                />
            ) : (
                <div className="space-y-4">
                    {applications.map(app => {
                        const statusInfo = (applicationStatusConfig as any)[app.status] || applicationStatusConfig.sent;
                        return (
                            <Card key={app.id}>
                                <CardHeader className="flex justify-between items-start">
                                    <div>
                                        <p className="font-semibold text-white text-lg">{String(app.applicantName)}</p>
                                        <p className="text-sm text-gray-400">Postuló el {new Date(app.appliedAt).toLocaleDateString()}</p>
                                    </div>
                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusInfo.className}`}>
                                        {statusInfo.label}
                                    </span>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-gray-300 whitespace-pre-wrap border-l-2 border-gray-700 pl-4 italic">"{String(app.proposalText)}"</p>
                                </CardContent>
                                <div className="p-4 border-t border-gray-800 flex justify-end gap-2">
                                    <Button onClick={() => handleGenerateSummary(app)}>
                                        <SparklesIcon className="w-4 h-4 mr-2" />
                                        Generar Resumen con IA
                                    </Button>
                                </div>
                            </Card>
                        )
                    })}
                </div>
            )}
            
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Análisis de IA para ${String(selectedApplication?.applicantName || 'Candidato')}`}>
                {isLoading ? (
                    <div className="text-center p-8">
                        <RefreshCwIcon className="w-10 h-10 text-primary-400 mx-auto animate-spin mb-4" />
                        <p className="text-white">Analizando perfil y propuesta...</p>
                    </div>
                ) : summary ? (
                    <div className="space-y-4">
                        <div>
                            <h3 className="font-semibold text-primary-400 mb-2">Resumen</h3>
                            <p className="text-gray-300">{String(summary.summary)}</p>
                        </div>
                        <div>
                            <h3 className="font-semibold text-green-400 mb-2 flex items-center gap-2"><CheckCircle className="w-5 h-5"/> Puntos Fuertes</h3>
                            <ul className="list-disc list-inside space-y-1 text-gray-300">
                                {summary.pros.map((pro, i) => <li key={i}>{String(pro)}</li>)}
                            </ul>
                        </div>
                         <div>
                            <h3 className="font-semibold text-yellow-400 mb-2 flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> Puntos a Considerar</h3>
                            <ul className="list-disc list-inside space-y-1 text-gray-300">
                                {summary.cons.map((con, i) => <li key={i}>{String(con)}</li>)}
                            </ul>
                        </div>
                    </div>
                ) : null}
            </Modal>
            
            <Suspense fallback={null}>
                {isBuyCreditsModalOpen && <BuyCreditsModal isOpen={isBuyCreditsModalOpen} onClose={() => setIsBuyCreditsModalOpen(false)} />}
            </Suspense>
        </div>
    );
};

export default JobApplicantsPage;
