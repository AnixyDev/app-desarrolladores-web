// Confirmaciones con el estilo de la app (06/10/2026).
//
// Sustituye a window.confirm(), que abría la ventana gris del navegador encima
// de una app oscura (y en el móvil, con el nombre del dominio de título).
//
// Uso, igual de corto que antes:
//
//   if (!(await confirmar({ titulo: '¿Borrar el presupuesto?', mensaje: '…', peligro: true }))) return;
//
// El diálogo se monta una sola vez en App.tsx (<ConfirmDialog />). Si se pide
// una confirmación con otra abierta, la anterior se da por cancelada: nunca se
// queda una promesa colgada.
import { create } from 'zustand';
import type { ReactNode } from 'react';

export interface OpcionesConfirmar {
  titulo: string;
  mensaje?: ReactNode;
  /** Texto del botón que confirma. Por defecto «Borrar» si es peligroso, «Aceptar» si no. */
  textoConfirmar?: string;
  textoCancelar?: string;
  /** Acción destructiva: botón rojo y el foco empieza en «Cancelar». */
  peligro?: boolean;
}

interface EstadoConfirmar {
  abierto: OpcionesConfirmar | null;
  resolver: ((si: boolean) => void) | null;
  pedir: (opciones: OpcionesConfirmar) => Promise<boolean>;
  responder: (si: boolean) => void;
}

export const useConfirmar = create<EstadoConfirmar>((set, get) => ({
  abierto: null,
  resolver: null,
  pedir: (opciones) =>
    new Promise<boolean>((resolve) => {
      get().resolver?.(false);
      set({ abierto: opciones, resolver: resolve });
    }),
  responder: (si) => {
    get().resolver?.(si);
    set({ abierto: null, resolver: null });
  },
}));

/** Pide confirmación y devuelve true si el usuario acepta. */
export const confirmar = (opciones: OpcionesConfirmar): Promise<boolean> =>
  useConfirmar.getState().pedir(opciones);
