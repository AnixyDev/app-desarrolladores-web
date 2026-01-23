
import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { SparklesIcon, RefreshCwIcon, SendIcon } from '../icons/Icon';
import { generateProposalText, refineProposalText, AI_CREDIT_COSTS } from '../../services/geminiService';
import { useAppStore } from '../../hooks/useAppStore';
import { useToast } from '../../hooks/useToast';
import BuyCreditsModal from './BuyCreditsModal';
import { Job } from '../../types';


interface ProposalGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job;
}

const ProposalGeneratorModal: React.FC<ProposalGeneratorModalProps> = ({ isOpen, onClose, job }) => {
    const { profile, consumeCredits, applyForJob } = useAppStore();
    const { addToast } = useToast();
    const [proposalText, setProposalText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isRefining, setIsRefining] = useState<boolean>(false);
    const [isBuyCreditsModalOpen, setIsBuyCreditsModalOpen] = useState(false);

    const userProfileSummary = profile?.bio || `Freelancer con experiencia en desarrollo full-stack. Tarifa por hora: ${profile.hourly_rate_cents / 100}€/h. Habilidades: ${profile.skills?.join(', ')}`;

    const handleGenerate = async () => {
        if (!profile) return;
        if (profile.ai_credits < AI_CREDIT_COSTS.generateProposal) {
            setIsBuyCreditsModalOpen(true);
            return;
        }

        setIsLoading(true);
        try {
            const text = await generateProposalText(job.titulo, job.descripcionCorta, userProfileSummary);
            setProposalText(text);
            consumeCredits(AI_CREDIT_COSTS.generateProposal);
            addToast('Propuesta generada con IA', 'success');
        } catch (error) {
            addToast('Error al generar la propuesta', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefine = async (refinementType: 'formal' | 'conciso' | 'entusiasta') => {
        if (!profile || !proposalText) return;
        if (profile.ai_credits < AI_CREDIT_COSTS.refineProposal) {
            setIsBuyCreditsModalOpen(true);
            return;
        }
        setIsRefining(true);
        try {
            const text = await refineProposalText(proposalText, refinementType);
            setProposalText(text);
            consumeCredits(AI_CREDIT_COSTS.refineProposal);
            addToast(`Propuesta refinada a un tono más ${refinementType}`, 'success');
        } catch (error) {
            addToast('Error al refinar la propuesta', 'error');
        } finally {
            setIsRefining(false);
        }
    };
    
    useEffect(() => {
        if (isOpen) {
            handleGenerate();
        } else {
            // Reset state when closing
            setProposalText('');
            setIsLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, job]);

    const handleSendApplication = () => {
        if (!profile) return;
        applyForJob(job.id, profile.id, proposalText);
        addToast(`Postulación para "${job.titulo}" enviada con éxito.`, 'success');
        onClose();
    };

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title={`Aplicar a: ${job.titulo}`}>
                <div className="space-y-4">
                    {isLoading && (
                        <div className="text-center p-8">
                            <RefreshCwIcon className="w-10 h-10 text-primary-400 mx-auto animate-spin mb-4" />
                            <p className="text-white">Analizando la oferta y generando tu propuesta...</p>
                        </div>
                    )}
                    {!isLoading && proposalText && (
                        <div>
                            <h3 className="font-semibold text-white mb-2">Borrador de Propuesta (puedes editarlo):</h3>
                            <textarea
                                value={proposalText}
                                onChange={(e) => setProposalText(e.target.value)}
                                rows={12}
                                className="w-full p-2 bg-gray-800 text-gray-300 border border-gray-700 rounded-md"
                            />
                            <div className="mt-4 p-3 bg-gray-800/50 rounded-lg">
                                <p className="text-sm font-semibold text-gray-300 mb-2">Refinar con IA:</p>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="secondary" onClick={() => handleRefine('formal')} disabled={isRefining}>Formal</Button>
                                    <Button size="sm" variant="secondary" onClick={() => handleRefine('conciso')} disabled={isRefining}>Conciso</Button>
                                    <Button size="sm" variant="secondary" onClick={() => handleRefine('entusiasta')} disabled={isRefining}>Entusiasta</Button>
                                </div>
                            </div>
                             {isRefining && <p className="text-xs text-primary-400 text-center mt-2">Refinando propuesta...</p>}
                            <div className="flex justify-end gap-2 pt-4 border-t border-gray-700 mt-4">
                                <Button variant="secondary" onClick={handleGenerate}>
                                    <SparklesIcon className="w-4 h-4 mr-2" />
                                    Volver a Generar
                                </Button>
                                <Button onClick={handleSendApplication}>
                                    <SendIcon className="w-4 h-4 mr-2" />
                                    Enviar Postulación
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
            <BuyCreditsModal isOpen={isBuyCreditsModalOpen} onClose={() => setIsBuyCreditsModalOpen(false)} />
        </>
    );
};

export default ProposalGeneratorModal;
