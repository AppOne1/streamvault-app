import React, { useState, useRef, useEffect } from 'react';
import {
  Clipboard,
  Check,
  X,
  Loader2,
  ArrowRight,
  Sparkles,
  FileEdit,
  Clock,
  Layers,
  ListOrdered,
  Play,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Radar
} from 'lucide-react';
import { DownloadTask, Language } from '../types';
import { getTranslation } from '../i18n/translations';
import {
  detectPlatform,
  extractUrlFromText,
  isValidHttpUrl,
  SAMPLE_URLS
} from '../services/platformDetector';
import { PlatformIcon } from './PlatformIcon';

interface UrlInputSectionProps {
  language: Language;
  url: string;
  setUrl: (val: string) => void;
  customFileName?: string;
  setCustomFileName?: (val: string) => void;
  scheduledTime?: string;
  setScheduledTime?: (val: string) => void;
  isLoading: boolean;
  onAnalyze: (targetUrl?: string) => void;
  onStartBatchDownload?: (urls: string[], qualityPreset: '1080p' | '720p' | 'mp3') => void;
  sharedLinkNotice?: boolean;
  autoSniffClipboard?: boolean;
  tasks?: DownloadTask[];
}

const LAST_COPIED_URL_KEY = 'onedownload_last_sniffed_url_v1';

const toLocalDigits = (val: string | number, lang: Language): string => {
  if (lang === 'fa') {
    return String(val).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
  }
  if (lang === 'ar') {
    return String(val).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
  }
  return String(val);
};

