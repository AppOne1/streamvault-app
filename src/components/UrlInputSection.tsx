import React, { useRef, useState } from 'react';
import { ArrowRight, Clipboard, Check, X, Loader2, Share2, Sparkles } from 'lucide-react';
import { Language, PlatformId } from '../types';
import { detectPlatform, extractUrlFromText, SAMPLE_URLS } from '../services/platformDetector';
import { PlatformIcon } from './PlatformIcon';
import { getTranslation } from '../i18n/translations';

interface UrlInputSectionProps {
  language: Language;
  url: string;
  setUrl: (url: string) => void;
  isLoading: boolean;
  onAnalyze: (targetUrl?: string) => void;
  sharedLinkNotice: boolean;
}

const LAST_COPIED_KEY = 'onedownload_last_copied_url';

export const UrlInputSection: React.FC<UrlInputSectionProps> = ({
  language,
  url,
  setUrl,
  isLoading,
  onAnalyze,
  sharedLinkNotice
}) => {
  const t = getTranslation(language);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const detectedPlatform: PlatformId = url.trim() ? detectPlatform(url) : 'generic';
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [pasteHintVisible, setPasteHintVisible] = useState(false);

  const applyPastedText = (rawText: string) => {
    const cleaned = extractUrlFromText(rawText) || rawText.trim();
    if (!cleaned) return false;
    setUrl(cleaned);
    try {
      localStorage.setItem(LAST_COPIED_KEY, cleaned);
    } catch {
      // ignore storage errors
    }
    setCopyFeedback(true);
    setPasteHintVisible(false);
    setTimeout(() => setCopyFeedback(false), 1800);
    return true;
  };

  /**
   * 100% Active 3-Stage Android & WebView Paste Handler:
   * 1. Attempts navigator.clipboard.readText()
   * 2. If blocked in Android WebView, focuses & selects inputRef and runs document.execCommand('paste')
   * 3. If still empty, restores last copied URL or displays an interactive helper banner above input
   */
  const handlePaste = async () => {
    setPasteHintVisible(false);

    // Stage 1: Standard Async Clipboard API
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
      try {
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText.trim()) {
          if (applyPastedText(clipText)) return;
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
          if (applyPastedText(currentVal)) return;
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
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && url.trim() && !isLoading) {
      onAnalyze();
    }
  };

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

      {/* Compact 3D Hero Header */}
      <div className="text-center mb-4 sm:mb-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 text-[11px] font-extrabold text-slate-700 dark:text-slate-300 mb-2.5 card-3d">
          <span className="w-2 h-2 rounded-full dot-3d-indigo shrink-0" />
          <span>
            {language === 'fa'
              ? 'دانلودر فوق‌سریع ویدیو و موزیک • یوتیوب، تیک‌تاک، اینستاگرام'
              : 'Ultra-Fast 4K Video & Music Downloader'}
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
              {language === 'fa'
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
      <div className="relative">
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
                  try {
                    localStorage.setItem(LAST_COPIED_KEY, text.trim());
                  } catch {
                    // ignore
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

          {/* 3D Tactile Action Buttons: Always Active Paste + 3D Analyze */}
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
              <span>{copyFeedback ? (language === 'fa' ? 'جای‌گذاری شد' : 'Pasted!') : t.pasteClipboard}</span>
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
                  <ArrowRight className={`w-4 h-4 shrink-0 ${language === 'fa' ? 'rotate-180' : ''}`} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
