// pages/FiscalCompliancePage.tsx
// Registro fiscal Veri*Factu completo: cada registro de alta/anulación
// generado, con su huella encadenada. Solo lectura — nada aquí se puede
// editar ni borrar, ni desde la UI ni desde la base de datos (RLS).
import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import { useToast } from '@/hooks/useToast';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { ShieldCheckIcon, RefreshCwIcon, DownloadIcon } from '@/components/icons/Icon';
import { formatCurrency } from '@/lib/utils';

const FiscalCompliancePage: React.FC = () => {
  const { fiscalRecords, profile, verifyFiscalChain } = useAppStore();
  const { addToast } = useToast();
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; brokenAt?: string } | null>(null);

  const sortedRecords = useMemo(
    () => [...fiscalRecords].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [fiscalRecords]
  );

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    const result = await verifyFiscalChain();
    setVerifyResult(result);
    setVerifying(false);
    if (result.valid) addToast('Cadena verificada: íntegra.', 'success');
    else addToast('Se ha detectado una inconsistencia en la cadena.', 'error');
  };

  // Exporta el registro completo tal cual — cumple con el requisito de
  // poder poner los registros a disposición de la Administración si se
  // solicitan (se deben conservar 4 años).
  const handleExport = () => {
    const payload = {
      exportado_en: new Date().toISOString(),
      nif_emisor: profile?.tax_id,
      nombre_emisor: profile?.business_name || profile?.full_name,
      total_registros: sortedRecords.length,
      registros: sortedRecords,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `registro-fiscal-${profile?.tax_id || 'export'}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    addToast('Registro fiscal exportado.', 'success');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheckIcon className="w-6 h-6" /> Registro Fiscal
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Cada factura emitida con cumplimiento Veri*Factu activo, con su huella encadenada. Registro de solo lectura.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleVerify} disabled={verifying || sortedRecords.length === 0}>
            {verifying ? <RefreshCwIcon className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheckIcon className="w-4 h-4 mr-2" />}
            Verificar cadena
          </Button>
          <Button variant="secondary" onClick={handleExport} disabled={sortedRecords.length === 0}>
            <DownloadIcon className="w-4 h-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {verifyResult && (
        <div className={`p-4 rounded-lg text-sm ${verifyResult.valid ? 'bg-green-900/20 border border-green-800 text-green-300' : 'bg-red-900/20 border border-red-800 text-red-300'}`}>
          {verifyResult.valid
            ? '✅ La cadena de huellas es íntegra — no se ha detectado ninguna alteración desde el primer registro.'
            : `⚠️ Se ha detectado una inconsistencia a partir de la factura ${verifyResult.brokenAt}. Revísalo con tu gestoría antes de presentar nada.`}
        </div>
      )}

      {sortedRecords.length === 0 ? (
        <EmptyState
          icon={ShieldCheckIcon}
          title="Todavía no hay registros fiscales"
          message="Activa el cumplimiento Veri*Factu en Ajustes → Cumplimiento Fiscal, y cada factura nueva generará aquí su registro."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-800">
                  <tr>
                    <th className="p-3">Factura</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Fecha</th>
                    <th className="p-3 text-right">Importe</th>
                    <th className="p-3">Modalidad</th>
                    <th className="p-3">Estado envío</th>
                    <th className="p-3">Huella (SHA-256)</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRecords.map(r => (
                    <tr key={r.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="p-3 font-mono text-white">{r.numero_factura}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${r.record_type === 'alta' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {r.record_type === 'alta' ? 'Alta' : 'Anulación'}
                        </span>
                      </td>
                      <td className="p-3 text-gray-400">{r.fecha_expedicion}</td>
                      <td className="p-3 text-right text-white">{formatCurrency(r.importe_total_cents)}</td>
                      <td className="p-3 text-gray-400 capitalize">{r.modalidad.replace('_', ' ')}</td>
                      <td className="p-3 text-gray-400 capitalize">{r.estado_envio.replace(/_/g, ' ')}</td>
                      <td className="p-3 font-mono text-xs text-gray-500 max-w-[160px] truncate" title={r.hash}>{r.hash}</td>
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

export default FiscalCompliancePage;