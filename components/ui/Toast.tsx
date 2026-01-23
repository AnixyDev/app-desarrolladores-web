import React from 'react';
import { useToast, ToastType } from '../../hooks/useToast';
// FIX: Remove .tsx extension from icon import to fix module resolution error.
import { CheckCircleIcon, XCircleIcon } from '../icons/Icon';

const toastIcons: Record<ToastType, React.ElementType> = {
    success: CheckCircleIcon,
    error: XCircleIcon,
    info: CheckCircleIcon, // Using CheckCircle for info for now
};

const toastColors: Record<ToastType, string> = {
    success: 'bg-green-600/90 border-green-500',
    error: 'bg-red-600/90 border-red-500',
    info: 'bg-blue-600/90 border-blue-500',
};

const ToastContainer: React.FC = () => {
    const { toasts, removeToast } = useToast();

    if (!toasts.length) return null;

    return (
        <div className="fixed top-5 right-5 z-[100] space-y-2">
            {toasts.map((toast) => {
                const Icon = toastIcons[toast.type];
                return (
                    <div
                        key={toast.id}
                        className={`flex items-center p-4 rounded-lg shadow-lg text-white border ${toastColors[toast.type]} backdrop-blur-sm animate-fade-in-right w-full max-w-sm`}
                    >
                        <Icon className="w-6 h-6 mr-3 shrink-0" />
                        <p className="flex-1 text-sm font-medium">{toast.message}</p>
                        <button onClick={() => removeToast(toast.id)} className="ml-4 p-1 rounded-full hover:bg-white/10 shrink-0">
                            <XCircleIcon className="w-5 h-5" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
};

export default ToastContainer;
