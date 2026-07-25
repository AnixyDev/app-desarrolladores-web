// pages/BankReconciliationPage.tsx
// Conciliación bancaria: conecta tu banco (GoCardless / PSD2), sincroniza
// movimientos, y confirma las sugerencias de cotejo contra tus facturas
// pendientes. Nunca marca nada como cobrado sin confirmación explícita.
import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabaseClient';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { RefreshCwIcon, CheckCircleIcon, XCircleIcon } from '@/components/icons/Icon';
import { Landmark } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { BankAccount, BankTransaction } from '@/types';

const callFn = async (fnName: string, action: string, payload?: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke(fnName, { body: { action, payload } });
  if (error) {
    let detail = error.message;
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) detail = body.error;
    } catch { /* noop */ }
    throw new Error(detail);
  }
  return data;
};

const BankReconciliationPage: React.FC = () => {
  const { clients, invoices } = useAppStore();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [enablebankingConfigured, setEnablebankingConfigured] = useState(false);
  const [appId, setAppId] = useState('');
  const [privateKeyFile, setPrivateKeyFile] = useState<File | null>(null);
  const [savingSecrets, setSavingSecrets] = useState(false);

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [institutions, setInstitutions] = useState<{ name: string; country: string }[]>([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncErrors, setSyncErrors] = useState<string[]>([]);

  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || 'Cliente desconocido';
  const getInvoiceLabel = (invoiceId: string | null) => {
    const inv = invoices.find(i => i.id === invoiceId);
    return inv ? `${inv.invoice_number} · ${getClientName(inv.client_id)}` : '—';
  };

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const status = await callFn('manage-secrets', 'status');
      setEnablebankingConfigured(!!status.enablebanking_configured);

      if (status.enablebanking_configured) {
        const { data: accs } = await supabase.from('bank_accounts').select('*').order('created_at', { ascending: false });
        setAccounts((accs || []) as BankAccount[]);

        const { data: txs } = await supabase.from('bank_transactions').select('*').order('booking_date', { ascending: false }).limit(200);
        setTransactions((txs || []) as BankTransaction[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Al volver del banco tras autorizar, Enable Banking redirige aquí con
  // ?code=...&state=... — finaliza la conexión automáticamente.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (code) {
      (async () => {
        try {
          const result = await callFn('bank-connect', 'finalize', { code, state });
          addToast(`Banco conectado — ${result.accounts_linked} cuenta(s) vinculada(s).`, 'success');
          window.history.replaceState({}, '', window.location.pathname);
          fetchStatus();
        } catch (err) {
          addToast((err as Error).message || 'No se pudo completar la conexión con el banco.', 'error');
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readFileAsText = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });

  const handleSaveSecrets = async () => {
    if (!appId.trim() || !privateKeyFile) {
      addToast('Introduce el ID de aplicación y selecciona el archivo .pem de Enable Banking.', 'error');
      return;
    }
    setSavingSecrets(true);
    try {
      const privateKeyPem = await readFileAsText(privateKeyFile);
      await callFn('manage-secrets', 'save_enablebanking_credentials', { app_id: appId.trim(), private_key_pem: privateKeyPem });
      setAppId('');
      setPrivateKeyFile(null);
      addToast('Credenciales guardadas de forma cifrada.', 'success');
      fetchStatus();
    } catch (err) {
      addToast((err as Error).message || 'No se pudieron guardar las credenciales.', 'error');
    } finally {
      setSavingSecrets(false);
    }
  };

  const handleLoadInstitutions = async () => {
    setLoadingInstitutions(true);
    try {
      const result = await callFn('bank-connect', 'list_institutions', { country: 'ES' });
      setInstitutions(result.institutions || []);
    } catch (err) {
      addToast((err as Error).message || 'No se pudo cargar la lista de bancos.', 'error');
    } finally {
      setLoadingInstitutions(false);
    }
  };

  const handleConnectBank = async (institutionName: string, country: string) => {
    setConnecting(true);
    try {
      const redirectUrl = `${window.location.origin}/bank-reconciliation`;
      const result = await callFn('bank-connect', 'create_requisition', {
        institution_name: institutionName,
        country,
        redirect_url: redirectUrl,
      });
      window.location.href = result.link;
    } catch (err) {
      addToast((err as Error).message || 'No se pudo iniciar la conexión.', 'error');
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncErrors([]);
    try {
      const result = await callFn('bank-sync', 'sync');
      addToast(`Sincronizado: ${result.new_transactions} movimiento(s) nuevo(s), ${result.new_suggestions} sugerencia(s) de cotejo.`, 'success');
      if (result.errors?.length) setSyncErrors(result.errors);
      fetchStatus();
    } catch (err) {
      addToast((err as Error).message || 'No se pudo sincronizar.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleConfirmMatch = async (transactionId: string, invoiceId: string) => {
    try {
      await callFn('bank-sync', 'confirm_match', { transaction_id: transactionId, invoice_id: invoiceId });
      addToast('Cobro registrado correctamente.', 'success');
      fetchStatus();
    } catch (err) {
      addToast((err as Error).message || 'No se pudo confirmar el cotejo.', 'error');
    }
  };

  const handleIgnoreMatch = async (transactionId: string) => {
    try {
      await callFn('bank-sync', 'ignore_match', { transaction_id: transactionId });
      fetchStatus();
    } catch (err) {
      addToast((err as Error).message || 'No se pudo descartar la sugerencia.', 'error');
    }
  };

  if (loading) {
    return <div className="text-center text-gray-400 py-12">Cargando...</div>;
  }

  if (!enablebankingConfigured) {
    return (
      <div className="space-y-6 max-w-xl">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Landmark className="w-6 h-6" /> Conciliación Bancaria
        </h1>
        <Card>
          <CardHeader>
            <p className="font-semibold text-white">Conecta tus propias credenciales de Enable Banking</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-400">
              Crea una cuenta gratuita en{' '}
              <a href="https://enablebanking.com/sign-in/" target="_blank" rel="noreferrer" className="text-primary-400 underline">
                enablebanking.com
              </a>. Una vez dentro, ve a "API applications", registra una aplicación (con cualquier
              nombre, y esta misma URL como redirección permitida:{' '}
              <code className="text-xs bg-gray-800 px-1 py-0.5 rounded">{window.location.origin}/bank-reconciliation</code>).
              Al registrarla, se descargará automáticamente un archivo <code className="text-xs bg-gray-800 px-1 py-0.5 rounded">.pem</code> — es tu clave privada, y el nombre del archivo (sin la extensión) es tu ID de aplicación.
            </p>
            <input
              type="text"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="ID de aplicación (el nombre del archivo .pem)"
              className="w-full p-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-primary-500 outline-none"
            />
            <div>
              <label className="block text-sm text-gray-400 mb-1">Archivo de clave privada (.pem)</label>
              <input
                type="file"
                accept=".pem"
                onChange={(e) => setPrivateKeyFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-800 file:text-white hover:file:bg-gray-700"
              />
            </div>
            <Button onClick={handleSaveSecrets} disabled={savingSecrets} className="w-full">
              {savingSecrets ? 'Guardando...' : 'Guardar credenciales'}
            </Button>
            <p className="text-xs text-gray-500">Se guardan cifradas — nunca en texto plano.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Landmark className="w-6 h-6" /> Conciliación Bancaria
        </h1>
        <Button onClick={handleSync} disabled={syncing || accounts.length === 0}>
          {syncing ? <RefreshCwIcon className="w-4 h-4 animate-spin mr-2" /> : <RefreshCwIcon className="w-4 h-4 mr-2" />}
          {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
        </Button>
      </div>

      {syncErrors.length > 0 && (
        <div className="p-3 bg-yellow-900/20 border border-yellow-800 rounded-lg text-sm text-yellow-300">
          {syncErrors.map((e, i) => <p key={i}>⚠️ {e}</p>)}
        </div>
      )}

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="space-y-4 py-6">
            <p className="text-sm text-gray-400">Todavía no has conectado ninguna cuenta bancaria.</p>
            {institutions.length === 0 ? (
              <Button onClick={handleLoadInstitutions} disabled={loadingInstitutions}>
                {loadingInstitutions ? 'Cargando bancos...' : 'Conectar un banco'}
              </Button>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {institutions.map(inst => (
                  <button
                    key={inst.name}
                    onClick={() => handleConnectBank(inst.name, inst.country)}
                    disabled={connecting}
                    className="w-full text-left p-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-white transition-colors"
                  >
                    {inst.name}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><p className="font-semibold text-white">Cuentas conectadas</p></CardHeader>
          <CardContent className="space-y-2">
            {accounts.map(acc => (
              <div key={acc.id} className="flex justify-between items-center bg-gray-800 p-3 rounded-lg text-sm">
                <span className="text-white">{acc.account_name} {acc.iban && `(${acc.iban})`}</span>
                <span className="text-gray-500">{acc.last_synced_at ? `Última sync: ${new Date(acc.last_synced_at).toLocaleString('es-ES')}` : 'Sin sincronizar'}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Sugerencias de cotejo pendientes</h2>
        {transactions.filter(t => t.match_status === 'suggested').length === 0 ? (
          <EmptyState icon={Landmark} title="Sin sugerencias pendientes" message="Cuando sincronices, los ingresos que coincidan con facturas pendientes aparecerán aquí." />
        ) : (
          <div className="space-y-3">
            {transactions.filter(t => t.match_status === 'suggested').map(tx => (
              <Card key={tx.id}>
                <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
                  <div>
                    <p className="text-white font-semibold">{formatCurrency(tx.amount_cents)} — {tx.counterparty_name || 'Desconocido'}</p>
                    <p className="text-sm text-gray-400">{tx.description}</p>
                    <p className="text-sm text-gray-500">{tx.booking_date} · sugerido para: <span className="text-primary-400">{getInvoiceLabel(tx.matched_invoice_id)}</span> ({Math.round((tx.match_confidence || 0) * 100)}% de confianza)</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" onClick={() => tx.matched_invoice_id && handleConfirmMatch(tx.id, tx.matched_invoice_id)}>
                      <CheckCircleIcon className="w-4 h-4 mr-1" /> Confirmar cobro
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleIgnoreMatch(tx.id)}>
                      <XCircleIcon className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Todos los movimientos</h2>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-800">
                  <tr>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">De</th>
                    <th className="p-3 text-right">Importe</th>
                    <th className="p-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(tx => (
                    <tr key={tx.id} className="border-b border-gray-800">
                      <td className="p-3 text-gray-400">{tx.booking_date}</td>
                      <td className="p-3 text-white">{tx.counterparty_name || '—'}</td>
                      <td className="p-3 text-right text-white">{formatCurrency(tx.amount_cents)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          tx.match_status === 'confirmed' ? 'bg-green-500/20 text-green-400' :
                          tx.match_status === 'suggested' ? 'bg-yellow-500/20 text-yellow-400' :
                          tx.match_status === 'ignored' ? 'bg-gray-500/20 text-gray-400' :
                          'bg-gray-700 text-gray-400'
                        }`}>
                          {tx.match_status === 'confirmed' ? 'Cobrado' : tx.match_status === 'suggested' ? 'Sugerido' : tx.match_status === 'ignored' ? 'Ignorado' : 'Sin cotejar'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BankReconciliationPage;