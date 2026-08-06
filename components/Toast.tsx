'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: {
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
  };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'success', duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toastHelpers = {
    success: (message: string, duration?: number) => addToast(message, 'success', duration),
    error: (message: string, duration?: number) => addToast(message, 'error', duration),
    info: (message: string, duration?: number) => addToast(message, 'info', duration),
  };

  return (
    <ToastContext.Provider value={{ toast: toastHelpers }}>
      {children}

      {/* Floating Bottom-Right Toast Stack Container */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map(t => (
          <div
            key={t.id}
            className="pointer-events-auto p-4 rounded-2xl shadow-2xl backdrop-blur-xl border text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200"
            style={{
              backgroundColor: t.type === 'error' ? 'rgba(15, 23, 42, 0.95)' : 'rgba(15, 23, 42, 0.95)',
              borderColor: t.type === 'error' ? 'rgba(244, 63, 94, 0.4)' : t.type === 'info' ? 'rgba(59, 130, 246, 0.4)' : 'rgba(16, 185, 129, 0.4)',
            }}
          >
            <div className="flex items-center gap-3">
              {t.type === 'error' && <XCircle className="w-5 h-5 text-rose-400 shrink-0" />}
              {t.type === 'info' && <Info className="w-5 h-5 text-blue-400 shrink-0" />}
              {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
              <span className={t.type === 'error' ? 'text-rose-200' : t.type === 'info' ? 'text-blue-200' : 'text-emerald-400'}>
                {t.message}
              </span>
            </div>

            <button
              onClick={() => removeToast(t.id)}
              className="text-slate-400 hover:text-white p-1 rounded-lg shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context.toast;
}
