import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export const IndicadorOffline: React.FC = () => {
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  useEffect(() => {
    const tratarOnline = () => setOffline(false);
    const tratarOffline = () => setOffline(true);

    window.addEventListener('online', tratarOnline);
    window.addEventListener('offline', tratarOffline);

    return () => {
      window.removeEventListener('online', tratarOnline);
      window.removeEventListener('offline', tratarOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      id="indicador-offline"
      className="bg-[var(--c-atencao)] text-[var(--c-sobre-acento)] px-4 py-1.5 text-xs font-medium flex items-center justify-center gap-2 flex-shrink-0"
    >
      <WifiOff className="w-3.5 h-3.5" />
      <span>Modo offline — mensagens salvas localmente</span>
    </div>
  );
};
