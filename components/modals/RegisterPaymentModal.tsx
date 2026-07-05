// components/modals/RegisterPaymentModal.tsx
import React, { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/useToast';

interface RegisterPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoiceId: string;
    remainingCents: number; // total_cents - suma de pagos ya hechos
    onPaymentRegistered: () => void; // callback para refrescar la lista de facturas/pagos
}

const RegisterPaymentModal: React.FC<RegisterPaymentModalProps> = ({
    isOpen,
    onClose,
    invoiceId,
    remainingCents,
    onPaymentRegistered,
}) => {
    const { addToast } = useToast();
    const [amount, setAmount] = useState<string>((remainingCents / 100).toFixed(2));
    const [paidAt, setPaidAt] = useState<string>(new Date().toISOString().split('T')[0]);
    const [method, setMethod] = useState('Transferencia');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const amountCents = Math.round(Number(amount) * 100);

        if (!amountCents || amountCents <= 0) {
            addToast('Introduce un importe válido.', 'error');
            return;
        }

        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Sesión no válida.');

            const { error } = await supabase.from('payments').insert({
                invoice_id: invoiceId,
                user_id: user.id,
                amount_cents: amountCents,
                paid_at: paidAt,
                method,
                notes: notes || null,
            });

            if (error) throw error;

            addToast('Pago registrado correctamente.', 'success');
            onPaymentRegistered();
            onClose();
        } catch (err: any) {
            addToast(err.message || 'Error al registrar el pago.', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Registrar pago">
            <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                    label="Importe (€)"
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                />
                <Input
                    label="Fecha del pago"
                    type="date"
                    value={paidAt}
                    onChange={(e) => setPaidAt(e.target.value)}
                    required
                />
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Método</label>
                    <select
                        value={method}
                        onChange={(e) => setMethod(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                        <option value="Transferencia">Transferencia</option>
                        <option value="Efectivo">Efectivo</option>
                        <option value="Tarjeta">Tarjeta</option>
                        <option value="Bizum">Bizum</option>
                        <option value="Otro">Otro</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Notas (opcional)</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                        className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white resize-none"
                    />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Registrar pago'}</Button>
                </div>
            </form>
        </Modal>
    );
};

export default RegisterPaymentModal;