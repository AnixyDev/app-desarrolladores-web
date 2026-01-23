// pages/PublicProfilePage.tsx
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import Card, { CardContent, CardHeader } from '../components/ui/Card';
// FIX: Corrected the import for the Briefcase icon.
import { MailIcon, UserIcon as User, BriefcaseIcon as Briefcase, LinkIcon } from '../components/icons/Icon';
import Button from '../components/ui/Button';
import { Link, useNavigate } from 'react-router-dom';

const UpgradePromptModal = lazy(() => import('../components/modals/UpgradePromptModal'));

const PublicProfilePage: React.FC = () => {
    const { profile } = useAppStore();
    const navigate = useNavigate();
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

    useEffect(() => {
        if (profile?.plan === 'Free') {
            setIsUpgradeModalOpen(true);
        }
    }, [profile?.plan]);

    if (!profile) {
        return <div>Cargando perfil...</div>;
    }

    if (isUpgradeModalOpen) {
        return (
            <Suspense fallback={null}>
                <UpgradePromptModal
                    isOpen={isUpgradeModalOpen}
                    onClose={() => navigate('/')}
                    featureName="tener un perfil público de freelancer"
                />
            </Suspense>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
             <div className="flex justify-between items-center">
                <h1 className="text-2xl font-semibold text-white">Mi Perfil Público</h1>
                 <Button as={Link} to="/settings" variant="secondary">Editar Perfil</Button>
            </div>
            <Card>
                <CardHeader className="text-center p-8 bg-gray-800/50">
                    {profile.avatar_url ? (
                        <img src={profile.avatar_url} alt="Perfil" className="w-24 h-24 rounded-full object-cover mx-auto mb-4 border-4 border-gray-600" />
                    ) : (
                        <User className="w-24 h-24 rounded-full bg-gray-700 text-gray-300 p-4 mx-auto mb-4 border-4 border-gray-600" />
                    )}
                    <h1 className="text-3xl font-bold text-white">{profile.full_name}</h1>
                    <p className="text-xl text-primary-400">{profile.business_name}</p>
                </CardHeader>
                <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-4">
                        <div>
                            <h3 className="font-semibold text-white mb-2">Sobre mí</h3>
                            <p className="text-gray-300">{profile.bio || 'Aún no has añadido una biografía.'}</p>
                        </div>
                        <div>
                            <h3 className="font-semibold text-white mb-2">Habilidades Principales</h3>
                            <div className="flex flex-wrap gap-2">
                                {profile.skills && profile.skills.length > 0 ? (
                                    profile.skills.map(skill => (
                                        <span key={skill} className="px-3 py-1 text-sm font-medium rounded-full bg-gray-800 text-fuchsia-400 border border-fuchsia-900/50">
                                            {skill}
                                        </span>
                                    ))
                                ) : (
                                    <p className="text-sm text-gray-500">Añade tus habilidades en Ajustes.</p>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="space-y-4 pt-4 border-t md:border-t-0 md:border-l border-gray-700 md:pl-6">
                         <h3 className="font-semibold text-white text-center md:text-left">Contacto y Enlaces</h3>
                         <div className="flex items-center space-x-3">
                            <MailIcon className="w-5 h-5 text-gray-400" />
                            <a href={`mailto:${profile.email}`} className="text-gray-300 hover:text-white truncate">{profile.email}</a>
                        </div>
                        {profile.portfolio_url && (
                             <div className="flex items-center space-x-3">
                                <LinkIcon className="w-5 h-5 text-gray-400" />
                                <a href={profile.portfolio_url} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-white truncate">{profile.portfolio_url}</a>
                            </div>
                        )}
                        <div className="flex items-center space-x-3">
                            <Briefcase className="w-5 h-5 text-gray-400" />
                            <span className="text-gray-300">Tarifa: {profile.hourly_rate_cents / 100}€/hora</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default PublicProfilePage;