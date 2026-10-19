import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Clipboard,
  Check,
  X,
  Loader2,
  Share2,
  Sparkles,
  Radar,
  ListPlus,
  Layers,
  Play,
  Clock,
  CheckCircle2,
  Trash2
} from 'lucide-react';
import { DownloadTask, Language, PlatformId } from '../types';
import { detectPlatform, extractUrlFromText, SAMPLE_URLS } from '../services/platformDetector';
import { PlatformIcon } from './PlatformIcon';
import { getTranslation } from '../i18n/translations';

interface UrlInputSectionProps {
  language: Language;
  url: string;
  setUrl: (url: string) => void;
  isLoading: boolean;
  onAnalyze: (targetUrl?: string) => void;
  onStartBatchDownload?: (urls: string[], qualityPreset: '1080p' | '720p' | 'mp3') => void;
  sharedLinkNotice: boolean;
  autoSniffClipboard?: boolean;
  tasks?: DownloadTask[];
}

const LAST_COPIED_KEY = 'onedownload_last_copied_url';
const AUTO_SNIFF_KEY = 'onedownload_auto_sniff_enabled_v1';
const LAST_SNIFFED_SESSION_KEY = 'onedownload_last_auto_sniffed_url';

function toPersianDigits(num: number): string {
  const persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(num)
    .split('')
    .map((c) => (/\d/.test(c) ? persian[Number(c)] : c))
    .join('');
}

