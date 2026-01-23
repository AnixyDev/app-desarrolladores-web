


import React from 'react';
import { useParams } from 'react-router-dom';
// FIX: Remove .tsx extensions from imports to fix module resolution errors.
import { useAppStore } from '../../hooks/useAppStore';
import Card, { CardHeader, CardContent, CardFooter } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { SignatureIcon, CheckCircleIcon } from '../../components/icons/Icon';

const PortalContractViewPage: React.FC = () => {
    const { contractId } = useParams<{ contractId: string }>();
    const { contracts, getClientById, getProjectById, signContract } = useAppStore(state => ({
        contracts: state.contracts,
        getClientById: state.getClientById,
        getProjectById: state.getProjectById,
        signContract: state.signContract
    }));

    const contract = contracts.find(c => c.id === contractId);

    if (!contract) {
        return <div className="text-center text-red-500">Contrato no encontrado.</div>;
    }

    const client = getClientById(contract.client_id);
    const project = getProjectById(contract.project_id);

    const handleSign = () => {
        if (client) {
            signContract(contract.id, client.name);
            alert('Contrato firmado con éxito.');
        }
    }

    return (
        <Card className="max-w-4xl mx-auto">
            <CardHeader>
                <h2 className="text-2xl font-bold text-white">Contrato de Servicios</h2>
                <p className="text-gray-400">Proyecto: {project?.name}</p>
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
                    <Button onClick={handleSign}>
                        <SignatureIcon className='w-4 h-4 mr-2'/>
                        Firmar Contrato
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