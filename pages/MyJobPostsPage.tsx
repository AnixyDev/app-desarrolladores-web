import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useAppStore } from '../hooks/useAppStore.tsx';
import Card, { CardContent, CardHeader } from '../components/ui/Card.tsx';
import { Building, Briefcase, EditIcon, TrashIcon, Users } from 'lucide-react';
import { Job } from '../types.ts';
import EmptyState from '../components/ui/EmptyState.tsx';
import Button from '../components/ui/Button.tsx';
import { Link, useNavigate } from 'react-router-dom';

const UpgradePromptModal = lazy(() => import('../components/modals/UpgradePromptModal.tsx'));

const MyJobPostsPage: React.FC = () => {
    const { jobs, applications, profile } = useAppStore();
    const navigate = useNavigate();
    
    const myJobs = jobs.filter(j => j.postedByUserId === profile?.id); 
    
    // Solo mostramos el modal si el perfil está cargado Y es Free
    const showUpgrade = profile && profile.id && profile.plan === 'Free';

    const getApplicantCount = (jobId: string) => {
        return applications.filter(app => app.jobId === jobId).length;
    };

    if (showUpgrade) {
        return (
            <Suspense fallback={null}>
                <UpgradePromptModal
                    isOpen={true}
                    onClose={() => navigate('/job-market')}
                    featureName="gestionar tus ofertas publicadas"
                />
            </Suspense>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
                    <Building className="w-6 h-6"/> Mis Ofertas Publicadas
                </h1>
                <Button as={Link} to="/post-job">Publicar Nueva Oferta</Button>
            </div>
            
            {myJobs.length === 0 ? (
                 <EmptyState
                    icon={Briefcase}
                    title="Aún no has publicado ninguna oferta"
                    message="Atrae al mejor talento para tu proyecto publicando una oferta en nuestro marketplace."
                    action={{ text: 'Publicar Oferta', onClick: () => navigate('/post-job') }}
                />
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="border-b border-gray-800">
                                    <tr>
                                        <th className="p-4">Título de la Oferta</th>
                                        <th className="p-4">Fecha de Publicación</th>
                                        <th className="p-4">Postulaciones</th>
                                        <th className="p-4 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {myJobs.map(job => (
                                        <tr key={job.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                                            <td className="p-4 font-semibold text-white">
                                                <Link to={`/job-market/${job.id}`} className="hover:text-primary-400">{job.titulo}</Link>
                                            </td>
                                            <td className="p-4 text-gray-300">{job.fechaPublicacion}</td>
                                            <td className="p-4 text-white font-semibold">
                                                <Link to={`/my-job-posts/${job.id}/applicants`} className="flex items-center gap-2 text-primary-400 hover:underline">
                                                    <Users className="w-4 h-4"/>
                                                    <span>{getApplicantCount(job.id)}</span>
                                                </Link>
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex gap-2 justify-end">
                                                    <Button size="sm" variant="secondary"><EditIcon className="w-4 h-4"/></Button>
                                                    <Button size="sm" variant="danger"><TrashIcon className="w-4 h-4"/></Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default MyJobPostsPage;