export const UrlInputSection: React.FC<UrlInputSectionProps> = ({
  language,
  url,
  setUrl,
  isLoading,
  onAnalyze,
  onStartBatchDownload,
  sharedLinkNotice,
  autoSniffClipboard = true,
  tasks = []
}) => {
  const t = getTranslation(language);
  const isFa = language === 'fa';
  const inputRef = useRef<HTMLInputElement | null>(null);
  const detectedPlatform: PlatformId = url.trim() ? detectPlatform(url) : 'generic';

  const [copyFeedback, setCopyFeedback] = useState(false);
  const [pasteHintVisible, setPasteHintVisible] = useState(false);
  const [autoSniffedBanner, setAutoSniffedBanner] = useState<string | null>(null);

  const lastSniffedRef = useRef<string>(
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(LAST_SNIFFED_SESSION_KEY) || '' : ''
  );

  // Batch Queue Multi-Link Panel State
  const [isBatchOpen, setIsBatchOpen] = useState<boolean>(false);
  const [batchText, setBatchText] = useState<string>('');
  const [batchPreset, setBatchPreset] = useState<'1080p' | '720p' | 'mp3'>('1080p');

  // Parse valid URLs currently entered in the Batch Queue textarea
  const stagedBatchUrls = React.useMemo(() => {
    return batchText
      .split(/[\r\n]+/)
      .map((line) => extractUrlFromText(line) || line.trim())
      .filter((u) => /^https?:\/\//i.test(u));
  }, [batchText]);

  const removeStagedBatchUrl = (idxToRemove: number) => {
    const next = stagedBatchUrls.filter((_, i) => i !== idxToRemove);
    setBatchText(next.join('\n'));
  };

  /**
   * Auto-Paste Clipboard Sniffer (Controlled via Settings switch):
   * Automatically checks clipboard on page load, window focus, and visibility change.
   */
  useEffect(() => {
    let isEnabled = autoSniffClipboard;
    try {
      const saved = localStorage.getItem(AUTO_SNIFF_KEY);
      if (saved !== null) {
        isEnabled = saved === 'true';
      }
    } catch {
      // ignore
    }

    if (!isEnabled) return;

    const inspectClipboardForUrl = async () => {
      if (isLoading) return;
      if (typeof navigator === 'undefined' || !navigator.clipboard || !navigator.clipboard.readText) {
        return;
      }

      try {
        const rawClip = await navigator.clipboard.readText();
        if (!rawClip || !rawClip.trim()) return;

        const extractedUrl = extractUrlFromText(rawClip);
        if (!extractedUrl || !/^https?:\/\//i.test(extractedUrl)) return;

        if (extractedUrl === lastSniffedRef.current || extractedUrl === url.trim()) {
          return;
        }

        lastSniffedRef.current = extractedUrl;
        try {
          sessionStorage.setItem(LAST_SNIFFED_SESSION_KEY, extractedUrl);
          localStorage.setItem(LAST_COPIED_KEY, extractedUrl);
        } catch {
          // ignore
        }

        setUrl(extractedUrl);
        setAutoSniffedBanner(extractedUrl);
        onAnalyze(extractedUrl);
        setTimeout(() => setAutoSniffedBanner(null), 6000);
      } catch {
        // Browser may block background clipboard read until user interacts; fail silently
      }
    };

    const initTimer = setTimeout(() => {
      inspectClipboardForUrl();
    }, 350);

    const handleWindowFocus = () => {
      inspectClipboardForUrl();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        inspectClipboardForUrl();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(initTimer);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autoSniffClipboard, isLoading, url]);

  const applyPastedText = (rawText: string) => {
    const cleaned = extractUrlFromText(rawText) || rawText.trim();
    if (!cleaned) return false;
    setUrl(cleaned);
    lastSniffedRef.current = cleaned;
    try {
      localStorage.setItem(LAST_COPIED_KEY, cleaned);
      sessionStorage.setItem(LAST_SNIFFED_SESSION_KEY, cleaned);
    } catch {
      // ignore storage errors
    }
    setCopyFeedback(true);
    setPasteHintVisible(false);
    setTimeout(() => setCopyFeedback(false), 1800);
    return true;
  };

  /**
   * 100% Active 3-Stage Android & WebView Paste Handler
   */
  const handlePaste = async () => {
    setPasteHintVisible(false);

    // Stage 1: Standard Async Clipboard API
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
      try {
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText.trim()) {
          if (applyPastedText(clipText)) {
            const extracted = extractUrlFromText(clipText) || clipText.trim();
            if (/^https?:\/\//i.test(extracted)) {
              onAnalyze(extracted);
            }
            return;
          }
        }
      } catch {
        // Proceed immediately to Stage 2 for Android WebView
      }
    }

    // Stage 2: Focus & Select Input + document.execCommand('paste') for Android WebView
    if (inputRef.current) {
      try {
        inputRef.current.focus();
        inputRef.current.select();
        const pasted = document.execCommand('paste');
        const currentVal = inputRef.current.value?.trim();
        if (pasted && currentVal) {
          if (applyPastedText(currentVal)) {
            onAnalyze(currentVal);
            return;
          }
        }
      } catch {
        // Proceed to Stage 3
      }
    }

    // Stage 3: Fallback to last known copied link or show friendly interactive paste helper
    try {
      const savedLast = localStorage.getItem(LAST_COPIED_KEY);
      if (savedLast && savedLast.trim() && !url.trim()) {
        applyPastedText(savedLast);
        onAnalyze(savedLast);
        return;
      }
    } catch {
      // ignore
    }

    if (inputRef.current) {
      inputRef.current.focus();
    }
    setPasteHintVisible(true);
    setTimeout(() => setPasteHintVisible(false), 6000);
  };

  const handleClear = () => {
    setUrl('');
    setPasteHintVisible(false);
    setAutoSniffedBanner(null);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && url.trim() && !isLoading) {
      onAnalyze();
    }
  };

  const handleBatchSubmit = () => {
    if (stagedBatchUrls.length === 0) return;
    if (onStartBatchDownload) {
      onStartBatchDownload(stagedBatchUrls, batchPreset);
      setBatchText('');
      setIsBatchOpen(false);
    }
  };

  const fillSampleBatchUrls = () => {
    const sampleLines = SAMPLE_URLS.slice(0, 3)
      .map((s) => s.url)
      .join('\n');
    setBatchText(sampleLines);
  };

  const activeQueueTasks = tasks.filter(
    (tItem) => tItem.status === 'downloading' || tItem.status === 'queued'
  );

  return (
    <section className="w-full max-w-4xl mx-auto px-3 sm:px-4 pt-3 sm:pt-5 pb-2 overflow-x-hidden">
      {/* Share Target notification banner */}
      {sharedLinkNotice && (
        <div className="mb-3 p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center gap-2.5 text-xs sm:text-sm text-indigo-900 dark:text-indigo-200 card-3d">
          <Share2 className="w-4 h-4 text-indigo-500 shrink-0" />
          <div className="flex-1 font-bold truncate">
            {t.urlDetectedFromShare}
          </div>
        </div>
      )}

      {/* Auto-Sniffer Live Detection Banner */}
      {autoSniffedBanner && (
        <div className="mb-3 p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-between gap-2 text-xs text-emerald-800 dark:text-emerald-200 card-3d animate-fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <Radar className="w-4 h-4 text-emerald-500 animate-spin shrink-0" />
            <span className="font-extrabold truncate">
              {isFa
                ? 'رادار هوشمند کلیپ‌بورد: لینک کپی‌شده شما به صورت خودکار شناسایی و تحلیل شد!'
                : 'Auto-Sniffer: Clipboard link automatically detected & analyzed!'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAutoSniffedBanner(null)}
            className="p-1 rounded-lg hover:bg-emerald-500/20 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Compact 3D Hero Header */}
      <div className="text-center mb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 text-[11px] font-extrabold text-slate-700 dark:text-slate-300 mb-2 card-3d">
          <span className="w-2 h-2 rounded-full dot-3d-indigo shrink-0" />
          <span>
            {isFa
              ? 'دانلودر فوق‌سریع ویدیو، موزیک و زیرنویس • یوتیوب، تیک‌تاک، اینستاگرام'
              : 'Ultra-Fast 4K Video, Audio & Subtitle Downloader'}
          </span>
        </div>
        <h1 className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-snug drop-shadow-sm text-3d px-1">
          {t.tagline}
        </h1>
      </div>

      {/* Android Clipboard Helper Tooltip when OS blocks silent read */}
      {pasteHintVisible && (
        <div className="mb-3 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/70 border border-amber-300/80 dark:border-amber-700/80 text-amber-900 dark:text-amber-200 text-xs card-3d animate-fade-in">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="font-extrabold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              {isFa
                ? 'کادر آماده است! انگشت خود را روی کادر نگه داشته و Paste را بزنید، یا یک لینک نمونه انتخاب کنید:'
                : 'Input focused! Long-press inside the box and tap Paste, or pick a quick link below:'}
            </span>
            <button
              type="button"
              onClick={() => setPasteHintVisible(false)}
              className="p-1 rounded-lg hover:bg-amber-200/50 dark:hover:bg-amber-900/50"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLE_URLS.slice(0, 3).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  applyPastedText(item.url);
                  onAnalyze(item.url);
                }}
                className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-bold text-[11px] border border-amber-300 dark:border-amber-800 shadow-xs active:translate-y-[2px] transition-all"
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main 3D Tactile Input Box Container */}
      <div className="relative space-y-2.5">
        <div className="p-2.5 sm:p-3 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 card-3d space-y-2.5 sm:space-y-0 sm:flex sm:items-center sm:gap-2">
          {/* Input Row */}
          <div className="flex items-center gap-2 flex-1 min-w-0 bg-slate-50 dark:bg-slate-950/90 border border-slate-200/80 dark:border-slate-800 rounded-2xl px-3 py-2 input-3d">
            <div className="flex items-center gap-1.5 shrink-0 pr-1 border-r border-slate-200 dark:border-slate-800">
              <PlatformIcon platform={detectedPlatform} size={18} />
            </div>

            <input
              ref={inputRef}
              type="url"
              dir="ltr"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (e.target.value.trim()) {
                  try {
                    localStorage.setItem(LAST_COPIED_KEY, e.target.value.trim());
                  } catch {
                    // ignore
                  }
                }
              }}
              onPaste={(e) => {
                const text = e.clipboardData?.getData('text');
                if (text) {
                  const extracted = extractUrlFromText(text) || text.trim();
                  try {
                    localStorage.setItem(LAST_COPIED_KEY, extracted);
                  } catch {
                    // ignore
                  }
                  if (/^https?:\/\//i.test(extracted)) {
                    setTimeout(() => onAnalyze(extracted), 120);
                  }
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={t.inputPlaceholder}
              className="w-full min-w-0 py-1 text-xs sm:text-sm bg-transparent text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none font-bold"
            />

            {url && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1.5 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors shrink-0"
                title={t.clearInput}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 3D Tactile Action Buttons: Always Active Smart Paste + 3D Analyze */}
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={handlePaste}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-black bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border-t border-white/40 dark:border-white/15 shadow-[0_4px_0_rgb(148,163,184),0_8px_14px_rgba(15,23,42,0.1)] dark:shadow-[0_4px_0_rgb(15,23,42),0_8px_14px_rgba(0,0,0,0.45)] active:translate-y-[3px] active:shadow-[0_1px_0_rgb(148,163,184)] transition-all duration-150 shrink-0"
              title={t.pasteClipboard}
            >
              {copyFeedback ? (
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <Clipboard className="w-4 h-4 text-indigo-500 shrink-0" />
              )}
              <span>{copyFeedback ? (isFa ? 'جای‌گذاری شد' : 'Pasted!') : t.pasteClipboard}</span>
            </button>

            <button
              type="button"
              onClick={() => onAnalyze()}
              disabled={!url.trim() || isLoading}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-black text-white bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 border-t border-white/25 shadow-[0_5px_0_rgb(76,29,149),0_10px_20px_rgba(124,58,237,0.3)] active:translate-y-[3px] active:shadow-[0_2px_0_rgb(76,29,149)] disabled:opacity-55 disabled:cursor-not-allowed transition-all duration-150"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span className="truncate">{t.analyzing}</span>
                </>
              ) : (
                <>
                  <span className="drop-shadow-xs">{t.analyzeButton}</span>
                  <ArrowRight className={`w-4 h-4 shrink-0 ${isFa ? 'rotate-180' : ''}`} />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Minimal Toolbar Row: Dedicated Batch Queue Trigger (Auto-Paste button removed to keep home screen clean) */}
        {onStartBatchDownload && (
          <div className="flex items-center justify-between gap-2 px-1">
            <button
              type="button"
              onClick={() => setIsBatchOpen(!isBatchOpen)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-black bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-300 border border-indigo-500/35 btn-3d-secondary active:translate-y-[2px] transition-all"
            >
              <ListPlus className="w-4 h-4 text-indigo-500 shrink-0" />
              <span>
                {isFa ? 'دانلود دسته‌جمعی (Batch Queue)' : 'Batch Download Queue'}
              </span>
              {(stagedBatchUrls.length > 0 || activeQueueTasks.length > 0) && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-600 text-white">
                  {isFa
                    ? toPersianDigits(stagedBatchUrls.length || activeQueueTasks.length)
                    : stagedBatchUrls.length || activeQueueTasks.length}
                </span>
              )}
            </button>

            {activeQueueTasks.length > 0 && (
              <div className="text-[11px] font-extrabold text-indigo-600 dark:text-indigo-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                <span>
                  {isFa
                    ? `${toPersianDigits(activeQueueTasks.length)} فایل در صف فعال`
                    : `${activeQueueTasks.length} in active queue`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Expandable Batch Queue Multi-Link Drawer with Ordered Numbered List (۱، ۲، ۳...) & Distinct Statuses */}
        {isBatchOpen && onStartBatchDownload && (
          <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-indigo-500/40 card-3d space-y-3.5 animate-fade-in">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-500">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                    {isFa ? 'فهرست صف دانلود دسته‌جمعی (Batch Queue)' : 'Numbered Batch Download Queue'}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isFa
                      ? 'لینک‌ها را در خطوط جداگانه وارد کنید؛ فهرست به صورت شماره‌گذاری‌شده (۱، ۲، ۳...) و به نوبت دانلود می‌شود'
                      : 'Paste multiple links (one per line) to queue and download sequentially'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={fillSampleBatchUrls}
                className="px-2.5 py-1.5 rounded-xl text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 hover:bg-slate-200 btn-3d-secondary shrink-0"
              >
                {isFa ? '+ درج ۳ لینک نمونه' : '+ Load 3 Sample Links'}
              </button>
            </div>

            <textarea
              rows={3}
              dir="ltr"
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder={
                isFa
                  ? 'https://www.youtube.com/watch?v=...\nhttps://www.tiktok.com/@user/video/...\nhttps://www.instagram.com/reel/...'
                  : 'Paste one URL per line...'
              }
              className="w-full p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 input-3d"
            />

            {/* Ordered Numbered List (۱، ۲، ۳...) of Staged Links & Active Queue Items with Distinct Statuses */}
            {(stagedBatchUrls.length > 0 || tasks.length > 0) && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-[11px] font-black text-slate-600 dark:text-slate-300 px-1">
                  <span>
                    {isFa
                      ? 'فهرست شماره‌گذاری‌شده صف لینک‌ها (وضعیت لحظه‌ای):'
                      : 'Numbered Queue List (Live Status):'}
                  </span>
                  <span className="text-indigo-500">
                    {isFa
                      ? `${toPersianDigits(stagedBatchUrls.length + tasks.slice(0, 5).length)} مورد`
                      : `${stagedBatchUrls.length + tasks.slice(0, 5).length} items`}
                  </span>
                </div>

                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                  {/* 1. Staged Links Ready to Queue */}
                  {stagedBatchUrls.map((stagedUrl, idx) => {
                    const itemNumber = idx + 1;
                    const plat = detectPlatform(stagedUrl);
                    return (
                      <div
                        key={`staged-${idx}-${stagedUrl}`}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="w-6 h-6 rounded-xl bg-indigo-600 text-white font-black text-[11px] flex items-center justify-center shrink-0 shadow-xs">
                            {isFa ? toPersianDigits(itemNumber) : itemNumber}
                          </span>
                          <PlatformIcon platform={plat} size={15} />
                          <span className="font-mono text-[11px] text-slate-700 dark:text-slate-200 truncate" dir="ltr">
                            {stagedUrl}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{isFa ? 'در انتظار' : 'Waiting'}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => removeStagedBatchUrl(idx)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-200/50 dark:hover:bg-slate-800"
                            title={isFa ? 'حذف از صف' : 'Remove'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* 2. Existing Queue Tasks (Downloading / Queued / Completed) */}
                  {tasks.slice(0, 5).map((taskItem, idx) => {
                    const itemNumber = stagedBatchUrls.length + idx + 1;
                    const isDownloading = taskItem.status === 'downloading';
                    const isQueued = taskItem.status === 'queued';
                    const isCompleted = taskItem.status === 'completed';

                    return (
                      <div
                        key={taskItem.id}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="w-6 h-6 rounded-xl bg-slate-800 dark:bg-slate-800 text-indigo-400 font-black text-[11px] flex items-center justify-center shrink-0 border border-indigo-500/30">
                            {isFa ? toPersianDigits(itemNumber) : itemNumber}
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
                                  ? `در حال دانلود (${toPersianDigits(taskItem.progressPercent)}٪)`
                                  : `Downloading (${taskItem.progressPercent}%)`}
                              </span>
                            </span>
                          ) : isQueued ? (
                            <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>{isFa ? 'در انتظار نوبت' : 'Queued'}</span>
                            </span>
                          ) : isCompleted ? (
                            <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{isFa ? 'تکمیل شده' : 'Completed'}</span>
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
                  {isFa ? 'کیفیت پیش‌فرض صف:' : 'Queue Quality:'}
                </span>
                {[
                  { id: '1080p', label: '1080p Full HD' },
                  { id: '720p', label: '720p HD' },
                  { id: 'mp3', label: 'MP3 320kbps' }
                ].map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setBatchPreset(q.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                      batchPreset === q.id
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
                onClick={handleBatchSubmit}
                disabled={stagedBatchUrls.length === 0}
                className="px-4 py-2 rounded-xl text-xs font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 btn-3d-primary disabled:opacity-50 flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  {isFa
                    ? `شروع دانلود نوبتی (${toPersianDigits(stagedBatchUrls.length)} لینک)`
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
