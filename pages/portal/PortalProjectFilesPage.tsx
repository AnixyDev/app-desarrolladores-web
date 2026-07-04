import React from 'react';
import { BriefcaseIcon } from '@/components/icons/Icon';
import EmptyState from '@/components/ui/EmptyState';

const PortalProjectFilesPage: React.FC = () => {
    return (
        <div>
            <h1 className="text-2xl font-semibold text-white mb-6">Archivos del Proyecto</h1>
            <EmptyState
                icon={BriefcaseIcon}
                title="Archivos no disponibles"
                message="Esta sección para compartir y gestionar archivos con el cliente está en desarrollo."
            />
        </div>
    );
};
const { data: { user } } = await supabase.auth.getUser();

await supabase.from('portal_comments').insert({
  entityid: entityId,
  username: user?.user_metadata?.full_name ?? 'Usuario',
  text: commentText,
  user_id: user?.id,        // 👈 línea nueva, obligatoria ahora
});

export default PortalProjectFilesPage;