export const UrlInputSection: React.FC<UrlInputSectionProps> = ({
  language,
  url,
  setUrl,
  customFileName = '',
  setCustomFileName,
  scheduledTime = '',
  setScheduledTime,
  isLoading,
  onAnalyze,
  onStartBatchDownload,
  sharedLinkNotice,
  autoSniffClipboard = true,
  tasks = []
}) => {
  const t = getTranslation(language);
  const isFa = language === 'fa';
  const isAr = language === 'ar';
  const isRtl = isFa || isAr;

  const inputRef = useRef<HTMLInputElement | null>(null);
  const detectedPlatform = detectPlatform(url);

  const [pasteSuccess, setPasteSuccess] = useState(false);
  const [pasteHintVisible, setPasteHintVisible] = useState(false);
  const [sniffedClipboardUrl, setSniffedClipboardUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Batch Queue state
  const [showBatchQueue, setShowBatchQueue] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [batchQuality, setBatchQuality] = useState<'1080p' | '720p' | 'mp3'>('1080p');

  // Auto-sniff clipboard on window focus when enabled
  useEffect(() => {
    if (!autoSniffClipboard) return;

    const checkClipboard = async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          const candidate = extractUrlFromText(text);
          if (candidate && isValidHttpUrl(candidate) && candidate !== url) {
            setSniffedClipboardUrl(candidate);
          }
        }
      } catch {
        // Ignore clipboard permission silent check
      }
    };

    window.addEventListener('focus', checkClipboard);
    return () => window.removeEventListener('focus', checkClipboard);
  }, [autoSniffClipboard, url]);

  const applyValidUrl = (raw: string): string | null => {
    const extracted = extractUrlFromText(raw);
    if (extracted && isValidHttpUrl(extracted)) {
      setUrl(extracted);
      setValidationError(null);
      try {
        localStorage.setItem(LAST_COPIED_URL_KEY, extracted);
      } catch {
        // ignore
      }
      return extracted;
    }
    return null;
  };

  const handleAnalyzeClick = (overrideUrl?: string) => {
    const candidate = (overrideUrl ?? url).trim();
    if (!candidate || !isValidHttpUrl(candidate)) {
      setValidationError(
        isFa
          ? 'لطفاً یک لینک معتبر وارد کنید (شروع با http:// یا https://)'
          : isAr
          ? 'يرجى إدخال رابط صحيح ومعتبر (يبدأ بـ http:// أو https://)'
          : 'Please enter a valid URL (starting with http:// or https://)'
      );
      return;
    }
    setValidationError(null);
    onAnalyze(candidate);
  };

  const handlePasteClipboard = async () => {
    setValidationError(null);
    setPasteHintVisible(false);

    if (navigator.clipboard && navigator.clipboard.readText) {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          const valid = applyValidUrl(text);
          if (valid) {
            setPasteSuccess(true);
            setTimeout(() => setPasteSuccess(false), 1800);
            onAnalyze(valid);
          } else {
            setValidationError(
              isFa
                ? 'لطفاً یک لینک معتبر وارد کنید (محتوای کلیپ‌بورد لینک معتبر وب نیست).'
                : isAr
                ? 'يرجى إدخال رابط صحيح (النص المنسوخ ليس رابط ويب صالح).'
                : 'Please enter a valid URL (clipboard content is not a valid web link).'
            );
          }
          return;
        }
      } catch {
        // Fallback below
      }
    }

    if (inputRef.current) {
      try {
        inputRef.current.focus();
        inputRef.current.select();
        const ok = document.execCommand('paste');
        const val = inputRef.current.value?.trim();
        if (ok && val && applyValidUrl(val)) {
          handleAnalyzeClick(val);
          return;
        }
      } catch {
        // ignore
      }
    }

    try {
      const lastSaved = localStorage.getItem(LAST_COPIED_URL_KEY);
      if (lastSaved && isValidHttpUrl(lastSaved) && !url.trim()) {
        applyValidUrl(lastSaved);
        onAnalyze(lastSaved);
        return;
      }
    } catch {
      // ignore
    }

    inputRef.current?.focus();
    setPasteHintVisible(true);
    setTimeout(() => setPasteHintVisible(false), 6000);
  };

  const handleClear = () => {
    setUrl('');
    setValidationError(null);
    setPasteHintVisible(false);
    setSniffedClipboardUrl(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      e.preventDefault();
      handleAnalyzeClick();
    }
  };

  const stagedBatchUrls = batchText
    .split('\n')
    .map((line) => extractUrlFromText(line.trim()))
    .filter((u) => Boolean(u) && isValidHttpUrl(u));

  const removeStagedUrlAt = (idxToRemove: number) => {
    const lines = batchText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const updated = lines.filter((_, idx) => idx !== idxToRemove);
    setBatchText(updated.join('\n'));
  };

  const handleStartBatch = () => {
    if (stagedBatchUrls.length === 0 || !onStartBatchDownload) return;
    onStartBatchDownload(stagedBatchUrls, batchQuality);
    setBatchText('');
    setShowBatchQueue(false);
  };

  const handleLoadSampleBatch = () => {
    const sampleLines = SAMPLE_URLS.slice(0, 3)
      .map((s) => s.url)
      .join('\n');
    setBatchText(sampleLines);
  };

  const activeQueueTasks = tasks.filter(
    (t) => t.status === 'downloading' || t.status === 'queued'
  );

  return (
    <section className="w-full max-w-4xl mx-auto px-3 sm:px-4 pt-3 sm:pt-5 pb-2 overflow-x-hidden">
      {/* Shared Link Detection Banner */}
      {sharedLinkNotice && (
        <div className="mb-3 p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center gap-2.5 text-xs sm:text-sm text-indigo-900 dark:text-indigo-200 card-3d">
          <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
          <span className="font-bold">{t.urlDetectedFromShare}</span>
        </div>
      )}

      {/* Auto-Sniffed Clipboard Banner */}
      {sniffedClipboardUrl && sniffedClipboardUrl !== url && (
        <div className="mb-3 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 flex flex-wrap items-center justify-between gap-2 text-xs card-3d animate-fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <Radar className="w-4 h-4 text-emerald-500 animate-spin shrink-0" />
            <span className="font-black text-emerald-900 dark:text-emerald-200 truncate">
              {isFa
                ? 'لینک کپی‌شده در کلیپ‌بورد شناسایی شد:'
                : isAr
                ? 'تم اكتشاف رابط منسوخ في الحافظة:'
                : 'Copied link detected in clipboard:'}
            </span>
            <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-300 truncate max-w-[200px]" dir="ltr">
              {sniffedClipboardUrl}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setUrl(sniffedClipboardUrl);
                onAnalyze(sniffedClipboardUrl);
                setSniffedClipboardUrl(null);
              }}
              className="px-3 py-1 rounded-xl bg-emerald-600 text-white font-black text-[11px] btn-3d-emerald"
            >
              {isFa ? 'دانلود همین لینک' : isAr ? 'تحميل هذا الرابط' : 'Download Link'}
            </button>
            <button
              type="button"
              onClick={() => setSniffedClipboardUrl(null)}
              className="p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Hero Header - Strictly Single Unified Subtitle Sentence */}
      <div className="text-center mb-4">
        <p className="text-xs sm:text-sm md:text-base font-extrabold text-slate-700 dark:text-slate-200 max-w-2xl mx-auto">
          {isFa
            ? 'دانلودر فوق‌سریع ویدیو و موزیک با کیفیت 4K و پخش آفلاین'
            : isAr
            ? 'أسرع برنامج لتحميل الفيديو والموسيقى بجودة 4K وتشغيل بدون إنترنت'
            : 'Ultra-Fast 4K Video & Music Downloader with Offline Playback'}
        </p>
      </div>

      {/* Prominent Enlarged Input Card */}
      <div className="relative space-y-3">
        <div className="p-3.5 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border-2 border-indigo-500/70 dark:border-indigo-400/70 ring-4 ring-indigo-500/15 shadow-2xl card-3d space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Large URL Input Box */}
            <div className="flex items-center gap-3 flex-1 min-w-0 min-h-[60px] sm:min-h-[68px] bg-slate-50 dark:bg-slate-950 border-2 border-indigo-500/50 dark:border-indigo-500/60 focus-within:border-indigo-600 dark:focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-500/20 rounded-2xl px-4 py-3.5 input-3d transition-all">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 shrink-0 border border-indigo-500/30">
                <PlatformIcon platform={detectedPlatform} size={24} />
              </div>

              <input
                ref={inputRef}
                type="url"
                dir="ltr"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (validationError) setValidationError(null);
                  if (e.target.value.trim() && isValidHttpUrl(e.target.value.trim())) {
                    try {
                      localStorage.setItem(LAST_COPIED_URL_KEY, e.target.value.trim());
                    } catch {
                      // ignore
                    }
                  }
                }}
                onPaste={(e) => {
                  const pasted = e.clipboardData?.getData('text');
                  if (pasted) {
                    const extracted = extractUrlFromText(pasted) || pasted.trim();
                    if (isValidHttpUrl(extracted)) {
                      setValidationError(null);
                      try {
                        localStorage.setItem(LAST_COPIED_URL_KEY, extracted);
                      } catch {
                        // ignore
                      }
                      setTimeout(() => onAnalyze(extracted), 120);
                    } else {
                      setValidationError(
                        isFa
                          ? 'لطفاً یک لینک معتبر وارد کنید (شروع با http:// یا https://)'
                          : isAr
                          ? 'يرجى إدخال رابط صحيح ومعتبر (يبدأ بـ http:// أو https://)'
                          : 'Please enter a valid URL (starting with http:// or https://)'
                      );
                    }
                  }
                }}
                onKeyDown={handleKeyDown}
                placeholder={t.inputPlaceholder}
                className="w-full min-w-0 py-1.5 text-sm sm:text-base md:text-lg bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none font-extrabold tracking-wide"
              />

              {url && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors shrink-0"
                  title={t.clearInput}
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Paste & Analyze Buttons */}
            <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="flex items-center justify-center gap-2 px-4 py-3.5 sm:py-4 rounded-2xl text-xs sm:text-sm font-black bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border-t border-white/40 dark:border-white/15 shadow-[0_4px_0_rgb(148,163,184),0_8px_14px_rgba(15,23,42,0.1)] dark:shadow-[0_4px_0_rgb(15,23,42),0_8px_14px_rgba(0,0,0,0.45)] active:translate-y-[3px] active:shadow-[0_1px_0_rgb(148,163,184)] transition-all duration-150 shrink-0 cursor-pointer"
                title={t.pasteClipboard}
              >
                {pasteSuccess ? (
                  <Check className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500 shrink-0" />
                ) : (
                  <Clipboard className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500 shrink-0" />
                )}
                <span>
                  {pasteSuccess
                    ? isFa
                      ? 'جای‌گذاری شد'
                      : isAr
                      ? 'تم اللصق!'
                      : 'Pasted!'
                    : t.pasteClipboard}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleAnalyzeClick()}
                disabled={isLoading}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-3.5 sm:py-4 rounded-2xl text-sm sm:text-base font-black text-white bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 border-t border-white/25 shadow-[0_5px_0_rgb(76,29,149),0_10px_20px_rgba(124,58,237,0.35)] active:translate-y-[3px] active:shadow-[0_2px_0_rgb(76,29,149)] disabled:opacity-55 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                    <span className="truncate">{t.analyzing}</span>
                  </>
                ) : (
                  <>
                    <span className="drop-shadow-xs">{t.analyzeButton}</span>
                    <ArrowRight className={`w-5 h-5 shrink-0 ${isRtl ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Custom File Name & Scheduled Time Row */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 pt-2.5 border-t border-slate-200/80 dark:border-slate-800/80">
            {setCustomFileName && (
              <div className="md:col-span-7 flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5 shrink-0">
                  <FileEdit className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>
                    {isFa
                      ? 'نام دلخواه فایل (اختیاری):'
                      : isAr
                      ? 'اسم الملف المخصص (اختياري):'
                      : 'Custom File Name (Optional):'}
                  </span>
                </label>
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={customFileName}
                    onChange={(e) => setCustomFileName(e.target.value)}
                    placeholder={
                      isFa
                        ? 'اگر خالی بماند، نام اصلی ویدیو/موزیک ذخیره می‌شود...'
                        : isAr
                        ? 'اتركه فارغاً لحفظ الاسم الأصلي للفيديو أو الموسيقى...'
                        : 'Leave empty to keep original media title...'
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 input-3d"
                  />
                  {customFileName && (
                    <button
                      type="button"
                      onClick={() => setCustomFileName('')}
                      className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-rose-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {setScheduledTime && (
              <div className="md:col-span-5 flex items-center justify-between sm:justify-end gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-1.5">
                <label className="text-xs font-black text-amber-700 dark:text-amber-300 flex items-center gap-1.5 shrink-0">
                  <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>
                    {isFa
                      ? 'زمان‌بندی دانلود:'
                      : isAr
                      ? 'جدولة التحميل:'
                      : 'Schedule Time:'}
                  </span>
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="time"
                    dir="ltr"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-amber-500/40 text-xs font-mono font-black text-slate-900 dark:text-white focus:outline-none"
                  />
                  {scheduledTime && (
                    <button
                      type="button"
                      onClick={() => setScheduledTime('')}
                      className="p-1 text-rose-500 hover:bg-rose-500/10 rounded-lg"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Validation Error or Paste Hint */}
          {validationError && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-300 text-xs font-extrabold flex items-center gap-2 animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {pasteHintVisible && !validationError && (
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-bold flex items-center gap-2 animate-fade-in">
              <Clipboard className="w-4 h-4 shrink-0 text-amber-500" />
              <span>
                {isFa
                  ? 'انگشت خود را داخل کادر لینک نگه دارید و گزینه Paste (جای‌گذاری) را بزنید.'
                  : isAr
                  ? 'اضغط مطولاً داخل مربع الرابط واختر لصق (Paste).'
                  : 'Long-press inside the URL box and tap Paste.'}
              </span>
            </div>
          )}
        </div>

        {/* Batch Queue Toggle Bar (Localized without English "(Batch Queue)" in FA/AR) */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <button
            type="button"
            onClick={() => setShowBatchQueue(!showBatchQueue)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-black bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-300 border border-indigo-500/35 btn-3d-secondary active:translate-y-[2px] transition-all cursor-pointer"
          >
            <Layers className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>
              {isFa
                ? 'دانلود دسته‌جمعی'
                : isAr
                ? 'التحميل الجماعي المتسلسل'
                : 'Batch Download Queue'}
            </span>
            {(stagedBatchUrls.length > 0 || activeQueueTasks.length > 0) && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-600 text-white">
                {toLocalDigits(stagedBatchUrls.length || activeQueueTasks.length, language)}
              </span>
            )}
          </button>

          {activeQueueTasks.length > 0 && (
            <div className="text-[11px] font-extrabold text-indigo-600 dark:text-indigo-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
              <span>
                {isFa
                  ? `${toLocalDigits(activeQueueTasks.length, 'fa')} فایل در صف فعال`
                  : isAr
                  ? `${toLocalDigits(activeQueueTasks.length, 'ar')} ملفات في قائمة الانتظار`
                  : `${activeQueueTasks.length} in active queue`}
              </span>
            </div>
          )}
        </div>

        {/* Numbered Batch Download Queue Drawer */}
        {showBatchQueue && onStartBatchDownload && (
          <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-indigo-500/40 card-3d space-y-3.5 animate-fade-in">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-500">
                  <ListOrdered className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                    {isFa
                      ? 'فهرست صف دانلود دسته‌جمعی'
                      : isAr
                      ? 'قائمة التحميل الجماعي المرقمة'
                      : 'Numbered Batch Download Queue'}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isFa
                      ? 'لینک‌ها را در خطوط جداگانه وارد کنید؛ فهرست به صورت شماره‌گذاری‌شده (۱، ۲، ۳...) و به نوبت دانلود می‌شود'
                      : isAr
                      ? 'أدخل الروابط في أسطر منفصلة لتحميلها بالترتيب تلقائياً'
                      : 'Paste multiple links (one per line) to queue and download sequentially'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLoadSampleBatch}
                className="px-2.5 py-1.5 rounded-xl text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 hover:bg-slate-200 btn-3d-secondary shrink-0 cursor-pointer"
              >
                {isFa
                  ? '+ درج ۳ لینک نمونه'
                  : isAr
                  ? '+ إضافة ٣ روابط تجريبية'
                  : '+ Load 3 Sample Links'}
              </button>
            </div>

            <textarea
              rows={3}
              dir="ltr"
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder={"https://www.youtube.com/watch?v=...\nhttps://www.tiktok.com/@user/video/...\nhttps://www.instagram.com/reel/..."}
              className="w-full p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 input-3d"
            />

            {(stagedBatchUrls.length > 0 || tasks.length > 0) && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-[11px] font-black text-slate-600 dark:text-slate-300 px-1">
                  <span>
                    {isFa
                      ? 'فهرست شماره‌گذاری‌شده صف لینک‌ها (وضعیت لحظه‌ای):'
                      : isAr
                      ? 'قائمة الروابط المرقمة (الحالة المباشرة):'
                      : 'Numbered Queue List (Live Status):'}
                  </span>
                  <span className="text-indigo-500">
                    {isRtl
                      ? toLocalDigits(stagedBatchUrls.length + tasks.slice(0, 5).length, language)
                      : `${stagedBatchUrls.length + tasks.slice(0, 5).length} items`}
                  </span>
                </div>

                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                  {stagedBatchUrls.map((itemUrl, idx) => {
                    const num = idx + 1;
                    const plat = detectPlatform(itemUrl);
                    return (
                      <div
                        key={`staged-${idx}-${itemUrl}`}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="w-6 h-6 rounded-xl bg-indigo-600 text-white font-black text-[11px] flex items-center justify-center shrink-0 shadow-xs">
                            {toLocalDigits(num, language)}
                          </span>
                          <PlatformIcon platform={plat} size={15} />
                          <span className="font-mono text-[11px] text-slate-700 dark:text-slate-200 truncate" dir="ltr">
                            {itemUrl}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{isFa ? 'در انتظار' : isAr ? 'في الانتظار' : 'Waiting'}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => removeStagedUrlAt(idx)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-200/50 dark:hover:bg-slate-800"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {tasks.slice(0, 5).map((taskItem, idx) => {
                    const num = stagedBatchUrls.length + idx + 1;
                    const isDownloading = taskItem.status === 'downloading';
                    const isQueued = taskItem.status === 'queued';
                    const isCompleted = taskItem.status === 'completed';

                    return (
                      <div
                        key={taskItem.id}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="w-6 h-6 rounded-xl bg-slate-800 text-indigo-400 font-black text-[11px] flex items-center justify-center shrink-0 border border-indigo-500/30">
                            {toLocalDigits(num, language)}
                          </span>
                          <PlatformIcon platform={taskItem.platform} size={15} />
                          <span className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">
                            {taskItem.title}
                          </span>
                        </div>

                        <div className="shrink-0">
                          {isDownloading ? (
                            <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>
                                {isFa
                                  ? `در حال دانلود (${toLocalDigits(taskItem.progressPercent, 'fa')}٪)`
                                  : isAr
                                  ? `جاري التحميل (${toLocalDigits(taskItem.progressPercent, 'ar')}٪)`
                                  : `Downloading (${taskItem.progressPercent}%)`}
                              </span>
                            </span>
                          ) : isQueued ? (
                            <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>
                                {taskItem.scheduledTime
                                  ? isFa
                                    ? `⏰ ساعت ${taskItem.scheduledTime}`
                                  : isAr
                                    ? `⏰ الساعة ${taskItem.scheduledTime}`
                                    : `⏰ At ${taskItem.scheduledTime}`
                                  : isFa
                                  ? 'در انتظار نوبت'
                                  : isAr
                                  ? 'في الدور'
                                  : 'Queued'}
                              </span>
                            </span>
                          ) : isCompleted ? (
                            <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{isFa ? 'تکمیل شده' : isAr ? 'مكتمل' : 'Completed'}</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-500">
                              {taskItem.status}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500">
                  {isFa
                    ? 'کیفیت پیش‌فرض صف:'
                    : isAr
                    ? 'جودة التحميل:'
                    : 'Queue Quality:'}
                </span>
                {[
                  { id: '1080p' as const, label: '1080p Full HD' },
                  { id: '720p' as const, label: '720p HD' },
                  { id: 'mp3' as const, label: 'MP3 320kbps' }
                ].map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setBatchQuality(q.id)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                      batchQuality === q.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleStartBatch}
                disabled={stagedBatchUrls.length === 0}
                className="px-4 py-2 rounded-xl text-xs font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 btn-3d-primary disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  {isFa
                    ? `شروع دانلود نوبتی (${toLocalDigits(stagedBatchUrls.length, 'fa')} لینک)`
                    : isAr
                    ? `بدء التحميل المتسلسل (${toLocalDigits(stagedBatchUrls.length, 'ar')})`
                    : `Start Batch Queue (${stagedBatchUrls.length})`}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
