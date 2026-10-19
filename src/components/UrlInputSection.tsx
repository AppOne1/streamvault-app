import React, { useState } from 'react';
import { ArrowRight, Clipboard, Sparkles, X, Loader2, Share2 } from 'lucide-react';
import { Language, PlatformId } from '../types';
import { detectPlatform } from '../services/platformDetector';
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

export const UrlInputSection: React.FC<UrlInputSectionProps> = ({
  language,
  url,
  setUrl,
  isLoading,
  onAnalyze,
  sharedLinkNotice
}) => {
  const t = getTranslation(language);
  const detectedPlatform: PlatformId = url.trim() ? detectPlatform(url) : 'generic';
  const [copyFeedback, setCopyFeedback] = useState(false);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 1500);
      }
    } catch {
      // Fallback
    }
  };

  const handleClear = () => {
    setUrl('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && url.trim() && !isLoading) {
      onAnalyze();
    }
  };

  return (
    <section className="w-full max-w-4xl mx-auto px-4 pt-6 pb-2">
      {/* Share Target notification banner */}
      {sharedLinkNotice && (
        <div className="mb-4 p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center gap-3 text-sm text-indigo-900 dark:text-indigo-200 card-3d animate-pulse">
          <Share2 className="w-5 h-5 text-indigo-500 shrink-0" />
          <div className="flex-1 font-bold">
            {t.urlDetectedFromShare}
          </div>
        </div>
      )}

      {/* Hero Badge & Headings */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 mb-3.5 card-3d">
          <span className="w-2 h-2 rounded-full dot-3d-indigo" />
          <span>{language === 'fa' ? 'موتور استخراج فوق‌سریع مدیا و ویدیو 4K' : 'Cross-Platform 4K Stream Extraction'}</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-snug text-3d">
          {t.tagline}
        </h1>
      </div>

      {/* Main Input Box Container */}
      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-3xl blur-md opacity-20 group-focus-within:opacity-60 transition duration-500 pointer-events-none" />
        
        <div className="relative flex flex-col sm:flex-row items-center gap-2 p-2.5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 card-3d">
          {/* Detected Platform Indicator */}
          <div className="flex items-center gap-2 px-3.5 py-2 shrink-0 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 shadow-xs">
            <PlatformIcon platform={detectedPlatform} size={22} />
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              {detectedPlatform}
            </span>
          </div>

          {/* Text Input */}
          <div className="relative flex-1 w-full">
            <input
              type="text"
              dir="ltr"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t.inputPlaceholder}
              className="w-full px-3 py-2.5 text-sm sm:text-base bg-transparent text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none font-mono"
            />
          </div>

          {/* Action Buttons inside input */}
          <div className="flex items-center gap-1.5 self-end sm:self-auto w-full sm:w-auto justify-end">
            {url && (
              <button
                onClick={handleClear}
                className="p-2.5 rounded-2xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title={t.clearInput}
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={handlePaste}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors active:scale-95 btn-3d-secondary"
              title={t.pasteClipboard}
            >
              <Clipboard className="w-3.5 h-3.5 text-indigo-500" />
              <span>{copyFeedback ? '✓' : t.pasteClipboard}</span>
            </button>

            <button
              onClick={() => onAnalyze()}
              disabled={!url.trim() || isLoading}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-extrabold text-white bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 disabled:cursor-not-allowed btn-3d-primary active:scale-95 transition-all"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t.analyzing}</span>
                </>
              ) : (
                <>
                  <span>{t.analyzeButton}</span>
                  <ArrowRight className={`w-4 h-4 ${language === 'fa' ? 'rotate-180' : ''}`} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
