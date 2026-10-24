import React from 'react';
import {
  Sparkles,
  CheckCircle2,
  ExternalLink,
  X,
  Download,
  ShieldCheck
} from 'lucide-react';
import { Language } from '../types';
import { ODLogo } from './ODLogo';

export const APP_CURRENT_VERSION = '2.6.0';
export const CURRENT_APP_VERSION = APP_CURRENT_VERSION;
export const UPDATE_DISMISSED_SESSION_KEY = 'onedownload_update_dismissed_v2_7_0';

export interface AppVersionManifest {
  currentVersion: string;
  latestVersion: string;
  releaseDate: string;
  bazaarUrl: string;
  bazaarWebUrl: string;
  myketUrl: string;
  myketWebUrl: string;
  changelogFa: string[];
  changelogAr: string[];
  changelogEn: string[];
}

export const DEFAULT_VERSION_MANIFEST: AppVersionManifest = {
  currentVersion: '2.6.0',
  latestVersion: '2.7.0',
  releaseDate: '1405/08/01',
  bazaarUrl: 'bazaar://details?id=ir.appone.onedownload',
  bazaarWebUrl: 'https://cafebazaar.ir/app/ir.appone.onedownload',
  myketUrl: 'myket://details?id=ir.appone.onedownload',
  myketWebUrl: 'https://myket.ir/app/ir.appone.onedownload',
  changelogFa: [
    'افزایش چشمگیر سرعت دانلود چندبخشی موازی (IDM Style) تا ۸ رشته همزمان',
    'ارتقای موتور استخراج مستقیم آپارات، اینستاگرام، تیک‌تاک و یوتیوب 4K',
    'پشتیبانی از فعال‌سازی خودکار اشتراک VIP یک‌ماهه با دعوت ۳ نفر',
    'بهبود پخش‌کننده داخلی و مدیریت هوشمند حافظه آفلاین'
  ],
  changelogAr: [
    'زيادة سرعة التحميل المتعدد المتوازي (IDM Style) حتى ٨ مسارات متزامنة',
    'تطوير محرك الاستخراج المباشر من يوتيوب، إنستغرام، تيك توك وأبارات بجودة 4K',
    'تفعيل تلقائي لاشتراك VIP لمدة شهر عند دعوة ٣ أصدقاء',
    'تحسين المشغل الداخلي وإدارة الملفات بدون إنترنت'
  ],
  changelogEn: [
    'Boosted multi-threaded parallel chunk download speed (up to 8 concurrent streams)',
    'Enhanced 4K direct stream extraction for YouTube, Instagram, TikTok & Aparat',
    'Automatic 1-Month VIP activation upon 3 successful friend referrals',
    'Improved built-in media player and offline storage stability'
  ]
};

interface InAppUpdateModalProps {
  language: Language;
  isOpen: boolean;
  manifest?: AppVersionManifest;
  onClose: () => void;
}

export const InAppUpdateModal: React.FC<InAppUpdateModalProps> = ({
  language,
  isOpen,
  manifest = DEFAULT_VERSION_MANIFEST,
  onClose
}) => {
  if (!isOpen) return null;

  const isFa = language === 'fa';
  const isAr = language === 'ar';

  const changelog = isFa
    ? manifest.changelogFa
    : isAr
    ? manifest.changelogAr
    : manifest.changelogEn;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(UPDATE_DISMISSED_SESSION_KEY, 'true');
    } catch {
      // ignore
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-md rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-indigo-500/40 shadow-[0_25px_60px_-15px_rgba(79,70,229,0.45)] card-3d overflow-hidden my-auto text-white">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ODLogo className="w-11 h-11 shrink-0" />
            <div>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black mb-1">
                <Sparkles className="w-3 h-3" />
                <span>{`v${manifest.latestVersion}`}</span>
              </div>
              <h3 className="font-black text-sm sm:text-base text-white">
                {isFa
                  ? 'نسخه جدید وان دانلود منتشر شد!'
                  : isAr
                  ? 'تم إصدار تحديث جديد لتطبيق وان داونلود!'
                  : 'New OneDownload Update Released!'}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between text-xs bg-slate-950/80 border border-slate-800 rounded-2xl px-3.5 py-2.5">
            <span className="text-slate-400 font-bold">
              {isFa
                ? `نسخه فعلی شما: v${APP_CURRENT_VERSION}`
                : isAr
                ? `الإصدار الحالي: v${APP_CURRENT_VERSION}`
                : `Current Version: v${APP_CURRENT_VERSION}`}
            </span>
            <span className="font-black text-emerald-400">
              {isFa
                ? `نسخه جدید: v${manifest.latestVersion}`
                : isAr
                ? `الإصدار الجديد: v${manifest.latestVersion}`
                : `Latest Version: v${manifest.latestVersion}`}
            </span>
          </div>

          {/* Changelog List */}
          <div className="space-y-2">
            <h4 className="text-xs font-black text-indigo-300">
              {isFa
                ? 'تغییرات و ویژگی‌های نسخه جدید:'
                : isAr
                ? 'أهم التغييرات والميزات الجديدة:'
                : "What's New in This Version:"}
            </h4>
            <div className="space-y-2 bg-slate-950/60 border border-slate-800/90 rounded-2xl p-3.5">
              {changelog.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-slate-200 font-bold leading-relaxed">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Direct Store Update Buttons (CafeBazaar & Myket) */}
          <div className="space-y-2.5 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <a
                href={manifest.bazaarWebUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center justify-center gap-2 btn-3d-emerald shadow-lg cursor-pointer"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>
                  {isFa
                    ? 'بروزرسانی از کافه‌بازار'
                    : isAr
                    ? 'التحديث عبر كافيه بازار'
                    : 'Update via CafeBazaar'}
                </span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80 shrink-0" />
              </a>

              <a
                href={manifest.myketWebUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3 px-4 rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-black text-xs flex items-center justify-center gap-2 btn-3d-primary shadow-lg cursor-pointer"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>
                  {isFa
                    ? 'بروزرسانی از مایکت'
                    : isAr
                    ? 'التحديث عبر مايكت'
                    : 'Update via Myket'}
                </span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80 shrink-0" />
              </a>
            </div>

            <button
              type="button"
              onClick={handleDismiss}
              className="w-full py-2.5 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs transition-colors cursor-pointer"
            >
              {isFa
                ? 'فعلاً نه، ورود به برنامه'
                : isAr
                ? 'ليس الآن، متابعة للتطبيق'
                : 'Later, Continue to App'}
            </button>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              {isFa
                ? 'نسخه رسمی و تاییدشده با حفظ کامل اطلاعات و اشتراک شما'
                : isAr
                ? 'نسخة رسمية معتمدة مع الاحتفاظ بكامل بياناتك واشتراكك'
                : 'Official verified update — all your data and VIP status are preserved'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
