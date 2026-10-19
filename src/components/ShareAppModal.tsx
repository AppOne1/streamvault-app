import React, { useState } from 'react';
import { X, Share2, Copy, Check, QrCode, Smartphone, ExternalLink, Send, Bluetooth } from 'lucide-react';
import { Language } from '../types';
import { getTranslation } from '../i18n/translations';
import { shareAppToFriends } from '../services/deviceService';

interface ShareAppModalProps {
  language: Language;
  isOpen: boolean;
  onClose: () => void;
}

const STORE_LINK_KEY = 'streamvault_custom_share_link';

export const ShareAppModal: React.FC<ShareAppModalProps> = ({
  language,
  isOpen,
  onClose
}) => {
  const t = getTranslation(language);
  const [copied, setCopied] = useState(false);
  const [customLink, setCustomLink] = useState(() => {
    return localStorage.getItem(STORE_LINK_KEY) || (typeof window !== 'undefined' ? window.location.origin : '');
  });
  const [isEditingLink, setIsEditingLink] = useState(false);

  if (!isOpen) return null;

  const handleShare = async () => {
    const success = await shareAppToFriends(customLink);
    if (success && !navigator.share) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        `دانلود اپلیکیشن استریم‌والت (دانلودر پرسرعت ویدیو بدون فیلترشکن):\n${customLink}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleSaveLink = () => {
    localStorage.setItem(STORE_LINK_KEY, customLink.trim());
    setIsEditingLink(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 card-3d overflow-hidden my-8">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 card-3d">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                {language === 'fa' ? 'اشتراک‌گذاری و ارسال نرم‌افزار' : 'Share Application'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {language === 'fa' ? 'ارسال به دوستان با بلوتوث، شبکه‌ها یا لینک اختصاصی' : 'Send app via Bluetooth, Social Apps or Link'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Main Hero Card */}
          <div className="text-center p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-black text-2xl flex items-center justify-center shadow-lg shadow-indigo-600/30 mb-2">
              SV
            </div>
            <h4 className="font-black text-base text-slate-900 dark:text-white">
              {t.appName}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
              {language === 'fa'
                ? 'دانلودر چندرسانه‌ای پرسرعت با قابلیت ذخیره در حافظه گوشی و پخش آفلاین'
                : 'Fast media downloader with offline device playback'}
            </p>
          </div>

          {/* Quick Action Button: Native Share Sheet */}
          <button
            onClick={handleShare}
            className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-95 transition-all btn-3d-primary"
          >
            <Send className="w-4 h-4 ml-1" />
            <span>{language === 'fa' ? 'ارسال مستقیم (بلوتوث، تلگرام، زاپیا و...)' : 'Share via Bluetooth / Apps'}</span>
          </button>

          {/* Share Link Box & Custom Domain */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
              <span>{language === 'fa' ? 'لینک اشتراک‌گذاری برنامه:' : 'Share Link:'}</span>
              <button
                onClick={() => setIsEditingLink(!isEditingLink)}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {isEditingLink
                  ? (language === 'fa' ? 'ذخیره لینک' : 'Done')
                  : (language === 'fa' ? 'تنظیم لینک اختصاصی بازار/سایت' : 'Custom Link')}
              </button>
            </div>

            {isEditingLink ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  dir="ltr"
                  value={customLink}
                  onChange={(e) => setCustomLink(e.target.value)}
                  placeholder="https://cafebazaar.ir/app/... یا آدرس دامنه"
                  className="flex-1 px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 font-mono text-slate-800 dark:text-slate-200 focus:outline-none"
                />
                <button
                  onClick={handleSaveLink}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white active:scale-95 transition-all"
                >
                  {language === 'fa' ? 'تایید' : 'Save'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80">
                <input
                  type="text"
                  readOnly
                  dir="ltr"
                  value={customLink}
                  className="flex-1 bg-transparent text-xs font-mono text-slate-600 dark:text-slate-300 outline-none truncate px-1"
                />
                <button
                  onClick={handleCopy}
                  className="p-2 rounded-xl bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-600 shadow-xs transition-colors shrink-0"
                  title="کپی لینک"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>

          {/* Bluetooth & Offline Share Instructions */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
              <Bluetooth className="w-4 h-4 text-indigo-500 shrink-0" />
              <span>{language === 'fa' ? 'نحوه ارسال با بلوتوث و زاپیا:' : 'How to send via Bluetooth / Zapya:'}</span>
            </div>
            <p className="leading-relaxed">
              {language === 'fa'
                ? 'پس از خروجی گرفتن فایل APK، می‌توانید فایل برنامه یا ویدیوهای دانلود شده را از طریق منوی اشتراک‌گذاری گوشی یا زاپیا مستقیماً با بلوتوث به گوشی‌های دیگر بفرستید.'
                : 'You can send downloaded videos and APK packages directly over Bluetooth or Zapya without requiring an active internet connection.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
