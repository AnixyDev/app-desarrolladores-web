import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Aviso cuando el perfil no tiene NIF: sin él no se puede emitir ninguna
 * factura (RD 1619/2012, art. 6.1.d) ni generar su registro fiscal y QR.
 */
const AvisoNifFactura: React.FC<{ nif?: string | null }> = ({ nif }) => {
  if (nif?.trim()) return null;
  return (
    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-100">
      Para emitir facturas necesitas tu NIF: es obligatorio en toda factura y con él cada factura sale con su QR
      tributario.{' '}
      <Link to="/settings" className="underline font-medium">Añádelo en Ajustes</Link>.
    </div>
  );
};

export default AvisoNifFactura;
