// pages/PortalBrandingPage.tsx
//
// NUEVO: permite al freelancer personalizar el portal que ven SUS clientes
// (logo propio + color de marca), en vez del genérico "Portal de Cliente".
// Es una función Pro/Teams (mismo criterio que el Libro Fiscal): en el plan
// Free se ve una vista previa bloqueada con el upgrade como CTA.
import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useAppStore } from '@/hooks/useAppStore';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabaseClient';
import { ZapIcon, UploadIcon, CopyIcon, CheckCircleIcon } from '@/components/icons/Icon';

const DEFAULT_BRAND_COLOR = '#d9009f';

const PortalBrandingPage: React.FC = () => {
    const { profile, updateProfile } = useAppStore();
    const { addToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [brandColor, setBrandColor] = useState(profile?.pdf_color || DEFAULT_BRAND_COLOR);
    const [isSavingColor, setIsSavingColor] = useState(false);
    const [copied, setCopied] = useState(false);

    const brandName = profile?.business_name || profile?.full_name || 'Tu negocio';
    const portalUrl = `${window.location.origin}/portal/login`;

    const handleLogoSelect = () => {
        fileInputRef.current?.click();
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !profile?.id) return;

        if (!file.type.startsWith('image/')) {
            addToast('El archivo debe ser una imagen (PNG, JPG, SVG...).', 'error');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            addToast('El logo no puede pesar más de 2MB.', 'error');
            return;
        }

        setIsUploading(true);
        try {
            const ext = file.name.split('.').pop();
            // Ruta con el user_id como carpeta: así la política de Storage
            // (owner_insert/update/delete) puede comprobar que cada
            // freelancer solo toca su propia carpeta.
            const path = `${profile.id}/logo.${ext}`;

            const { error: uploadError } = await supabase.storage
                .from('brand-logos')
                .upload(path, file, { upsert: true, cacheControl: '3600' });

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage.from('brand-logos').getPublicUrl(path);
            // Se añade un parámetro de caché para que el navegador refresque
            // la imagen inmediatamente al subir un logo nuevo con el mismo nombre.
            const finalUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

            await updateProfile({ portal_logo_url: finalUrl });
            addToast('Logo actualizado. Tus clientes ya lo verán en el portal.', 'success');
        } catch (error: any) {
            addToast(error.message || 'No se pudo subir el logo.', 'error');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSaveColor = async () => {
        setIsSavingColor(true);
        try {
            // Se reutiliza pdf_color (el mismo color ya se usa en las
            // facturas en PDF) para que la marca sea consistente en toda
            // la experiencia del cliente, no solo en el portal.
            await updateProfile({ pdf_color: brandColor });
            addToast('Color de marca guardado.', 'success');
        } catch (error) {
            addToast('No se pudo guardar el color.', 'error');
        } finally {
            setIsSavingColor(false);
        }
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(portalUrl);
        setCopied(true);
        addToast('Enlace copiado.', 'success');
        setTimeout(() => setCopied(false), 2000);
    };

    if (profile && profile.plan === 'Free') {
        return (
            <div className="space-y-6">
                <h1 className="text-2xl font-semibold text-white">Portal de Cliente</h1>
                <div className="relative">
                    <div className="pointer-events-none select-none blur-sm opacity-40">
                        <Card>
                            <CardContent className="p-8 space-y-4">
                                <div className="h-24 bg-gray-800 rounded-xl" />
                                <div className="h-10 bg-gray-800 rounded-xl w-1/2" />
                                <div className="h-10 bg-gray-800 rounded-xl w-1/3" />
                            </CardContent>
                        </Card>
                    </div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                        <div className="bg-gray-950/90 border border-gray-800 rounded-2xl p-8 max-w-md">
                            <ZapIcon className="w-10 h-10 text-yellow-400 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-white mb-2">Portal de Cliente — función Pro</h3>
                            <p className="text-gray-400 text-sm mb-6">
                                Pon tu propio logo y color de marca en el portal donde tus clientes ven sus presupuestos, facturas y contratos — en vez de la marca genérica de DevFreelancer.
                            </p>
                            <Button as={Link} to="/billing" className="w-full">Actualizar a Pro</Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-semibold text-white">Portal de Cliente</h1>
                <p className="text-gray-400 text-sm mt-1">
                    Personaliza el portal donde tus clientes ven sus presupuestos, propuestas, contratos y facturas.
                </p>
            </div>

            {/* Vista previa en vivo */}
            <Card>
                <CardHeader><h2 className="text-lg font-semibold text-white">Vista previa</h2></CardHeader>
                <CardContent>
                    <div className="bg-black border border-gray-800 rounded-xl overflow-hidden">
                        <div className="py-4 px-6 flex items-center gap-3">
                            {profile?.portal_logo_url ? (
                                <img src={profile.portal_logo_url} alt={brandName} className="h-9 w-9 rounded-lg object-cover border border-gray-800" />
                            ) : (
                                <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: brandColor }}>
                                    {brandName.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div>
                                <p className="text-white font-bold leading-tight">{brandName}</p>
                                <p className="text-[11px] text-gray-500 leading-tight">Portal de Cliente</p>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Así es como verán tus clientes la cabecera del portal.</p>
                </CardContent>
            </Card>

            {/* Logo */}
            <Card>
                <CardHeader><h2 className="text-lg font-semibold text-white">Logo</h2></CardHeader>
                <CardContent className="flex items-center gap-4">
                    {profile?.portal_logo_url ? (
                        <img src={profile.portal_logo_url} alt="Logo actual" className="h-16 w-16 rounded-xl object-cover border border-gray-700" />
                    ) : (
                        <div className="h-16 w-16 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-600 text-xs text-center">
                            Sin logo
                        </div>
                    )}
                    <div>
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                        <Button onClick={handleLogoSelect} disabled={isUploading} variant="secondary">
                            <UploadIcon className="w-4 h-4 mr-2" />
                            {isUploading ? 'Subiendo...' : profile?.portal_logo_url ? 'Cambiar logo' : 'Subir logo'}
                        </Button>
                        <p className="text-xs text-gray-500 mt-2">PNG, JPG o SVG. Máx. 2MB. Ideal: cuadrado, fondo transparente.</p>
                    </div>
                </CardContent>
            </Card>

            {/* Color de marca */}
            <Card>
                <CardHeader><h2 className="text-lg font-semibold text-white">Color de marca</h2></CardHeader>
                <CardContent className="flex items-center gap-4">
                    <input
                        type="color"
                        value={brandColor}
                        onChange={(e) => setBrandColor(e.target.value)}
                        className="h-12 w-16 rounded-lg border border-gray-700 bg-transparent cursor-pointer"
                    />
                    <div className="flex-1">
                        <p className="text-sm text-gray-300 font-mono">{brandColor}</p>
                        <p className="text-xs text-gray-500">Se usa también en tus facturas en PDF.</p>
                    </div>
                    <Button onClick={handleSaveColor} disabled={isSavingColor || brandColor === profile?.pdf_color}>
                        {isSavingColor ? 'Guardando...' : 'Guardar color'}
                    </Button>
                </CardContent>
            </Card>

            {/* Enlace para compartir */}
            <Card>
                <CardHeader><h2 className="text-lg font-semibold text-white">Enlace del portal</h2></CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm text-gray-400">
                        Comparte este enlace con tus clientes. Entrarán con el mismo email que tengas registrado en su ficha de <Link to="/clients" className="text-primary-400 hover:underline">Clientes</Link>.
                    </p>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 truncate">{portalUrl}</code>
                        <Button onClick={handleCopyLink} variant="secondary" size="sm">
                            {copied ? <CheckCircleIcon className="w-4 h-4 text-green-400" /> : <CopyIcon className="w-4 h-4" />}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default PortalBrandingPage;