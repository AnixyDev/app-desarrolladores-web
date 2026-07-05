import React from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import { InboxItem } from '@/hooks/store/inboxSlice';
import { InboxIcon, MailIcon, FileTextIcon, MessageSquareIcon } from '@/components/icons/Icon';
import EmptyState from '@/components/ui/EmptyState';

const getCategoryIcon = (category: InboxItem['category']) => {
  switch (category) {
    case 'invoice':  return <FileTextIcon className="w-5 h-5 text-green-400" />;
    case 'proposal': return <MessageSquareIcon className="w-5 h-5 text-purple-400" />;
    case 'client':   return <MailIcon className="w-5 h-5 text-blue-400" />;
    default:         return <MailIcon className="w-5 h-5 text-gray-400" />;
  }
};

const formatTimestamp = (iso: string): string => {
  const date = new Date(iso);
  const now = new Date();
  const diffH = Math.floor((now.getTime() - date.getTime()) / 3_600_000);
  if (diffH < 1) return 'Hace un momento';
  if (diffH < 24) return `Hace ${diffH}h`;
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

const InboxPage: React.FC = () => {
  const { inboxItems, markAsRead } = useAppStore();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white flex items-center gap-2">
        <InboxIcon className="w-7 h-7" />
        Bandeja Inteligente
      </h1>

      <div className="bg-gray-900 border border-gray-800 rounded-lg shadow-lg divide-y divide-gray-800">
        {inboxItems.length > 0 ? (
          inboxItems.map(item => (
            <div
              key={item.id}
              onClick={() => markAsRead(item.id)}
              className={`flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-800/50 transition-colors
                ${!item.isRead ? 'bg-primary-600/10' : ''}`}
            >
              <div className="shrink-0 mt-1">{getCategoryIcon(item.category)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline gap-2">
                  <p className={`text-sm truncate ${!item.isRead ? 'font-semibold text-white' : 'text-gray-300'}`}>
                    {item.subject}
                  </p>
                  <span className="text-xs text-gray-500 shrink-0">
                    {formatTimestamp(item.timestamp)}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">{item.preview}</p>
              </div>
              {!item.isRead && <span className="shrink-0 w-2 h-2 mt-2 rounded-full bg-primary-500" />}
            </div>
          ))
        ) : (
          <EmptyState
            icon={InboxIcon}
            title="Bandeja vacía"
            message="No tienes notificaciones ni mensajes pendientes."
          />
        )}
      </div>
    </div>
  );
};

export default InboxPage;