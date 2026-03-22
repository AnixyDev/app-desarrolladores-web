// components/contracts/ContractSignModal.tsx
import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { SignatureIcon } from '@/components/icons/Icon';
import { Contract, Client } from '@/types';

interface ContractSignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSign: (signerName: string, signedAt: string) => void;
  contract: Contract | null;
  clients: Client[];
}

const ContractSignModal: React.FC<ContractSignModalProps> = ({
  isOpen,
  onClose,
  onSign,
  contract,
  clients,
}) => {
  const [signerName, setSignerName] = useState('');
  const [signedAt, setSignedAt] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (!isOpen || !contract) return;
    const client = clients.find(c => c.id === contract.client_id);
    setSignerName(client?.name || '');
    setSignedAt(new Date().toISOString().split('T')[0]);
  }, [isOpen, contract, clients]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (signerName && signedAt) {
      onSign(signerName, signedAt);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Marcar como Firmado">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-400">
          Usa esta opción si el cliente ha firmado el contrato externamente o en papel
          y deseas registrarlo en el sistema.
        </p>
        <Input
          label="Nombre del Firmante"
          value={signerName}
          onChange={e => setSignerName(e.target.value)}
          required
        />
        <Input
          label="Fecha de Firma"
          type="date"
          value={signedAt}
          onChange={e => setSignedAt(e.target.value)}
          required
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" className="bg-green-600 hover:bg-green-700">
            <SignatureIcon className="w-4 h-4 mr-2" />
            Confirmar Firma
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default ContractSignModal;
