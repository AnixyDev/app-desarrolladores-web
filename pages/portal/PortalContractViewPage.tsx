// pages/portal/PortalContractViewPage.tsx
// FIX: misma clase de bug que PortalInvoiceViewPage — leía
// useAppStore().contracts (store del freelancer, vacío en sesión de
// cliente), así que SIEMPRE mostraba "Contrato no encontrado" para
// cualquier cliente real, y encima la ruta ni siquiera estaba registrada
// en App.tsx. También reemplaza el alert() + llamada sin await a
// signContract() por manejo de error real vía toast.
import React, { useState, useEffect } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import Card, { CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { SignatureIcon, CheckCircleIcon } from '@/components/icons/Icon';
import { useToast } from '@/hooks/useToast';
import { Contract } from '@/types';

interface PortalContext {
    clientId: string;
}

const PortalContractViewPage: React.FC = () => {
    const { contractId } = useParams<{ contractId: string }>();
    const { clientId } = useOutletContext<PortalContext>();
    const { addToast } = useToast();

    const [contract, setContract] = useState<Contract | null>(null);
    const [projectName, setProjectName] = useState<string>('');
    const [clientName, setClientName] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [isSigning, setIsSigning] = useState(false);

    const loadContract = async () => {
        if (!clientId || !contractId) return;
        setLoading(true);

        const { data, error } = await supabase
            .from('contracts')
            .select('*, projects(name)')
            .eq('id', contractId)
            .eq('client_id', clientId)
            .single();

        if (error || !data) {
            setNotFound(true);
            setLoading(false);
            return;
        }

        const { projects, ...contractRow } = data as any;
        setContract(contractRow as Contract);
        setProjectName(projects?.name || '');

        const { data: clientRow } = await supabase.from('clients').select('name').eq('id', clientId).single();
        setClientName(clientRow?.name || '');

        setLoading(false);
    };

    useEffect(() => {
        loadContract();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientId, contractId]);

    const handleSign = async () => {
        if (!contract || !clientName) return;
        setIsSigning(true);

        const signedAt = new Date().toISOString();
        const { error } = await supabase
            .from('contracts')
            .update({ status: 'signed', signed_by: clientName, signed_at: signedAt })
            .eq('id', contract.id)
            .eq('client_id', clientId);

        setIsSigning(false);

        if (error) {
            addToast('No se pudo firmar el contrato. Inténtalo de nuevo o contacta con tu freelancer.', 'error');
            return;
        }

        setContract(prev => prev ? { ...prev, status: 'signed', signed_by: clientName, signed_at: signedAt } : prev);
        addToast('Contrato firmado con éxito.', 'success');
    };

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" />
            </div>
        );
    }

    if (notFound || !contract) {
        return <div className="text-center text-red-500">Contrato no encontrado.</div>;
    }

    return (
        <Card className="max-w-4xl mx-auto">
            <CardHeader>
                <h2 className="text-2xl font-bold text-white">Contrato de Servicios</h2>
                <p className="text-gray-400">Proyecto: {projectName}</p>
            </CardHeader>
            <CardContent className="prose prose-invert prose-p:text-gray-300 max-w-none">
                <pre className="whitespace-pre-wrap font-sans text-gray-300">{contract.content}</pre>
            </CardContent>
            <CardFooter className='flex flex-col sm:flex-row justify-between items-center gap-4'>
                <span className={`px-3 py-1 rounded-full text-sm capitalize ${
                    contract.status === 'sent' ? 'bg-blue-500/20 text-blue-400' :
                    contract.status === 'signed' ? 'bg-green-500/20 text-green-400' :
                    'bg-gray-500/20 text-gray-400'
                }`}>
                    Estado: {contract.status}
                </span>
                {contract.status === 'sent' && (
                    <Button onClick={handleSign} disabled={isSigning}>
                        <SignatureIcon className='w-4 h-4 mr-2'/>
                        {isSigning ? 'Firmando...' : 'Firmar Contrato'}
                    </Button>
                )}
                {contract.status === 'signed' && (
                    <div className="flex items-center gap-2 text-green-400 text-sm">
                        <CheckCircleIcon className="w-5 h-5" />
                        <span>Firmado por {contract.signed_by} el {new Date(contract.signed_at || '').toLocaleDateString()}</span>
                    </div>
                )}
            </CardFooter>
        </Card>
    );
};

export default PortalContractViewPage;