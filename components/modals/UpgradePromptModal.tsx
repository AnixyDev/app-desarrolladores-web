import React from 'react';
import { Link } from 'react-router-dom';
import Modal from '../ui/Modal.tsx';
import Button from '../ui/Button.tsx';
import { ZapIcon } from '../icons/Icon.tsx';

interface UpgradePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName: string;
}

const UpgradePromptModal: React.FC<UpgradePromptModalProps> = ({ isOpen, onClose, featureName }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Límite del Plan Alcanzado">
      <div className="text-center p-4">
        <ZapIcon className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-white mb-2">
          Has alcanzado el límite de {featureName}.
        </h3>
        <p className="text-gray-400 mb-6">
          Actualiza a nuestro Plan Pro para añadir {featureName} ilimitados y desbloquear todo el potencial de DevFreelancer.
        </p>
        <Button as={Link} to="/billing" onClick={onClose} className="w-full">
          Ver Planes y Actualizar
        </Button>
      </div>
    </Modal>
  );
};

export default UpgradePromptModal;