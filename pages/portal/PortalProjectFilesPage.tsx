import React from 'react';
import Card, { CardContent, CardHeader } from '../../components/ui/Card';
import { BriefcaseIcon } from '../../components/icons/Icon';
import EmptyState from '../../components/ui/EmptyState';

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

export default PortalProjectFilesPage;
