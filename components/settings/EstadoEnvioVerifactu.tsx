// Ajustes → Cumplimiento fiscal (fase 4 de Verifactu, 07/10/2026): solo hay
// modalidad VERI*FACTU y el envío a la Agencia Tributaria lo enciende
// DevFreelancer cuenta por cuenta (profiles.verifactu_entorno). Aquí solo se
// cuenta en qué punto está la cuenta; no se puede cambiar desde la web.
import React from 'react';
import { Link } from 'react-router-dom';
import type { Profile } from '@/types';

type Entorno = NonNullable<Profile['verifactu_entorno']>;

export const textoEstadoEnvio = (entorno: Entorno, activo: boolean): { titulo: string; detalle: string } => {
  if (!activo) {
    return {
      titulo: 'Cumplimiento fiscal desactivado',
      detalle: 'Tus facturas no generan registro fiscal. Actívalo cuando te corresponda (autónomos: obligatorio desde el 1 de julio de 2027).',
    };
  }
  if (entorno === 'produccion') {
    return {
      titulo: 'Envío a la Agencia Tributaria: activado',
      detalle: 'Cada factura se registra y se envía a la Agencia Tributaria con tu certificado digital. El PDF lleva el código QR y la mención VERI*FACTU.',
    };
  }
  if (entorno === 'pruebas') {
    return {
      titulo: 'Envío a la Agencia Tributaria: entorno de PRUEBAS',
      detalle: 'Tus registros se envían al entorno de pruebas de la Agencia Tributaria: no tienen validez fiscal. Esta cuenta se usa para comprobar el sistema.',
    };
  }
  return {
    titulo: 'Envío a la Agencia Tributaria: todavía no',
    detalle: 'Tus facturas ya generan su registro con huella encadenada y quedan bloqueadas, pero aún no se envían a Hacienda ni llevan el QR. '
      + 'El envío se activará cuando DevFreelancer publique su declaración responsable; te avisaremos. Para entonces necesitarás tu certificado digital.',
  };
};

const EstadoEnvioVerifactu: React.FC<{ entorno: Entorno; activo: boolean }> = ({ entorno, activo }) => {
  const { titulo, detalle } = textoEstadoEnvio(entorno, activo);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-300">Modalidad: <span className="text-white">VERI*FACTU</span></p>
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-3" role="status">
        <p className="font-medium text-white">{titulo}</p>
        <p className="mt-1 text-xs text-gray-400">{detalle}</p>
      </div>
      <p className="text-xs text-gray-500">
        Cómo vamos con Verifactu, en <Link to="/garantias#verifactu" className="text-primary-400 hover:underline">Garantías</Link>.
      </p>
    </div>
  );
};

export default EstadoEnvioVerifactu;
