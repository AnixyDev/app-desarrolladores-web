import React, { useRef, useState, lazy, Suspense } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { SparklesIcon, UploadIcon, AlertTriangleIcon } from '../icons/Icon';
import { useAppStore } from '@/hooks/useAppStore';
import { useToast } from '@/hooks/useToast';
import { extractExpenseFromImage, AI_CREDIT_COSTS, ExtractedExpenseData } from '@/services/geminiService';

const BuyCreditsModal = lazy(() => import('./BuyCreditsModal'));

// Debe coincidir con ALLOWED_IMAGE_MIME_TYPES en supabase/functions/ai-gemini/index.ts
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
// 8MB de foto sin comprimir es más que suficiente para leer un ticket, y evita
// subidas gigantes desde móviles con cámaras de muchos megapíxeles.
const MAX_FILE_BYTES = 8 * 1024 * 1024;

interface ExpenseOcrModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Se llama con los datos ya extraídos y saneados; el padre decide qué hacer con ellos (p. ej. precargar el formulario de "Añadir Gasto"). */
    onExtracted: (data: ExtractedExpenseData) => void;
}

const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            // El resultado viene como "data:image/jpeg;base64,AAAA..." — a la API
            // de Gemini solo le pasamos la parte de después de la coma.
            const base64 = result.split(',')[1] ?? '';
            resolve(base64);
        };
        reader.onerror = () => reject(new Error('No se ha podido leer el archivo.'));
        reader.readAsDataURL(file);
    });

const ExpenseOcrModal: React.FC<ExpenseOcrModalProps> = ({ isOpen, onClose, onExtracted }) => {
    const { profile, consumeCredits } = useAppStore();
    const { addToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isBuyCreditsModalOpen, setIsBuyCreditsModalOpen] = useState(false);

    const resetState = () => {
        setSelectedFile(null);
        setPreviewUrl(null);
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            addToast('Formato no soportado. Usa una foto en JPG, PNG, WEBP o HEIC.', 'error');
            return;
        }
        if (file.size > MAX_FILE_BYTES) {
            addToast('La imagen pesa demasiado. Prueba con una foto de menor resolución.', 'error');
            return;
        }

        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
    };

    const handleExtract = async () => {
        if (!selectedFile) return;

        if ((profile.ai_credits || 0) < AI_CREDIT_COSTS.extractExpenseFromImage) {
            setIsBuyCreditsModalOpen(true);
            return;
        }

        setIsLoading(true);
        try {
            const base64 = await fileToBase64(selectedFile);
            const data = await extractExpenseFromImage(base64, selectedFile.type);
            await consumeCredits(AI_CREDIT_COSTS.extractExpenseFromImage);

            if (data.confidence < 0.5) {
                addToast('La foto no se lee del todo bien: revisa los datos antes de guardar.', 'error');
            } else {
                addToast('Datos extraídos. Revísalos y guarda el gasto.', 'success');
            }

            onExtracted(data);
            handleClose();
        } catch (err) {
            addToast((err as Error).message || 'No se ha podido procesar el ticket.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <Modal isOpen={isOpen} onClose={handleClose} title="Escanear ticket con IA">
                <div className="space-y-4">
                    <p className="text-sm text-gray-400">
                        Sube una foto de un ticket o factura de proveedor. La IA extraerá el importe, el IVA, la fecha y la
                        categoría automáticamente — podrás revisarlos y editarlos antes de guardar el gasto.
                    </p>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                        capture="environment"
                        onChange={handleFileChange}
                        className="hidden"
                    />

                    {previewUrl ? (
                        <div className="relative">
                            <img
                                src={previewUrl}
                                alt="Vista previa del ticket"
                                className="w-full max-h-64 object-contain rounded-md border border-gray-700 bg-black"
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="mt-2 text-sm text-primary-400 hover:text-primary-300"
                            >
                                Elegir otra foto
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-700 rounded-md py-10 text-gray-400 hover:border-primary-500 hover:text-primary-400 transition-colors"
                        >
                            <UploadIcon className="w-8 h-8" />
                            <span className="text-sm">Toca para hacer una foto o subir una imagen</span>
                        </button>
                    )}

                    <div className="flex items-start gap-2 text-xs text-gray-500">
                        <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                            Consume {AI_CREDIT_COSTS.extractExpenseFromImage} créditos de IA. La IA puede cometer errores:
                            revisa siempre los datos antes de guardar el gasto.
                        </span>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="secondary" onClick={handleClose} disabled={isLoading}>
                            Cancelar
                        </Button>
                        <Button onClick={handleExtract} disabled={!selectedFile} isLoading={isLoading}>
                            <SparklesIcon className="w-4 h-4 mr-2" />
                            {isLoading ? 'Leyendo ticket...' : 'Extraer datos'}
                        </Button>
                    </div>
                </div>
            </Modal>

            <Suspense fallback={null}>
                {isBuyCreditsModalOpen && (
                    <BuyCreditsModal isOpen={isBuyCreditsModalOpen} onClose={() => setIsBuyCreditsModalOpen(false)} />
                )}
            </Suspense>
        </>
    );
};

export default ExpenseOcrModal;