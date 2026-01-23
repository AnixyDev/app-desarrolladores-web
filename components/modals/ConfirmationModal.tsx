import React from 'react';
import Modal from '../ui/Modal.tsx';
import Button from '../ui/Button.tsx';
import { AlertTriangleIcon } from '../icons/Icon.tsx';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, title, message }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="text-center">
        <AlertTriangleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-gray-300 mb-6">{message}</p>
        <div className="flex justify-center gap-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Confirmar Eliminación
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmationModal;
