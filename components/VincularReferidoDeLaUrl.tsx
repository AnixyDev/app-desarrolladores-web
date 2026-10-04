import { useEffect, useState } from 'react';
import { codigoDeLaUrl, vincularReferido } from '@/lib/afiliados';

/**
 * Va dentro de la app con sesión (MainLayout), antes de AlEntrarConOferta.
 * Tras un alta con Google desde un enlace de afiliado, la app vuelve a
 * /?ref=CODIGO: aquí se vincula el código y se quita de la URL.
 *
 * La URL se lee al pintar (no en un efecto) porque AlEntrarConOferta puede
 * llevar a otra página en su efecto y el ?ref= se perdería.
 */
const VincularReferidoDeLaUrl = () => {
  const [codigo] = useState(() => codigoDeLaUrl(window.location.search));

  useEffect(() => {
    if (!codigo) return;
    let vivo = true;
    vincularReferido(codigo)
      .then((ok) => {
        if (!ok || !vivo) return;
        const url = new URL(window.location.href);
        if (url.searchParams.has('ref')) {
          url.searchParams.delete('ref');
          window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
        }
      })
      .catch(() => { /* nunca debe romper el acceso */ });
    return () => { vivo = false; };
  }, [codigo]);

  return null;
};

export default VincularReferidoDeLaUrl;
