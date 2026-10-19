import React from 'react';
import { Download, Globe, Moon, Sun, Crown, Share2, Coins, User } from 'lucide-react';
import { Language, ThemeMode, UserSession } from '../types';
import { getTranslation } from '../i18n/translations';
import { isCapacitorOrNative } from '../services/platformDetector';
import { QuotaInfo } from '../services/quotaService';

interface HeaderProps {
  language: Language;
  theme: ThemeMode;
  isOnline: boolean;
  userSession: UserSession;
  quotaInfo: QuotaInfo;
  coinsBalance: number;
  isInstallable: boolean;
  onToggleTheme: () => void;
  onToggleLanguage: () => void;
  onTriggerInstall: () => void;
  onOpenInstallGuide?: () => void;
  onOpenAuth: () => void;
  onOpenUpgrade: () => void;
  onOpenShare?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  language,
  theme,
  isOnline,
  userSession,
  quotaInfo,
  coinsBalance,
  isInstallable,
  onToggleTheme,
  onToggleLanguage,
  onTriggerInstall,
  onOpenInstallGuide,
  onOpenAuth,
  onOpenUpgrade,
  onOpenShare
}) => {
  const t = getTranslation(language);

  // Detect if running inside Android APK (Capacitor) or installed standalone PWA
  const isInstalledOrNative = React.useMemo(() => {
    if (isCapacitorOrNative()) return true;
    if (typeof window !== 'undefined') {
      const isStandalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (window.navigator as any)?.standalone === true;
      if (isStandalone) return true;
    }
    return false;
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full max-w-[100vw] overflow-x-clip backdrop-blur-xl bg-white/90 dark:bg-slate-900/90 border-b border-slate-200/80 dark:border-slate-800/80 shadow-xs transition-colors">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-15 sm:h-16 flex items-center justify-between gap-2">
        {/* Left / Start: 3D Tactile Logo + App Name */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 border-t border-white/30 shadow-[0_4px_0_rgb(67,56,202),0_8px_16px_rgba(99,102,241,0.35)] text-white font-bold shrink-0">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" />
              <path d="m8 11 4 4 4-4" />
              <path d="M4 17c0 2 2 3 4 3h8c2 0 4-1 4-3" />
            </svg>
            <span
              className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${
                isOnline ? 'dot-3d-green' : 'dot-3d-red'
              }`}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-black text-sm sm:text-xl tracking-tight text-slate-900 dark:text-white drop-shadow-sm text-3d truncate">
                {t.appName}
              </span>
              {quotaInfo.isPro ? (
                <span className="hidden xs:inline-block text-[10px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider bg-amber-400 text-slate-950 shadow-xs shrink-0">
                  VIP PRO
                </span>
              ) : (
                <span className="hidden xs:inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                  {language === 'fa' ? `رایگان (${quotaInfo.remainingToday}/${quotaInfo.maxDaily})` : `Free (${quotaInfo.remainingToday}/${quotaInfo.maxDaily})`}
                </span>
              )}
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate font-bold">
              {t.appSubtitle}
            </p>
          </div>
        </div>

        {/* Right / End: Minimal Compact Controls (Live Coin Balance + Language + Profile/VIP) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Install App Button: COMPLETELY HIDDEN inside APK / Standalone PWA */}
          {!isInstalledOrNative && (
            <button
              onClick={isInstallable ? onTriggerInstall : onOpenInstallGuide}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold text-white bg-gradient-to-r from-indigo-600 to-violet-600 border-t border-white/25 shadow-[0_4px_0_rgb(76,29,149),0_8px_16px_rgba(124,58,237,0.3)] active:translate-y-[3px] active:shadow-[0_1px_0_rgb(76,29,149)] transition-all duration-150 shrink-0"
              title={t.installApp}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t.installApp}</span>
            </button>
          )}

          {/* Live Jet Coins Balance Badge (Clicks to open Coin Redemption & Pro Upgrade Modal) */}
          <button
            type="button"
            onClick={onOpenUpgrade}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 dark:bg-amber-500/15 border border-amber-500/35 text-amber-700 dark:text-amber-300 text-xs font-black btn-3d-secondary active:translate-y-[2px] transition-all duration-150 shrink-0"
            title={language === 'fa' ? 'موجودی سکه و ارتقا به اشتراک ویژه' : 'Jet Coins Balance & Upgrade'}
          >
            <Coins className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>{coinsBalance}</span>
          </button>

          {/* 3D Language Switcher Button */}
          <button
            type="button"
            onClick={onToggleLanguage}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-extrabold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 btn-3d-secondary active:translate-y-[3px] transition-all duration-150 shrink-0"
            title="تغییر زبان / Switch Language"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>{language === 'fa' ? 'EN' : 'فا'}</span>
          </button>

          {/* Theme Toggle (Desktop & Tablet) */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="hidden sm:flex p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 btn-3d-secondary active:translate-y-[3px] transition-all duration-150 shrink-0"
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>

          {/* Share Button (Desktop & Tablet) */}
          {onOpenShare && (
            <button
              type="button"
              onClick={onOpenShare}
              className="hidden sm:flex p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 btn-3d-secondary active:translate-y-[3px] transition-all duration-150 shrink-0"
              title={language === 'fa' ? 'اشتراک‌گذاری برنامه' : 'Share App'}
            >
              <Share2 className="w-4 h-4 text-indigo-500" />
            </button>
          )}

          {/* Compact 3D Profile / VIP Status Button */}
          <button
            type="button"
            onClick={quotaInfo.isPro ? onOpenAuth : onOpenUpgrade}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-black text-xs transition-all duration-150 shrink-0 ${
              quotaInfo.isPro
                ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 text-slate-950 border-t border-white/40 shadow-[0_4px_0_rgb(180,83,9),0_8px_15px_rgba(245,158,11,0.3)] active:translate-y-[3px]'
                : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-t border-white/25 shadow-[0_4px_0_rgb(76,29,149),0_8px_15px_rgba(124,58,237,0.25)] active:translate-y-[3px]'
            }`}
            title={quotaInfo.isPro ? (language === 'fa' ? 'اشتراک VIP فعال است' : 'VIP Pro Active') : (language === 'fa' ? 'ارتقا به نسخه PRO' : 'Upgrade to PRO')}
          >
            {quotaInfo.isPro ? (
              <>
                <Crown className="w-3.5 h-3.5 fill-slate-950 shrink-0" />
                <span className="text-[11px] font-black">VIP</span>
              </>
            ) : (
              <>
                <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="text-[11px] font-black">{language === 'fa' ? 'ارتقا' : 'PRO'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
