// pages/portal/PortalProposalViewPage.tsx
// FIX: misma clase de bug — leía useAppStore().proposals (vacío en sesión
// de cliente). Añadida acción real de aceptar/rechazar.
import React, { useState, useEffect } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import Card, { CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { Proposal } from '@/types';

interface PortalContext {
    clientId: string;
}

const PortalProposalViewPage: React.FC = () => {
    const { proposalId } = useParams<{ proposalId: string }>();
    const { clientId } = useOutletContext<PortalContext>();
    const { addToast } = useToast();

    const [proposal, setProposal] = useState<Proposal | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        if (!clientId || !proposalId) return;

        const load = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('proposals')
                .select('*')
                .eq('id', proposalId)
                .eq('client_id', clientId)
                .single();

            if (error || !data) {
                setNotFound(true);
            } else {
                setProposal(data as Proposal);
            }
            setLoading(false);
        };

        load();
    }, [clientId, proposalId]);

    const handleDecision = async (status: 'accepted' | 'rejected') => {
        if (!proposal) return;
        setIsUpdating(true);

        const { error } = await supabase
            .from('proposals')
            .update({ status })
            .eq('id', proposal.id)
            .eq('client_id', clientId);

        setIsUpdating(false);

        if (error) {
            addToast('No se pudo registrar tu respuesta. Inténtalo de nuevo.', 'error');
            return;
        }

        setProposal(prev => prev ? { ...prev, status } : prev);
        addToast(status === 'accepted' ? 'Propuesta aceptada.' : 'Propuesta rechazada.', 'success');
    };

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" />
            </div>
        );
    }

    if (notFound || !proposal) {
        return <div className="text-center text-red-500">Propuesta no encontrada.</div>;
    }

    return (
        <Card className="max-w-4xl mx-auto">
            <CardHeader>
                <h2 className="text-2xl font-bold text-white">{proposal.title}</h2>
                <p className="text-gray-400">Enviada el: {proposal.created_at}</p>
            </CardHeader>
            <CardContent className="prose prose-invert prose-p:text-gray-300 max-w-none">
                <p className="whitespace-pre-wrap">{proposal.content}</p>
            </CardContent>
            <CardFooter className='flex flex-col sm:flex-row justify-between items-center gap-4'>
                <div>
                    <span className="text-gray-400">Importe Propuesto: </span>
                    <span className="font-bold text-white text-lg">{formatCurrency(proposal.amount_cents)}</span>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm capitalize ${
                    proposal.status === 'accepted' ? 'bg-green-500/20 text-green-400' :
                    proposal.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                    proposal.status === 'sent' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-gray-500/20 text-gray-400'
                }`}>
                    Estado: {proposal.status}
                </span>
            </CardFooter>
            {proposal.status === 'sent' && (
                <div className="px-6 pb-6 flex justify-end gap-2">
                    <Button variant="secondary" disabled={isUpdating} onClick={() => handleDecision('rejected')}>Rechazar</Button>
                    <Button disabled={isUpdating} onClick={() => handleDecision('accepted')}>Aceptar Propuesta</Button>
                </div>
            )}
        </Card>
    );
};

export default PortalProposalViewPage;