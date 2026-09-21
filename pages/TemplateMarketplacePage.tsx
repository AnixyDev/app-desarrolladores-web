// pages/TemplateMarketplacePage.tsx
//
// Ítem 8 del roadmap de monetización: marketplace de plantillas entre
// freelancers (propuestas, contratos, facturas). Dos pestañas:
// - "Mis Plantillas": crear/editar las propias, decidir si se publican y
//   a qué precio.
// - "Marketplace": explorar y comprar las de otros freelancers. El
//   contenido real nunca se ve hasta comprar — solo nombre/descripción/
//   precio (ver las vistas *_marketplace en Supabase, que nunca exponen
//   content_template/title_template/items).
//
// El cobro reutiliza el mismo Stripe Connect ya montado para las facturas
// (payment-sheet + stripe-webhook): el vendedor necesita su cuenta
// verificada para poder vender, igual que para cobrar facturas.

import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabaseClient';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { StoreIcon, PlusIcon, TrashIcon, EditIcon, TagIcon, DownloadIcon, ShieldCheckIcon } from '@/components/icons/Icon';

const StripePaymentModal = lazy(() => import('@/components/modals/StripePaymentModal'));

type TemplateType = 'proposal' | 'contract' | 'invoice';

const TYPE_LABELS: Record<TemplateType, string> = {
  proposal: 'Propuestas',
  contract: 'Contratos',
  invoice: 'Facturas',
};

const TYPE_CONTENT_FIELD: Record<TemplateType, string> = {
  proposal: 'content_template',
  contract: 'content_template',
  invoice: 'items',
};

interface OwnTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_public: boolean;
  price_cents: number;
  downloads_count: number;
  [key: string]: any;
}

interface MarketplaceListing {
  id: string;
  seller_id: string;
  name: string;
  description: string | null;
  category: string | null;
  price_cents: number;
  downloads_count: number;
  created_at: string;
  business_name: string | null;
  full_name: string | null;
}

