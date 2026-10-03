import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RUTA_PAGO_FUNDADORES, hayIntencionFundadores } from '@/lib/intencionFundadores';

/**
 * Va dentro de la app con sesión (MainLayout). Si el usuario venía de la
 * oferta de fundadores (/pricing o un enlace ?oferta=fundadores), al entrar
 * le lleva a /billing?oferta=fundadores, que abre el pago. La intención la
 * borra /billing al usarla, así que esto ocurre una sola vez.
 */
const AlEntrarConOferta = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname !== '/billing' && hayIntencionFundadores()) {
      navigate(RUTA_PAGO_FUNDADORES, { replace: true });
    }
  }, [pathname, navigate]);

  return null;
};

export default AlEntrarConOferta;
