import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white p-6 text-center">
          <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-3xl max-w-md">
            <h2 className="text-2xl font-bold mb-4">¡Ups! Algo salió mal</h2>
            <p className="text-gray-400 mb-6">
              Ha ocurrido un error inesperado en la aplicación. No te preocupes, tus datos están seguros.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => window.location.reload()}
                className="bg-primary-500 hover:bg-primary-600 text-white font-bold py-3 px-6 rounded-xl transition-all"
              >
                Recargar aplicación
              </button>
              <button
                onClick={() => (window.location.href = '/')}
                className="text-gray-400 hover:text-white text-sm transition-all"
              >
                Ir al inicio
              </button>
            </div>
            {import.meta.env.DEV && (
              <details className="mt-6 text-left bg-black/40 p-4 rounded-xl overflow-auto max-h-40">
                <summary className="text-xs text-red-400 cursor-pointer">Detalles del error (Solo Dev)</summary>
                <pre className="text-[10px] text-gray-500 mt-2 whitespace-pre-wrap">
                  {this.state.error?.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    // ✅ FIX: los children se reciben vía this.props.children, no this.children
    return this.props.children;
  }
}

export default ErrorBoundary;
