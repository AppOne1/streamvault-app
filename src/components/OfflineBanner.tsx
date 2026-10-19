import React from 'react';
import { WifiOff } from 'lucide-react';
import { Language } from '../types';
import { getTranslation } from '../i18n/translations';

interface OfflineBannerProps {
  language: Language;
  isOnline: boolean;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ language, isOnline }) => {
  const t = getTranslation(language);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-40 max-w-sm rounded-xl bg-amber-500 text-white px-4 py-2.5 shadow-xl flex items-center gap-3 animate-bounce-subtle">
      <div className="p-1 rounded-lg bg-black/20 shrink-0">
        <WifiOff className="w-4 h-4 text-white" />
      </div>
      <p className="text-xs font-semibold leading-tight">
        {t.offlineNotice}
      </p>
    </div>
  );
};
