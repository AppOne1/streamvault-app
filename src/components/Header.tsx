import React from 'react';
import { Download, Globe, Moon, Sun, User, Wifi, WifiOff, Share2 } from 'lucide-react';
import { Language, ThemeMode, UserSession } from '../types';
import { getTranslation } from '../i18n/translations';

interface HeaderProps {
  language: Language;
  theme: ThemeMode;
  isOnline: boolean;
  userSession: UserSession;
  isInstallable: boolean;
  onToggleTheme: () => void;
  onToggleLanguage: () => void;
  onTriggerInstall: () => void;
  onOpenInstallGuide?: () => void;
  onOpenAuth: () => void;
  onOpenShare?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  language,
  theme,
  isOnline,
  userSession,
  isInstallable,
  onToggleTheme,
  onToggleLanguage,
  onTriggerInstall,
  onOpenInstallGuide,
  onOpenAuth,
  onOpenShare
}) => {
  const t = getTranslation(language);

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-white/85 dark:bg-slate-900/85 border-b border-slate-200/80 dark:border-slate-800/80 shadow-xs transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 shadow-lg shadow-indigo-600/30 text-white font-bold card-3d">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" />
              <path d="m8 11 4 4 4-4" />
              <path d="M4 17c0 2 2 3 4 3h8c2 0 4-1 4-3" />
            </svg>
            {/* 3D Live Spherical Dot indicator */}
            <span className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 ${isOnline ? 'dot-3d-green' : 'dot-3d-red'}`} />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-lg sm:text-xl tracking-tight text-slate-900 dark:text-white text-3d">
                {t.appName}
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider bg-amber-400 text-slate-950 shadow-xs">
                PRO 4K
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block font-medium">
              {t.appSubtitle}
            </p>
          </div>
        </div>

        {/* Center / Right controls */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Online status badge */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 card-3d">
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'dot-3d-green' : 'dot-3d-red'}`} />
            <span>{isOnline ? 'Online' : 'Offline'}</span>
          </div>

          {/* PWA Install Button */}
          {isInstallable ? (
            <button
              onClick={onTriggerInstall}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 btn-3d-primary active:scale-95 transition-all shadow-sm"
              title={t.installApp}
            >
              <Download className="w-3.5 h-3.5" />
              <span className="text-[11px] sm:text-xs font-black">{t.installApp}</span>
            </button>
          ) : (
            <button
              onClick={onOpenInstallGuide}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-indigo-200/70 dark:border-indigo-800/70 btn-3d-secondary active:scale-95 transition-all"
              title={language === 'fa' ? 'راهنمای نصب برنامه روی گوشی و حل خطا' : 'Install Guide'}
            >
              <Download className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-[11px] sm:text-xs font-black">{language === 'fa' ? 'نصب روی گوشی' : 'Install App'}</span>
            </button>
          )}

          {/* Language Switcher */}
          <button
            onClick={onToggleLanguage}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 btn-3d-secondary transition-colors"
            title="تغییر زبان / Switch Language"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-500" />
            <span>{language === 'fa' ? 'English' : 'فارسی'}</span>
          </button>

          {/* Dark / Light Mode Toggle */}
          <button
            onClick={onToggleTheme}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 btn-3d-secondary transition-colors"
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>

          {/* Share App Button */}
          {onOpenShare && (
            <button
              onClick={onOpenShare}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 btn-3d-secondary transition-colors"
              title={language === 'fa' ? 'اشتراک‌گذاری و ارسال نرم‌افزار' : 'Share App'}
            >
              <Share2 className="w-4 h-4 text-indigo-500" />
            </button>
          )}

          {/* User Profile / Auth Button */}
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/80 btn-3d-secondary transition-colors"
          >
            <div className="w-6 h-6 rounded-full overflow-hidden bg-indigo-500 flex items-center justify-center text-white text-xs font-bold shadow-xs">
              {userSession.user?.avatarUrl && userSession.user.avatarUrl.trim() !== '' ? (
                <img src={userSession.user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-3.5 h-3.5" />
              )}
            </div>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 hidden sm:inline max-w-[110px] truncate">
              {userSession.user?.name || t.guestUser}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
