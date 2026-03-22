// components/contracts/ContractActionsMenu.tsx
import React from 'react';
import Button from '@/components/ui/Button';
import { SendIcon, EditIcon, TrashIcon, DownloadIcon, CheckCircleIcon } from '@/components/icons/Icon';
import { Contract } from '@/types';

interface ContractActionsMenuProps {
  contract: Contract;
  onSign: (contract: Contract) => void;
  onEdit: (contract: Contract) => void;
  onDownload: (contract: Contract) => void;
  onSend: (contract: Contract) => void;
  onDelete: (id: string) => void;
}

const ContractActionsMenu: React.FC<ContractActionsMenuProps> = ({
  contract,
  onSign,
  onEdit,
  onDownload,
  onSend,
  onDelete,
}) => {
  const isDraft = contract.status === 'draft';
  const isSigned = contract.status === 'signed';

  return (
    <div className="flex gap-2 flex-wrap">
      {!isSigned && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onSign(contract)}
          title="Marcar como firmado"
          className="text-green-400 hover:text-green-300 border-green-900/50"
        >
          <CheckCircleIcon className="w-4 h-4" />
        </Button>
      )}
      {isDraft && (
        <Button size="sm" variant="secondary" onClick={() => onEdit(contract)} title="Editar">
          <EditIcon className="w-4 h-4" />
        </Button>
      )}
      <Button size="sm" variant="secondary" onClick={() => onDownload(contract)} title="Descargar PDF">
        <DownloadIcon className="w-4 h-4" />
      </Button>
      {isDraft && (
        <Button size="sm" variant="secondary" onClick={() => onSend(contract)} title="Enviar por email">
          <SendIcon className="w-4 h-4" />
        </Button>
      )}
      {isDraft && (
        <Button size="sm" variant="danger" onClick={() => onDelete(contract.id)} title="Eliminar">
          <TrashIcon className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
};

export default ContractActionsMenu;
