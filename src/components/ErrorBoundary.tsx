import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
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
        <div className="min-h-screen bg-black text-white p-6 flex flex-col items-center justify-center">
          <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-2xl max-w-md w-full">
            <h2 className="text-xl font-bold text-red-400 mb-4">Что-то пошло не так</h2>
            <p className="text-gray-300 mb-4">Произошла ошибка при отрисовке приложения.</p>
            <pre className="bg-black/50 p-4 rounded-lg text-xs text-red-300 overflow-auto max-h-64">
              {this.state.error?.message}
            </pre>
            <button 
              onClick={() => window.location.reload()}
              className="mt-6 w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors"
            >
              Перезагрузить
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
