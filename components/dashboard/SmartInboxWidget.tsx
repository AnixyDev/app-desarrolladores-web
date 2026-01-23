// components/dashboard/SmartInboxWidget.tsx
import React from 'react';
import { useAppStore } from '../../hooks/useAppStore';
import { InboxIcon, MailIcon, FileTextIcon, MessageSquareIcon } from '../icons/Icon.tsx';
import { Link } from 'react-router-dom';

const getCategoryIcon = (category: string) => {
    switch(category) {
        case 'invoice': return <FileTextIcon className="w-5 h-5 text-green-400" />;
        case 'proposal': return <MessageSquareIcon className="w-5 h-5 text-purple-400" />;
        case 'client': return <MailIcon className="w-5 h-5 text-blue-400" />;
        default: return <MailIcon className="w-5 h-5 text-gray-400" />;
    }
};

const SmartInboxWidget: React.FC = () => {
    // This component is currently not used but is scaffolded for future use.
    // To use it, you would need to implement the inbox slice and add this to the dashboard.
    // const { inboxItems, markAsRead } = useAppStore();
    const inboxItems: any[] = []; // Placeholder
    const markAsRead = (id: string) => {}; // Placeholder

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-lg shadow-lg">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                <h3 className="font-semibold text-white flex items-center gap-2">
                    <InboxIcon className="w-5 h-5" /> Bandeja Inteligente
                </h3>
                <Link to="/inbox" className="text-sm text-primary-400 hover:underline">Ver todo</Link>
            </div>
            <div className="max-h-96 overflow-y-auto">
                {inboxItems.length > 0 ? (
                    inboxItems.map(item => (
                        <div key={item.id} onClick={() => markAsRead(item.id)} className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-gray-800/50 ${!item.isRead ? 'bg-primary-600/10' : ''}`}>
                            <div className="shrink-0 mt-1">{getCategoryIcon(item.category)}</div>
                            <div>
                                <p className="text-sm font-semibold text-gray-200">{item.subject}</p>
                                <p className="text-xs text-gray-400">{item.preview}</p>
                            </div>
                        </div>
                    ))
                ) : (
                    <p className="text-center text-gray-500 text-sm py-8">Tu bandeja está vacía.</p>
                )}
            </div>
        </div>
    );
};

export default SmartInboxWidget;
