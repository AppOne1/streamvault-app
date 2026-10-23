import React from 'react';
import { Download, Globe, Moon, Sun, Crown, Coins, User } from 'lucide-react';
import { Language, ThemeMode, UserSession } from '../types';
import { getTranslation } from '../i18n/translations';
import { isCapacitorOrNative } from '../services/platformDetector';
import { QuotaInfo } from '../services/quotaService';
import { ODLogo } from './ODLogo';

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

const toFaDigits = (val: string | number): string =>
  String(val).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

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
  onOpenUpgrade
}) => {
  const t = getTranslation(language);
  const isFa = language === 'fa';
  const isAr = language === 'ar';
  const isRtl = isFa || isAr;

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

  const vipDaysLabel = quotaInfo.isPro
    ? quotaInfo.remainingProDays && quotaInfo.remainingProDays < 3650
      ? isFa
        ? `VIP (${toFaDigits(quotaInfo.remainingProDays)} روز)`
        : isAr
        ? `VIP (${toFaDigits(quotaInfo.remainingProDays)} يوم)`
        : `VIP (${quotaInfo.remainingProDays}d)`
      : 'VIP Pro'
    : 'VIP';

  const langBadgeLabel =
    language === 'fa' ? 'FA 🇮🇷' : language === 'ar' ? 'AR 🇮🇶' : 'EN 🌐';

  return (
    <header className="sticky top-0 z-40 w-full max-w-[100vw] overflow-x-clip backdrop-blur-xl bg-white/95 dark:bg-slate-900/95 border-b border-slate-200/80 dark:border-slate-800/80 shadow-xs transition-colors">
      <div className="max-w-6xl mx-auto px-2.5 sm:px-6 py-2.5 flex items-center justify-between gap-2 sm:gap-4 overflow-hidden">
        {/* Left / Start: 3D Tactile "OD" Logo + Unified Name & Single Subtitle Sentence */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1 overflow-hidden pe-1">
          <div className="shrink-0">
            <ODLogo className="w-9 h-9 sm:w-11 sm:h-11" showOnlineDot isOnline={isOnline} />
          </div>

          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center min-w-0 overflow-hidden">
              <span className="block font-black text-xs xs:text-sm sm:text-lg tracking-tight text-slate-900 dark:text-white drop-shadow-sm text-3d truncate max-w-full">
                {isFa ? 'وان دانلود' : isAr ? 'وان داونلود' : 'OneDownload'}
              </span>
            </div>
            {/* Single Subtitle Kept Below Header */}
            <p className="block text-[9px] xs:text-[10px] sm:text-xs text-indigo-600 dark:text-indigo-300 truncate font-extrabold max-w-full mt-0.5">
              {isFa
                ? 'دانلودر فوق‌سریع ویدیو، موزیک و زیرنویس • یوتیوب، تیک‌تاک، اینستاگرام'
                : isAr
                ? 'محمّل الفيديو والموسيقى والترجمة فائق السرعة • يوتيوب، تيك توك، إنستغرام'
                : 'Ultra-Fast Video, Music & Subtitle Downloader • YouTube, TikTok, Instagram'}
            </p>
          </div>
        </div>

        {/* Right / End: Live Coin Balance + Theme Toggle + 3-Language Switcher + Profile/Auth + VIP Status */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {!isInstalledOrNative && (
            <button
              type="button"
              onClick={isInstallable ? onTriggerInstall : onOpenInstallGuide}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold text-white bg-gradient-to-r from-indigo-600 to-violet-600 border-t border-white/25 shadow-[0_4px_0_rgb(76,29,149),0_8px_16px_rgba(124,58,237,0.3)] active:translate-y-[3px] active:shadow-[0_1px_0_rgb(76,29,149)] transition-all duration-150 shrink-0"
              title={t.installApp}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t.installApp}</span>
            </button>
          )}

          {/* Live Coins Balance Badge */}
          <button
            type="button"
            onClick={onOpenUpgrade}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 dark:bg-amber-500/15 border border-amber-500/35 text-amber-700 dark:text-amber-300 text-[11px] sm:text-xs font-black btn-3d-secondary active:translate-y-[2px] transition-all duration-150 shrink-0"
            title={
              isFa
                ? 'موجودی سکه و اشتراک VIP'
                : isAr
                ? 'رصيد العملات واشتراك VIP'
                : 'Coin Balance & VIP'
            }
          >
            <Coins className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>{isRtl ? toFaDigits(coinsBalance) : coinsBalance}</span>
          </button>

          {/* Theme Toggle (Dark & Light Mode - Always Active & Accessible) */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex p-1.5 sm:p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 btn-3d-secondary active:translate-y-[3px] transition-all duration-150 shrink-0"
            title={
              theme === 'dark'
                ? isFa
                  ? 'حالت روشن'
                  : isAr
                  ? 'الوضع الفاتح'
                  : 'Light Mode'
                : isFa
                ? 'حالت تیره'
                : isAr
                ? 'الوضع الداكن'
                : 'Dark Mode'
            }
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-600" />
            )}
          </button>

          {/* 3-Language Switcher Button (FA -> AR -> EN) */}
          <button
            type="button"
            onClick={onToggleLanguage}
            className="flex items-center gap-1 px-1.5 sm:px-2 py-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 btn-3d-secondary active:translate-y-[3px] transition-all duration-150 shrink-0"
            title="تغییر زبان (فارسی / العربية / English)"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="whitespace-nowrap">{langBadgeLabel}</span>
          </button>

          {/* Compact 3D Personal Profile / Mandatory Registration Button */}
          <button
            type="button"
            onClick={onOpenAuth}
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 btn-3d-secondary active:translate-y-[3px] transition-all duration-150 shrink-0"
            title={
              isFa
                ? 'پروفایل شخصی / ثبت‌نام'
                : isAr
                ? 'الملف الشخصي / التسجيل'
                : 'Personal Profile / Sign Up'
            }
          >
            {userSession.isLoggedIn && userSession.user.avatarUrl ? (
              <img
                src={userSession.user.avatarUrl}
                alt={userSession.user.name}
                className="w-4 h-4 rounded-full object-cover shrink-0"
              />
            ) : (
              <User className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            )}
            <span className="hidden sm:inline text-[11px] font-black whitespace-nowrap">
              {userSession.isLoggedIn
                ? isFa
                  ? 'پروفایل'
                  : isAr
                  ? 'حسابي'
                  : 'Profile'
                : isFa
                ? 'ورود/ثبت‌نام'
                : isAr
                ? 'دخول/تسجيل'
                : 'Sign In'}
            </span>
          </button>

          {/* Compact 3D VIP Status / Remaining Days Button */}
          <button
            type="button"
            onClick={onOpenUpgrade}
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl font-black text-[11px] sm:text-xs transition-all duration-150 shrink-0 whitespace-nowrap ${
              quotaInfo.isPro
                ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 text-slate-950 border-t border-white/40 shadow-[0_4px_0_rgb(180,83,9),0_8px_15px_rgba(245,158,11,0.3)] active:translate-y-[3px]'
                : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-t border-white/25 shadow-[0_4px_0_rgb(76,29,149),0_8px_15px_rgba(124,58,237,0.25)] active:translate-y-[3px]'
            }`}
            title={
              quotaInfo.isPro
                ? isFa
                  ? `اشتراک VIP فعال (${toFaDigits(quotaInfo.remainingProDays || 30)} روز باقی‌مانده)`
                  : isAr
                  ? `اشتراك VIP مفعل (${toFaDigits(quotaInfo.remainingProDays || 30)} يوم متبقي)`
                  : `VIP Active (${quotaInfo.remainingProDays || 30} days left)`
                : isFa
                ? 'فعال‌سازی اشتراک VIP'
                : isAr
                ? 'تفعيل اشتراك VIP'
                : 'Activate VIP'
            }
          >
            <Crown className={`w-3.5 h-3.5 shrink-0 ${quotaInfo.isPro ? 'fill-slate-950 text-slate-950' : 'text-amber-300'}`} />
            <span className="text-[11px] font-black">{vipDaysLabel}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
