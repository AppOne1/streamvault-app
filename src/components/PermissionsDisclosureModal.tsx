import React, { useState } from 'react';
import { ShieldCheck, HardDrive, Film, Lock, CheckCircle2, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { Language } from '../types';

export const PERMISSIONS_DISCLOSURE_STORAGE_KEY = 'onedownload_permissions_disclosed_v1';

interface PermissionsDisclosureModalProps {
  language: Language;
  isOpen: boolean;
  onAccept: () => void;
}

export const PermissionsDisclosureModal: React.FC<PermissionsDisclosureModalProps> = ({
  language,
  isOpen,
  onAccept
}) => {
  const [showTerms, setShowTerms] = useState(false);

  if (!isOpen) return null;

  const isFa = language === 'fa';

  const handleConfirm = () => {
    try {
      localStorage.setItem(PERMISSIONS_DISCLOSURE_STORAGE_KEY, 'true');
    } catch {
      // ignore storage error
    }
    onAccept();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 card-3d overflow-hidden my-6">
        {/* Top Accent Banner */}
        <div className="px-6 pt-6 pb-4 text-center bg-gradient-to-b from-indigo-500/10 via-violet-500/5 to-transparent border-b border-slate-100 dark:border-slate-800/80">
          <div className="w-15 h-15 mx-auto rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 text-white flex items-center justify-center border-t border-white/30 shadow-[0_5px_0_rgb(67,56,202),0_12px_24px_rgba(99,102,241,0.35)] mb-3">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 mb-1.5">
            {isFa ? 'شفاف‌سازی حریم خصوصی و دسترسی‌ها' : 'Privacy & Permissions Disclosure'}
          </span>
          <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white drop-shadow-sm text-3d">
            {isFa ? 'خوش آمدید به وان دانلود (OneDownload)' : 'Welcome to OneDownload'}
          </h3>
        </div>

        {/* Main Disclosure Body */}
        <div className="p-5 sm:p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-200 font-bold text-justify input-3d">
            {isFa
              ? '«برای اینکه بتوانیم ویدیوها و موزیک‌های دانلودشده را مستقیماً در حافظه دستگاه شما ذخیره و پخش کنیم، نرم‌افزار به دسترسی فضای ذخیره‌سازی و رسانه نیاز دارد. این دسترسی صرفاً و فقط جهت عملکرد صحیح بخش دانلود و پخش آفلاین بوده و هیچ‌گونه دسترسی به اطلاعات شخصی شما وجود ندارد.»'
              : '“To save and play your downloaded videos and music directly on your device storage, OneDownload requires Storage and Media access. This permission is used strictly for downloading and offline playback, and we never access any of your personal data.”'}
          </div>

          {/* Permission Pillars */}
          <div className="grid grid-cols-1 gap-2.5 text-xs">
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 card-3d">
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 shrink-0">
                <HardDrive className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="font-black text-slate-900 dark:text-white">
                  {isFa ? 'دسترسی حافظه و رسانه (Storage & Media)' : 'Storage & Media Access'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isFa
                    ? 'ذخیره مستقیم فایل‌های MP4 و MP3 در پوشه Downloads گوشی شما'
                    : 'Direct saving of MP4 & MP3 files to your device Downloads folder'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 card-3d">
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="font-black text-slate-900 dark:text-white">
                  {isFa ? 'حفظ ۱۰۰٪ حریم خصوصی کاربر' : '100% Personal Privacy Guaranteed'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isFa
                    ? 'عدم دسترسی به مخاطبین، پیامک‌ها، موقعیت مکانی یا گالری شخصی'
                    : 'Zero access to contacts, messages, location, or private photos'}
                </p>
              </div>
            </div>
          </div>

          {/* Expandable Terms & Privacy Policy Section */}
          {showTerms && (
            <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 text-[11px] leading-relaxed text-slate-700 dark:text-slate-300 space-y-2 animate-fade-in">
              <h5 className="font-black text-xs text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isFa ? 'قوانین، مقررات و منشور حریم خصوصی نرم‌افزار:' : 'Terms of Service & Privacy Policy:'}
                </span>
              </h5>
              <ul className="list-disc list-inside space-y-1.5 font-medium">
                <li>
                  {isFa
                    ? 'دسترسی‌های READ_MEDIA_VIDEO، READ_MEDIA_AUDIO و WRITE_EXTERNAL_STORAGE منحصراً جهت ذخیره‌سازی و بازخوانی فایل‌های دانلودشده توسط خود کاربر استفاده می‌شوند.'
                    : 'Media and storage permissions are strictly limited to saving and playing user-initiated downloads.'}
                </li>
                <li>
                  {isFa
                    ? 'تمامی فایل‌های دانلودشده و رمز ۴ رقمی گاوصندوق خصوصی به صورت محلی روی دستگاه شما ذخیره شده و به هیچ سروری ارسال نمی‌شوند.'
                    : 'All downloaded files and your 4-digit Vault PIN are stored locally on your device.'}
                </li>
                <li>
                  {isFa
                    ? 'مسئولیت رعایت حقوق مالکیت معنوی محتواهای دانلودشده بر عهده کاربر است.'
                    : 'Users are responsible for respecting copyright laws for downloaded media.'}
                </li>
              </ul>
            </div>
          )}

          {/* Action Buttons: «تایید و ادامه» and «مطالعه قوانین» */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 py-3 px-4 rounded-2xl text-xs sm:text-sm font-black text-white bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 border-t border-white/25 shadow-[0_5px_0_rgb(76,29,149),0_10px_20px_rgba(124,58,237,0.35)] active:translate-y-[3px] active:shadow-[0_2px_0_rgb(76,29,149)] transition-all duration-150 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{isFa ? 'تایید و ادامه' : 'Accept & Continue'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowTerms(!showTerms)}
              className="py-3 px-4 rounded-2xl text-xs sm:text-sm font-black bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 btn-3d-secondary active:translate-y-[3px] transition-all duration-150 flex items-center justify-center gap-1.5 shrink-0"
            >
              <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
              <span>{isFa ? 'مطالعه قوانین' : 'Read Terms'}</span>
              {showTerms ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
