import React from 'react';
import {
  ShieldCheck,
  HardDrive,
  Bell,
  Wifi,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { Language } from '../types';

export const PERMISSIONS_DISCLOSURE_STORAGE_KEY = 'onedownload_privacy_accepted_v3';

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
  if (!isOpen) return null;

  const isFa = language === 'fa';
  const isAr = language === 'ar';

  const handleConfirm = () => {
    try {
      localStorage.setItem(PERMISSIONS_DISCLOSURE_STORAGE_KEY, 'true');
    } catch {
      // ignore storage errors
    }

    // Request browser notification permission if supported
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    } catch {
      // ignore
    }

    onAccept();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 card-3d overflow-hidden my-auto">
        {/* Top Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/25 shrink-0">
              <ShieldCheck className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base text-white">
                {isFa
                  ? 'مجوزها و سیاست حفظ حریم خصوصی'
                  : isAr
                  ? 'الأذونات وسياسة الخصوصية'
                  : 'Permissions & Privacy Policy'}
              </h3>
              <p className="text-[11px] text-indigo-100 mt-0.5">
                {isFa
                  ? 'شفافیت کامل در حفظ امنیت و حریم خصوصی شما'
                  : isAr
                  ? 'شفافية كاملة في حماية أمنك وخصوصيتك'
                  : 'Full transparency in protecting your security and privacy'}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-3.5 max-h-[75vh] overflow-y-auto">
          {/* Core Mandatory Privacy Statement */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/90 dark:bg-indigo-950/50 border-2 border-indigo-500/40 dark:border-indigo-500/40">
            <p className="text-xs sm:text-[13px] font-black text-slate-800 dark:text-slate-100 leading-relaxed text-justify">
              {isFa
                ? '«دسترسی به حافظه دستگاه صرفاً جهت ذخیره‌سازی ویدیوها و فایل‌های صوتی دانلودشده توسط شما استفاده می‌شود و این نرم‌افزار به هیچ‌گونه اطلاعات شخصی، مخاطبین یا داده‌های دیگر دستگاه شما دسترسی ندارد.»'
                : isAr
                ? '«يُستخدم إذن الوصول إلى ذاكرة الجهاز حصرياً لحفظ مقاطع الفيديو والملفات الصوتية التي تقوم بتحميلها، ولا يصل هذا التطبيق إلى أي معلومات شخصية أو جهات اتصال أو بيانات أخرى على جهازك.»'
                : '"Access to device storage is used strictly for saving videos and audio files downloaded by you, and this application does not access any personal information, contacts, or other data on your device."'}
            </p>
          </div>

          <div className="space-y-2.5">
            {/* Permission 1: Device Storage */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                <HardDrive className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-black text-slate-900 dark:text-white">
                  {isFa
                    ? '۱. دسترسی به حافظه و فضای ذخیره‌سازی (Storage)'
                    : isAr
                    ? '١. الوصول إلى مساحة التخزين (Storage)'
                    : '1. Device Storage Access (Storage)'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  {isFa
                    ? 'صرفاً جهت ذخیره‌سازی مستقیم ویدیوها و فایل‌های صوتی دانلودشده توسط شما در پوشه Downloads دستگاه و پخش آفلاین آن‌ها.'
                    : isAr
                    ? 'يُستخدم فقط لحفظ مقاطع الفيديو والملفات الصوتية التي قمت بتحميلها داخل مجلد Downloads وتشغيلها بدون إنترنت.'
                    : 'Used strictly to save your downloaded videos and audio files into the device Downloads folder and play them offline.'}
                </p>
              </div>
            </div>

            {/* Permission 2: Internet & Network */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <Wifi className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-black text-slate-900 dark:text-white">
                  {isFa
                    ? '۲. دسترسی به اینترنت و شبکه (Network)'
                    : isAr
                    ? '٢. الاتصال بالإنترنت والشبكة (Network)'
                    : '2. Internet & Network Access (Network)'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  {isFa
                    ? 'جهت پردازش لینک‌های ارسالی شما و دریافت مستقیم استریم‌های ویدیویی و صوتی با سرعت بالا.'
                    : isAr
                    ? 'لمعالجة الروابط المدخلة واستخراج وتحميل الملفات الصوتية والمرئية بسرعة عالية.'
                    : 'Required to analyze your submitted links and download media streams at high speed.'}
                </p>
              </div>
            </div>

            {/* Permission 3: Smart Completion Notifications */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                <Bell className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-black text-slate-900 dark:text-white">
                  {isFa
                    ? '۳. اعلان‌های هوشمند پایان دانلود (Notifications)'
                    : isAr
                    ? '٣. إشعارات اكتمال التحميل الذكية (Notifications)'
                    : '3. Smart Completion Notifications'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  {isFa
                    ? 'جهت اطلاع‌رسانی لحظه‌ای هنگام تکمیل دانلودهای پس‌زمینه یا زمان‌بندی‌شده.'
                    : isAr
                    ? 'لإعلامك فور انتهاء التحميلات المجدولة أو التي تعمل في الخلفية.'
                    : 'To notify you when background or scheduled downloads finish.'}
                </p>
              </div>
            </div>
          </div>

          {/* Privacy Guarantee Box */}
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 leading-relaxed">
              {isFa
                ? 'تضمین امنیت: هیچ‌یک از فایل‌های شخصی، گالری یا اطلاعات خصوصی شما جمع‌آوری یا به سرور ارسال نمی‌شود.'
                : isAr
                ? 'ضمان الخصوصية: لا يتم جمع أو إرسال أي ملفات أو بيانات شخصية من جهازك إلى أي خادم.'
                : 'Privacy Guarantee: None of your personal files, contacts, or private data are ever accessed or uploaded.'}
            </p>
          </div>

          {/* Confirm & Continue Button */}
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full py-3 px-4 rounded-2xl text-xs sm:text-sm font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 btn-3d-primary flex items-center justify-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {isFa
                ? 'پذیرش و ادامه'
                : isAr
                ? 'موافقة ومتابعة'
                : 'Accept & Continue'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
