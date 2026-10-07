// Declaración responsable del sistema informático de facturación (fase 4 de
// Verifactu, 07/10/2026). Art. 15.3 de la Orden HAC/1177/2024: legible,
// individualizada, dentro del propio sistema y accesible gratis a usuarios y
// clientes. Se imprime o se guarda en PDF desde el navegador.
//
// Mientras no esté firmada (lib/verifactu/declaracionResponsable.ts) NO se
// publica: el público ve que llegará; la cuenta de administración ve el
// borrador, marcado como tal, para revisarlo.
import React from 'react';
import { Link } from 'react-router-dom';
import PaginaLegal, { Dato, Lista, Seccion } from '@/components/legal/PaginaLegal';
import { useAppStore } from '@/hooks/useAppStore';
import { DECLARACION_RESPONSABLE as DR, PENDIENTE_ANTES_DE_FIRMAR, textoCumplimiento } from '@/lib/verifactu/declaracionResponsable';

const Fila: React.FC<{ letra: string; titulo: string; children: React.ReactNode }> = ({ letra, titulo, children }) => (
  <div className="grid gap-1 sm:grid-cols-[14rem_1fr] sm:gap-4 border-b border-gray-800 py-3">
    <dt className="font-semibold text-gray-200">
      <span className="text-gray-500 mr-1">{letra})</span>
      {titulo}
    </dt>
    <dd>{children}</dd>
  </div>
);

export const ContenidoDeclaracion: React.FC = () => (
  <>
    <h2 className="text-xl font-bold text-white">DECLARACIÓN RESPONSABLE DEL SISTEMA INFORMÁTICO DE FACTURACIÓN</h2>
    <dl>
      <Fila letra="a" titulo="Nombre del sistema">{DR.nombreSistema}</Fila>
      <Fila letra="b" titulo="Código identificador">{DR.codigoSistema}</Fila>
      <Fila letra="c" titulo="Versión">{DR.version}</Fila>
      <Fila letra="d" titulo="Componentes y funcionalidades">
        <Lista>{DR.componentes.map((c) => <li key={c}>{c}</li>)}</Lista>
        <p className="mt-2 text-gray-400">Funcionalidades principales:</p>
        <Lista>{DR.funcionalidades.map((f) => <li key={f}>{f}</li>)}</Lista>
      </Fila>
      <Fila letra="e" titulo="Funciona exclusivamente como VERI*FACTU">{DR.soloVerifactu ? 'Sí' : 'No'}</Fila>
      <Fila letra="f" titulo="Permite varios obligados tributarios">
        {DR.multiplesObligados ? 'Sí: cada cuenta factura por su propio obligado tributario.' : 'No'}
      </Fila>
      <Fila letra="g" titulo="Tipos de firma">{DR.tiposFirma}</Fila>
      <Fila letra="h" titulo="Productor"><Dato v={DR.productor} /></Fila>
      <Fila letra="i" titulo="NIF del productor"><Dato v={DR.nifProductor} /></Fila>
      <Fila letra="j" titulo="Dirección postal"><Dato v={DR.direccionProductor} /></Fila>
      <Fila letra="k" titulo="Declaración de cumplimiento">{textoCumplimiento()}</Fila>
      <Fila letra="l" titulo="Fecha y lugar">
        {DR.fechaFirma ? `${DR.lugarFirma}, ${DR.fechaFirma}` : <Dato v="[pendiente de firma]" />}
      </Fila>
    </dl>

    <Seccion titulo="Anexo">
      <Lista>
        <li>Contacto: <a href={`mailto:${DR.contacto}`}>{DR.contacto}</a></li>
        <li>Web del producto: <a href={DR.web}>{DR.web}</a></li>
        <li>Esta declaración: <a href={DR.paginaDeclaracion}>{DR.paginaDeclaracion}</a></li>
      </Lista>
      <p>Cómo se cumplen las especificaciones técnicas:</p>
      <Lista>{DR.implementacion.map((t) => <li key={t}>{t}</li>)}</Lista>
    </Seccion>
  </>
);

const DeclaracionResponsablePage: React.FC = () => {
  const esAdmin = useAppStore((s) => (s.profile?.role || '').toLowerCase() === 'admin');

  if (!DR.firmada && !esAdmin) {
    return (
      <PaginaLegal titulo="Declaración responsable" fecha="7 de octubre de 2026" indexable>
        <p>
          La declaración responsable de DevFreelancer como sistema de facturación VERI*FACTU se publicará aquí cuando esté
          firmada, antes de activar el envío a la Agencia Tributaria real. Cómo vamos, en <Link to="/garantias#verifactu">Garantías</Link>.
        </p>
      </PaginaLegal>
    );
  }

  return (
    <PaginaLegal titulo="Declaración responsable" fecha={DR.fechaFirma ?? '7 de octubre de 2026'} indexable={DR.firmada}>
      {!DR.firmada && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-yellow-200" role="status">
          <p className="font-semibold">BORRADOR SIN FIRMAR — no tiene validez ni se muestra al público. Solo lo ve la cuenta de administración.</p>
          {PENDIENTE_ANTES_DE_FIRMAR.length > 0 && (
            <>
              <p className="mt-2">Antes de firmar:</p>
              <Lista>{PENDIENTE_ANTES_DE_FIRMAR.map((p) => <li key={p}>{p}</li>)}</Lista>
            </>
          )}
        </div>
      )}
      <ContenidoDeclaracion />
      <p className="print:hidden">
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-500">
          Imprimir o guardar en PDF
        </button>
      </p>
    </PaginaLegal>
  );
};

export default DeclaracionResponsablePage;