const TemplateMarketplacePage: React.FC = () => {
  const { profile } = useAppStore(useShallow(s => ({ profile: s.profile })));
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<'mine' | 'marketplace'>('marketplace');
  const [templateType, setTemplateType] = useState<TemplateType>('proposal');

  const [ownTemplates, setOwnTemplates] = useState<OwnTemplate[]>([]);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<OwnTemplate | null>(null);
  const [formState, setFormState] = useState({ name: '', description: '', category: '', content: '', is_public: false, price_euros: '' });

  const [purchasing, setPurchasing] = useState<MarketplaceListing | null>(null);

  const table = `${templateType}_templates`;
  const marketplaceView = `${templateType}_templates_marketplace`;
  const contentField = TYPE_CONTENT_FIELD[templateType];

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    if (activeTab === 'mine') {
      const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false });
      if (error) addToast('No se pudieron cargar tus plantillas.', 'error');
      else setOwnTemplates((data as OwnTemplate[]) || []);
    } else {
      const { data, error } = await supabase.from(marketplaceView).select('*').order('downloads_count', { ascending: false });
      if (error) addToast('No se pudo cargar el marketplace.', 'error');
      else setListings((data as MarketplaceListing[]) || []);
    }
    setIsLoading(false);
  }, [activeTab, table, marketplaceView, addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreateForm = () => {
    setEditing(null);
    setFormState({ name: '', description: '', category: '', content: '', is_public: false, price_euros: '' });
    setIsFormOpen(true);
  };

  const openEditForm = (t: OwnTemplate) => {
    setEditing(t);
    setFormState({
      name: t.name,
      description: t.description || '',
      category: t.category || '',
      content: typeof t[contentField] === 'string' ? t[contentField] : JSON.stringify(t[contentField] || '', null, 2),
      is_public: t.is_public,
      price_euros: t.price_cents ? (t.price_cents / 100).toFixed(2) : '',
    });
    setIsFormOpen(true);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    const price_cents = formState.is_public && formState.price_euros
      ? Math.round(parseFloat(formState.price_euros) * 100)
      : 0;

    if (formState.is_public && price_cents > 0 && !profile.stripe_onboarding_complete) {
      addToast('Para vender plantillas de pago necesitas verificar tu cuenta de cobro en Ajustes → Cobros a clientes.', 'error');
      return;
    }

    const payload: Record<string, any> = {
      user_id: profile.id,
      name: formState.name,
      description: formState.description || null,
      category: formState.category || null,
      is_public: formState.is_public,
      price_cents,
      [contentField]: formState.content,
    };

    const { error } = editing
      ? await supabase.from(table).update(payload).eq('id', editing.id)
      : await supabase.from(table).insert(payload);

    if (error) {
      addToast('No se pudo guardar la plantilla.', 'error');
    } else {
      addToast(editing ? 'Plantilla actualizada.' : 'Plantilla guardada.', 'success');
      setIsFormOpen(false);
      fetchData();
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) addToast('No se pudo eliminar.', 'error');
    else { addToast('Plantilla eliminada.', 'success'); fetchData(); }
  };

  const handlePurchaseSuccess = () => {
    addToast('Plantilla comprada — ya está en "Mis Plantillas".', 'success');
    setPurchasing(null);
    setActiveTab('mine');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
            <StoreIcon className="w-6 h-6" /> Marketplace de Plantillas
          </h1>
          <p className="text-sm text-gray-500 mt-1">Compra y vende plantillas de propuestas, contratos y facturas entre freelancers.</p>
        </div>
        {activeTab === 'mine' && (
          <Button onClick={openCreateForm}><PlusIcon className="w-4 h-4 mr-2" />Nueva Plantilla</Button>
        )}
      </div>

      <div className="flex items-center gap-2 border-b border-gray-800">
        <button
          onClick={() => setActiveTab('marketplace')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'marketplace' ? 'border-primary-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
        >
          Explorar Marketplace
        </button>
        <button
          onClick={() => setActiveTab('mine')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'mine' ? 'border-primary-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
        >
          Mis Plantillas
        </button>
      </div>

      <div className="flex gap-2">
        {(Object.keys(TYPE_LABELS) as TemplateType[]).map(t => (
          <button
            key={t}
            onClick={() => setTemplateType(t)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${templateType === t ? 'bg-primary-600 border-primary-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-center text-gray-500 py-10">Cargando...</p>
      ) : activeTab === 'marketplace' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.length === 0 && (
            <p className="col-span-full text-center text-gray-500 py-10">Todavía no hay plantillas públicas de {TYPE_LABELS[templateType].toLowerCase()}.</p>
          )}
          {listings.map(listing => (
            <Card key={listing.id}>
              <CardContent className="p-5 space-y-3">
                <div>
                  <h3 className="font-semibold text-white">{listing.name}</h3>
                  <p className="text-xs text-gray-500">por {listing.business_name || listing.full_name || 'Freelancer'}</p>
                </div>
                {listing.description && <p className="text-sm text-gray-400 line-clamp-3">{listing.description}</p>}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-lg font-bold text-white">
                    {listing.price_cents > 0 ? `${(listing.price_cents / 100).toFixed(2)}€` : 'Gratis'}
                  </span>
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <DownloadIcon className="w-3 h-3" /> {listing.downloads_count}
                  </span>
                </div>
                {listing.seller_id === profile?.id ? (
                  <p className="text-xs text-center text-gray-600 pt-1">Es tuya</p>
                ) : (
                  <Button onClick={() => setPurchasing(listing)} className="w-full">
                    {listing.price_cents > 0 ? 'Comprar' : 'Obtener gratis'}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-gray-800">
            {ownTemplates.length === 0 && (
              <p className="p-6 text-center text-gray-500 text-sm">No tienes plantillas de {TYPE_LABELS[templateType].toLowerCase()} todavía.</p>
            )}
            {ownTemplates.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate flex items-center gap-2">
                    {t.name}
                    {t.is_public && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-900/30 text-green-400 border border-green-800 flex items-center gap-1">
                        <TagIcon className="w-2.5 h-2.5" /> {t.price_cents > 0 ? `${(t.price_cents / 100).toFixed(2)}€` : 'Gratis'} · Publicada
                      </span>
                    )}
                  </p>
                  {t.description && <p className="text-xs text-gray-500 truncate">{t.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEditForm(t)} title="Editar" className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"><EditIcon className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDeleteTemplate(t.id)} title="Eliminar" className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"><TrashIcon className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={editing ? 'Editar Plantilla' : `Nueva Plantilla de ${TYPE_LABELS[templateType].slice(0, -1)}`}>
        <form onSubmit={handleSaveTemplate} className="space-y-4">
          <Input label="Nombre" value={formState.name} onChange={e => setFormState(p => ({ ...p, name: e.target.value }))} required />
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Contenido</label>
            <textarea
              value={formState.content}
              onChange={e => setFormState(p => ({ ...p, content: e.target.value }))}
              rows={6}
              className="block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-gray-800 text-white"
              required
            />
          </div>
          <Input label="Descripción (se ve en el marketplace, no el contenido)" value={formState.description} onChange={e => setFormState(p => ({ ...p, description: e.target.value }))} />
          <Input label="Categoría" value={formState.category} onChange={e => setFormState(p => ({ ...p, category: e.target.value }))} placeholder="Ej: Diseño web, Desarrollo a medida..." />

          <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
            <input
              type="checkbox"
              id="is_public"
              checked={formState.is_public}
              onChange={e => setFormState(p => ({ ...p, is_public: e.target.checked }))}
              className="rounded border-gray-600 bg-gray-800 text-primary-500 focus:ring-primary-500"
            />
            <label htmlFor="is_public" className="text-sm text-gray-300">Publicar en el marketplace para otros freelancers</label>
          </div>

          {formState.is_public && (
            <>
              <Input
                label="Precio (€, deja en blanco para gratis)"
                type="number"
                step="0.01"
                min="0"
                value={formState.price_euros}
                onChange={e => setFormState(p => ({ ...p, price_euros: e.target.value }))}
              />
              {!profile?.stripe_onboarding_complete && formState.price_euros && (
                <p className="text-xs text-yellow-400 flex items-center gap-1">
                  <ShieldCheckIcon className="w-3.5 h-3.5" /> Para cobrar por tus plantillas necesitas verificar tu cuenta en Ajustes → Cobros a clientes.
                </p>
              )}
            </>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button type="submit">{editing ? 'Guardar Cambios' : 'Crear Plantilla'}</Button>
          </div>
        </form>
      </Modal>

      {purchasing && (
        <Suspense fallback={null}>
          <StripePaymentModal
            isOpen={!!purchasing}
            onClose={() => setPurchasing(null)}
            amountCents={purchasing.price_cents}
            description={`Plantilla: ${purchasing.name}`}
            itemKey="templatePurchase"
            metadata={{ template_type: templateType, template_id: purchasing.id }}
            onPaymentSuccess={handlePurchaseSuccess}
          />
        </Suspense>
      )}
    </div>
  );
};

export default TemplateMarketplacePage;
