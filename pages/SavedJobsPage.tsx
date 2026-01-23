// pages/SavedJobsPage.tsx
import React, { useState, lazy, Suspense } from 'react';
import { useAppStore } from '../hooks/useAppStore.tsx';
import { Star, Briefcase } from 'lucide-react';
import { Job } from '../types.ts';
import EmptyState from '../components/ui/EmptyState.tsx';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button.tsx';

const ProposalGeneratorModal = lazy(() => import('../components/modals/ProposalGeneratorModal.tsx'));
const UpgradePromptModal = lazy(() => import('../components/modals/UpgradePromptModal.tsx'));

const SavedJobsPage: React.FC = () => {
    const { getSavedJobs, saveJob, profile } = useAppStore();
    const savedJobs = getSavedJobs();
    
    const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);

    const handleApplyClick = (job: Job) => {
        if (profile?.plan === 'Free') {
            setIsUpgradeModalOpen(true);
        } else {
            setSelectedJob(job);
            setIsProposalModalOpen(true);
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
                <Star className="w-6 h-6"/> Ofertas Guardadas
            </h1>

            {savedJobs.length === 0 ? (
                <EmptyState
                    icon={Briefcase}
                    title="No tienes ofertas guardadas"
                    message="Usa el ícono de estrella en el mercado de proyectos para guardar las ofertas que te interesan."
                    action={{ text: 'Buscar Proyectos', onClick: () => {} }}
                />
            ) : (
                <div className="space-y-4">
                    {savedJobs.map(job => (
                         <div key={job.id} className="bg-gray-900 p-4 rounded-xl border border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4">
                            <div className="flex-1">
                                <Link to={`/job-market/${job.id}`} className="font-semibold text-white hover:text-primary-400">{job.titulo}</Link>
                                <p className="text-sm text-gray-400">{job.cliente}</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <p className="text-sm text-gray-300">Presupuesto: <span className="font-semibold text-white">€{job.presupuesto.toLocaleString()}</span></p>
                                <Button size="sm" variant="secondary" onClick={() => handleApplyClick(job)}>Aplicar</Button>
                                <button onClick={() => saveJob(job.id)} className="text-yellow-400 hover:text-yellow-500" aria-label="Eliminar de guardados">
                                    <Star className="w-6 h-6 fill-current" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            
            <Suspense fallback={null}>
                {selectedJob && isProposalModalOpen && (
                    <ProposalGeneratorModal 
                        isOpen={isProposalModalOpen}
                        onClose={() => setIsProposalModalOpen(false)}
                        job={selectedJob}
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

export default SavedJobsPage;