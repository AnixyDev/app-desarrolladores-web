import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useAppStore } from '@/hooks/useAppStore';
import { NewBudget, InvoiceItem, Budget } from '@/types';
import { PlusIcon, TrashIcon } from '@/components/icons/Icon';

interface CreateBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  // NUEVO: si se pasa un presupuesto, el modal cambia a modo edición —
  // mismo formulario, pero precargado y guardando con updateBudget en vez
  // de crear uno nuevo.
  budgetToEdit?: Budget | null;
}

const CreateBudgetModal: React.FC<CreateBudgetModalProps> = ({ isOpen, onClose, budgetToEdit }) => {
  const { clients, addBudget, updateBudget } = useAppStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!budgetToEdit;

  const emptyForm: NewBudget = {
    client_id: clients[0]?.id || '',
    description: '',
    items: [{ description: '', quantity: 1, price_cents: 0 }],
    status: 'pending'
  };

  const [form, setForm] = useState<NewBudget>(emptyForm);

  // Al abrir en modo edición (o al cambiar de presupuesto a editar),
  // precarga el formulario con sus datos actuales.
  useEffect(() => {
    if (isOpen) {
      setForm(budgetToEdit ? {
        client_id: budgetToEdit.client_id,
        description: budgetToEdit.description,
        items: budgetToEdit.items,
        status: budgetToEdit.status,
      } : emptyForm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, budgetToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (isEditing && budgetToEdit) {
        await updateBudget(budgetToEdit.id, form);
      } else {
        await addBudget(form);
      }
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addItem = () => {
    setForm(prev => ({
      ...prev,
      items: [...prev.items, { description: '', quantity: 1, price_cents: 0 }]
    }));
  };

  const removeItem = (index: number) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar Presupuesto' : 'Crear Nuevo Presupuesto'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Cliente</label>
          <select 
            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white"
            value={form.client_id}
            onChange={e => setForm({...form, client_id: e.target.value})}
          >
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        
        <Input 
          label="Descripción del Proyecto"
          value={form.description}
          onChange={e => setForm({...form, description: e.target.value})}
          placeholder="Ej: Rediseño Web Corporativa"
          required
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-400">Conceptos</label>
          {form.items.map((item, index) => (
            <div key={index} className="flex gap-2 items-end">
              <div className="flex-1">
                <Input 
                  value={item.description}
                  onChange={e => {
                    const newItems = [...form.items];
                    newItems[index].description = e.target.value;
                    setForm({...form, items: newItems});
                  }}
                  placeholder="Descripción"
                />
              </div>
              <div className="w-20">
                <Input 
                  type="number"
                  value={item.quantity}
                  onChange={e => {
                    const newItems = [...form.items];
                    newItems[index].quantity = Number(e.target.value);
                    setForm({...form, items: newItems});
                  }}
                />
              </div>
              <div className="w-32">
                <Input 
                  type="number"
                  value={item.price_cents / 100}
                  onChange={e => {
                    const newItems = [...form.items];
                    newItems[index].price_cents = Number(e.target.value) * 100;
                    setForm({...form, items: newItems});
                  }}
                  placeholder="Precio"
                />
              </div>
              <Button type="button" variant="secondary" onClick={() => removeItem(index)}>
                <TrashIcon className="w-4 h-4 text-red-400" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={addItem} className="w-full">
            <PlusIcon className="w-4 h-4 mr-2" /> Añadir Concepto
          </Button>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (isEditing ? 'Guardando...' : 'Creando...') : (isEditing ? 'Guardar Cambios' : 'Crear Presupuesto')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateBudgetModal;