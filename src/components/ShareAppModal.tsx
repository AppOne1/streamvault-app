import React, { useState } from 'react';
import { X, Share2, Copy, Check, Send, Bluetooth, Download } from 'lucide-react';
import { Language } from '../types';
import { getTranslation } from '../i18n/translations';
import { shareAppToFriends } from '../services/deviceService';

interface ShareAppModalProps {
  language: Language;
  isOpen: boolean;
  onClose: () => void;
}

const STORE_LINK_KEY = 'onedownload_custom_share_link';
const DEFAULT_STORE_LINK = 'https://cafebazaar.ir/app/ir.appone.onedownload';

export const ShareAppModal: React.FC<ShareAppModalProps> = ({
  language,
  isOpen,
  onClose
}) => {
  const t = getTranslation(language);
  const [copied, setCopied] = useState(false);
  const [customLink, setCustomLink] = useState(() => {
    const saved = localStorage.getItem(STORE_LINK_KEY);
    if (saved && !saved.includes('localhost') && !saved.includes('127.0.0.1')) {
      return saved;
    }
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      if (origin && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
        return origin;
      }
    }
    return DEFAULT_STORE_LINK;
  });
  const [isEditingLink, setIsEditingLink] = useState(false);

  if (!isOpen) return null;

  const handleShare = async () => {
    const success = await shareAppToFriends(customLink);
    if (success && (!navigator.share)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleCopy = async () => {
    const shareText = language === 'fa'
      ? `دانلود اپلیکیشن وان دانلود (OneDownload) — دانلودر فوق‌سریع ویدیو و موزیک (گروه AppOne علوی):\n${customLink}`
      : `Download OneDownload — Ultra-Fast Video & Music Downloader:\n${customLink}`;
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = shareText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleSaveLink = () => {
    const clean = customLink.trim() || DEFAULT_STORE_LINK;
    setCustomLink(clean);
    localStorage.setItem(STORE_LINK_KEY, clean);
    setIsEditingLink(false);
  };

  const applyPresetLink = (url: string) => {
    setCustomLink(url);
    localStorage.setItem(STORE_LINK_KEY, url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 card-3d overflow-hidden my-8">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 card-3d shrink-0">
              <Share2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white text-3d truncate">
                {language === 'fa' ? 'اشتراک‌گذاری و ارسال وان دانلود' : 'Share OneDownload App'}
              </h3>
              <p className="text-[11px] text-slate-400 truncate">
                {language === 'fa' ? 'ارسال مستقیم به دوستان در اندروید و شبکه‌های اجتماعی' : 'Send app via Android Share, Bluetooth or Link'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Main Hero Card with New 3D OneDownload Logo */}
          <div className="text-center p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 card-3d">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 text-white font-black text-xl flex flex-col items-center justify-center shadow-lg shadow-indigo-600/30 mb-2.5 card-3d">
              <Download className="w-6 h-6 stroke-[2.75]" />
              <span className="text-[9px] tracking-widest uppercase font-black -mt-0.5">1D PRO</span>
            </div>
            <h4 className="font-black text-base text-slate-900 dark:text-white text-3d">
              {t.appName}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
              {language === 'fa'
                ? 'دانلودر فوق‌سریع ویدیو و موزیک با کیفیت 4K و پخش آفلاین (گروه AppOne علوی)'
                : 'Ultra-fast video & music downloader with offline device playback'}
            </p>
          </div>

          {/* Quick Action Button: Real Android / Mobile Native Share Sheet */}
          <button
            onClick={handleShare}
            className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 btn-3d-primary"
          >
            <Send className="w-4 h-4 shrink-0" />
            <span>{language === 'fa' ? 'ارسال مستقیم (منوی اشتراک اندروید، تلگرام، بلوتوث)' : 'Direct Share (Android Share Sheet / Apps)'}</span>
          </button>

          {/* Direct Download Link Box (Editable for CafeBazaar / Myket / GitHub) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
              <span className="font-bold">{language === 'fa' ? 'لینک دانلود مستقیم برنامه:' : 'Direct App Download Link:'}</span>
              <button
                onClick={() => setIsEditingLink(!isEditingLink)}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {isEditingLink
                  ? (language === 'fa' ? 'انصراف' : 'Cancel')
                  : (language === 'fa' ? 'ویرایش لینک (بازار / مایکت / گیت‌هاب)' : 'Edit Store/GitHub Link')}
              </button>
            </div>

            {/* Store Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => applyPresetLink('https://cafebazaar.ir/app/ir.appone.onedownload')}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors"
              >
                {language === 'fa' ? 'کافه‌بازار' : 'CafeBazaar'}
              </button>
              <button
                type="button"
                onClick={() => applyPresetLink('https://myket.ir/app/ir.appone.onedownload')}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors"
              >
                {language === 'fa' ? 'مایکت' : 'Myket'}
              </button>
              <button
                type="button"
                onClick={() => applyPresetLink('https://github.com/appone-ir/onedownload/releases/latest')}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors"
              >
                {language === 'fa' ? 'گیت‌هاب (APK مستقیم)' : 'GitHub APK'}
              </button>
            </div>

            {isEditingLink ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  dir="ltr"
                  value={customLink}
                  onChange={(e) => setCustomLink(e.target.value)}
                  placeholder="https://cafebazaar.ir/app/ir.appone.onedownload"
                  className="flex-1 px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 text-slate-800 dark:text-slate-200 focus:outline-none input-3d"
                />
                <button
                  onClick={handleSaveLink}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white btn-3d-primary"
                >
                  {language === 'fa' ? 'ذخیره' : 'Save'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 input-3d">
                <input
                  type="text"
                  readOnly
                  dir="ltr"
                  value={customLink}
                  className="flex-1 bg-transparent text-xs text-slate-600 dark:text-slate-300 outline-none truncate px-1.5"
                />
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-600 text-[11px] font-bold btn-3d-secondary shrink-0"
                  title="کپی لینک"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-indigo-500" />}
                  <span>{copied ? (language === 'fa' ? 'کپی شد' : 'Copied') : (language === 'fa' ? 'کپی' : 'Copy')}</span>
                </button>
              </div>
            )}
          </div>

          {/* Bluetooth & Offline Share Instructions */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
              <Bluetooth className="w-4 h-4 text-indigo-500 shrink-0" />
              <span>{language === 'fa' ? 'ارسال فایل APK یا ویدیوها با بلوتوث و شیریت:' : 'Send APK or Videos via Bluetooth / Quick Share:'}</span>
            </div>
            <p className="leading-relaxed">
              {language === 'fa'
                ? 'با دکمه «ارسال مستقیم» در بالا، منوی اشتراک‌گذاری اصلی اندروید باز می‌شود و می‌توانید لینک دانلود یا فایل برنامه را از طریق بلوتوث، Quick Share، تلگرام یا واتساپ ارسال کنید.'
                : 'Tap Direct Share above to invoke the native Android share sheet for Bluetooth, Quick Share, Telegram, or WhatsApp.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
