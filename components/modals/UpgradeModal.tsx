import React from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { ZapIcon, CheckCircleIcon } from '../icons/Icon';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Actualizar a DevFreelancer Teams">
      <div className="space-y-4">
        <div className="text-center p-4 bg-gray-800 rounded-lg">
          <ZapIcon className="w-10 h-10 text-yellow-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-white">¡Desbloquea el poder del trabajo en equipo!</p>
          <p className="text-gray-400">Pasa a Teams por solo <span className="text-white font-bold">35,95€</span> al mes.</p>
        </div>
        
        <div className="space-y-2">
          <p className="flex items-start gap-2"><CheckCircleIcon className="w-5 h-5 text-green-400 shrink-0 mt-0.5" /><span>Invita miembros y asigna roles.</span></p>
          <p className="flex items-start gap-2"><CheckCircleIcon className="w-5 h-5 text-green-400 shrink-0 mt-0.5" /><span>Centraliza la base de conocimiento.</span></p>
          <p className="flex items-start gap-2"><CheckCircleIcon className="w-5 h-5 text-green-400 shrink-0 mt-0.5" /><span>Automatiza flujos con Webhooks.</span></p>
        </div>

        <div className="pt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Quizás más tarde</Button>
          <Button onClick={() => alert("¡Redirigiendo a pago! (Simulación)")}>Confirmar y Pagar</Button>
        </div>
      </div>
    </Modal>
  );
};

export default UpgradeModal;