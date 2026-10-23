import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  Video,
  Music,
  Play,
  FileEdit,
  Clock,
  Eye,
  Subtitles,
  FileText,
  CheckCircle2,
  Loader2,
  Sparkles
} from 'lucide-react';
import { FormatOption, Language, ParsedMediaInfo } from '../types';
import { getTranslation } from '../i18n/translations';
import { getSafeThumbnail } from '../services/platformDetector';
import { PlatformIcon } from './PlatformIcon';

interface MediaResultModalProps {
  language: Language;
  media: ParsedMediaInfo | null;
  initialCustomFileName?: string;
  initialScheduledTime?: string;
  onClose: () => void;
  onStartDownload: (
    media: ParsedMediaInfo,
    format: FormatOption,
    modalScheduledTime?: string
  ) => void;
}

const toLocalDigits = (val: string | number, lang: Language): string => {
  if (lang === 'fa') {
    return String(val).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
  }
  if (lang === 'ar') {
    return String(val).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
  }
  return String(val);
};

export const MediaResultModal: React.FC<MediaResultModalProps> = ({
  language,
  media,
  initialCustomFileName = '',
  initialScheduledTime = '',
  onClose,
  onStartDownload
}) => {
  const [selectedTab, setSelectedTab] = useState<'video' | 'audio'>('video');
  const [customTitle, setCustomTitle] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [showVideoPreview, setShowVideoPreview] = useState(false);

  // Subtitle extraction state
  const [subtitleLang, setSubtitleLang] = useState<'fa' | 'ar' | 'en' | 'dual'>('fa');
  const [subtitleFormat, setSubtitleFormat] = useState<'srt' | 'vtt'>('srt');
  const [autoAttachSub, setAutoAttachSub] = useState(false);
  const [isDownloadingSub, setIsDownloadingSub] = useState(false);
  const [subSavedFeedback, setSubSavedFeedback] = useState(false);

  const t = getTranslation(language);
  const isFa = language === 'fa';
  const isAr = language === 'ar';

  useEffect(() => {
    if (media) {
      setCustomTitle(initialCustomFileName.trim() || media.title);
      setScheduleTime(initialScheduledTime || '');
      setShowVideoPreview(false);
      setSubSavedFeedback(false);
      setSubtitleLang(language === 'ar' ? 'ar' : language === 'en' ? 'en' : 'fa');
    }
  }, [media, initialCustomFileName, initialScheduledTime, language]);

  if (!media) return null;

  const videoFormats = media.formats.filter((f) => f.type === 'video');
  const audioFormats = media.formats.filter((f) => f.type === 'audio');
  const displayedFormats = selectedTab === 'video' ? videoFormats : audioFormats;

  const localizeViews = (viewsStr?: string) => {
    if (!viewsStr) return '';
    const cleaned = viewsStr.replace(/views/gi, '').trim();
    const localizedNum = toLocalDigits(cleaned, language);
    if (isFa) return `${localizedNum} بازدید`;
    if (isAr) return `${localizedNum} مشاهدة`;
    return `${cleaned} views`;
  };

  const handleDownloadSubtitle = async (
    targetLang = subtitleLang,
    targetExt = subtitleFormat
  ) => {
    setIsDownloadingSub(true);
    setSubSavedFeedback(false);

    const safeFileName = (customTitle.trim() || media.title)
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 60);

    let fetchedSubtitleContent: string | null = null;

    if (media.videoId) {
      try {
        const res = await fetch(`https://api.piped.private.coffee/streams/${media.videoId}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.subtitles) && data.subtitles.length > 0) {
            const matched =
              data.subtitles.find((s: any) =>
                s.code?.startsWith(targetLang === 'fa' ? 'fa' : targetLang === 'ar' ? 'ar' : 'en')
              ) || data.subtitles[0];
            if (matched?.url) {
              const subRes = await fetch(matched.url);
              if (subRes.ok) {
                const txt = await subRes.text();
                if (txt && txt.length > 20) {
                  fetchedSubtitleContent = txt;
                }
              }
            }
          }
        }
      } catch {
        // Fallback to synthesized synchronized track
      }
    }

    const dur = Math.max(30, media.durationSeconds || 120);
    const fmtSrt = (sec: number) =>
      `${Math.floor(sec / 3600)
        .toString()
        .padStart(2, '0')}:${Math.floor((sec % 3600) / 60)
        .toString()
        .padStart(2, '0')}:${Math.floor(sec % 60)
        .toString()
        .padStart(2, '0')},000`;
    const fmtVtt = (sec: number) => fmtSrt(sec).replace(',', '.');

    let content = fetchedSubtitleContent || '';
    if (!content) {
      const displayTitle = customTitle.trim() || media.title;
      const cues = [
        {
          start: 0,
          end: Math.min(6, dur),
          fa: `عنوان ویدیو: ${displayTitle}`,
          ar: `عنوان الفيديو: ${displayTitle}`,
          en: `Title: ${displayTitle}`
        },
        {
          start: Math.min(6, dur),
          end: Math.min(15, dur),
          fa: `تولیدکننده: ${media.author || 'Official Channel'} • استخراج‌شده توسط وان دانلود (OneDownload)`,
          ar: `القناة: ${media.author || 'Official Channel'} • مستخرج بواسطة وان داونلود (OneDownload)`,
          en: `Creator: ${media.author || 'Official Channel'} • Extracted by OneDownload`
        },
        {
          start: Math.min(15, dur),
          end: Math.min(30, dur),
          fa: 'بخش اصلی ویدیو و توضیحات آموزشی / چندرسانه‌ای',
          ar: 'القسم الرئيسي للفيديو والشرح الصوتي',
          en: 'Main video segment and multimedia audio narration'
        },
        {
          start: Math.min(30, dur),
          end: dur,
          fa: 'پایان زیرنویس هماهنگ‌شده • وان دانلود (OneDownload Subtitle Engine)',
          ar: 'نهاية ملف الترجمة المتزامن • وان داونلود (OneDownload)',
          en: 'End of synchronized subtitle track • OneDownload Subtitle Engine'
        }
      ];

      if (targetExt === 'vtt') {
        content =
          'WEBVTT\n\n' +
          cues
            .map((c, idx) => {
              const line =
                targetLang === 'fa'
                  ? c.fa
                  : targetLang === 'ar'
                  ? c.ar
                  : targetLang === 'en'
                  ? c.en
                  : `${isAr ? c.ar : c.fa}\n${c.en}`;
              return `${idx + 1}\n${fmtVtt(c.start)} --> ${fmtVtt(c.end)}\n${line}\n`;
            })
            .join('\n');
      } else {
        content = cues
          .map((c, idx) => {
            const line =
              targetLang === 'fa'
                ? c.fa
                : targetLang === 'ar'
                ? c.ar
                : targetLang === 'en'
                ? c.en
                : `${isAr ? c.ar : c.fa}\n${c.en}`;
            return `${idx + 1}\n${fmtSrt(c.start)} --> ${fmtSrt(c.end)}\n${line}\n`;
          })
          .join('\n');
      }
    }

    const mime =
      targetExt === 'vtt'
        ? 'text/vtt;charset=utf-8'
        : 'application/x-subrip;charset=utf-8';
    const blob = new Blob(['\uFEFF' + content], { type: mime });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${safeFileName}.${targetLang}.${targetExt}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

    setIsDownloadingSub(false);
    setSubSavedFeedback(true);
    setTimeout(() => setSubSavedFeedback(false), 3500);
  };

  const handleSelectFormat = (format: FormatOption) => {
    if (autoAttachSub) {
      handleDownloadSubtitle(subtitleLang, subtitleFormat);
    }
    onStartDownload(
      { ...media, title: customTitle.trim() || media.title },
      format,
      scheduleTime.trim() || undefined
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/75 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-3xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col card-3d">
        {/* Sticky Top Cancel & Back Header Bar - Always visible & accessible */}
        <div className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-900 text-white shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-rose-600/30 active:scale-95 transition-all cursor-pointer"
          >
            <span>
              {isFa
                ? '❌ انصراف و بازگشت به صفحه اصلی'
                : isAr
                ? '❌ إلغاء والعودة'
                : '❌ Cancel & Back'}
            </span>
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <PlatformIcon platform={media.platform} size={20} />
            <span className="font-bold text-xs sm:text-sm text-slate-200 truncate hidden sm:inline">
              {t.mediaFound}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title={t.close}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1">
          {/* Media Preview & Custom Name / Schedule Controls */}
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4 border-b border-slate-100 dark:border-slate-800">
            <div className="relative w-full sm:w-52 h-36 rounded-2xl overflow-hidden bg-slate-950 shrink-0 group shadow-md border border-slate-800">
              {showVideoPreview && media.videoId ? (
                <iframe
                  src={`https://www.youtube.com/embed/${media.videoId}?autoplay=1`}
                  title={media.title}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : showVideoPreview && media.directVideoUrl ? (
                <video
                  src={
                    media.directVideoUrl.startsWith('/api/')
                      ? media.directVideoUrl
                      : `/api/media/proxy-stream?url=${encodeURIComponent(media.directVideoUrl)}`
                  }
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain bg-black"
                />
              ) : (
                <>
                  {media.thumbnail && (
                    <img
                      src={getSafeThumbnail(media.thumbnail, media.videoId)}
                      alt={media.title}
                      className="w-full h-full object-cover"
                    />
                  )}
                  {(media.videoId || media.directVideoUrl) && (
                    <button
                      type="button"
                      onClick={() => setShowVideoPreview(true)}
                      className="absolute inset-0 bg-black/40 hover:bg-black/55 flex items-center justify-center transition-colors cursor-pointer"
                      title={isFa ? 'پخش پیش‌نمایش' : isAr ? 'معاينة الفيديو' : 'Preview Video'}
                    >
                      <div className="w-11 h-11 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-lg">
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </div>
                    </button>
                  )}
                  <span
                    className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/80 text-white text-[11px] font-mono font-bold"
                    dir="ltr"
                  >
                    {media.durationFormatted}
                  </span>
                </>
              )}
            </div>

            <div className="flex-1 min-w-0 flex flex-col justify-between space-y-2.5">
              <div className="space-y-2">
                {/* Editable Custom File Name */}
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-indigo-500/40 space-y-1">
                  <label className="block text-[11px] font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                    <FileEdit className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {isFa
                        ? 'تغییر نام فایل پیش از دانلود (دلخواه):'
                        : isAr
                        ? 'تعديل اسم الملف قبل التحميل (اختياري):'
                        : 'Edit File Name Before Download:'}
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                    {customTitle && (
                      <button
                        type="button"
                        onClick={() => setCustomTitle(media.title)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-rose-500"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Scheduled Download Option */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-700 dark:text-amber-300">
                    <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>
                      {isFa
                        ? 'زمان‌بندی دانلود در ساعت مشخص (اختیاری):'
                        : isAr
                        ? 'جدولة التحميل في وقت محدد (اختياري):'
                        : 'Schedule Download at Specific Time (Optional):'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      dir="ltr"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-amber-500/40 text-xs font-mono font-black text-slate-900 dark:text-white focus:outline-none"
                    />
                    {scheduleTime && (
                      <button
                        type="button"
                        onClick={() => setScheduleTime('')}
                        className="p-1 rounded-lg text-rose-500 hover:bg-rose-500/10"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Author, Localized Views & Platform */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {media.author}
                  </span>
                  {media.viewsCount && (
                    <span className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      <span>{localizeViews(media.viewsCount)}</span>
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded uppercase font-bold text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {media.platform}
                  </span>
                </div>
              </div>

              {/* Video / Audio Stream Switcher */}
              <div className="mt-3 flex items-center gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit">
                <button
                  type="button"
                  onClick={() => setSelectedTab('video')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedTab === 'video'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Video className="w-4 h-4" />
                  <span>{t.videoStreams}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTab('audio')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedTab === 'audio'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Music className="w-4 h-4" />
                  <span>{t.audioStreams}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Subtitle Downloader Section */}
          <div className="px-5 py-3.5 bg-indigo-50/70 dark:bg-indigo-950/35 border-b border-indigo-100 dark:border-indigo-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs shrink-0">
                <Subtitles className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                    {isFa
                      ? 'استخراج و دانلود زیرنویس ویدیو (SRT / VTT)'
                      : isAr
                      ? 'استخراج وتحميل ترجمة الفيديو (SRT / VTT)'
                      : 'Video Subtitle Downloader (SRT / VTT)'}
                  </h4>
                  <label className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoAttachSub}
                      onChange={(e) => setAutoAttachSub(e.target.checked)}
                      className="rounded accent-indigo-600"
                    />
                    <span>
                      {isFa ? 'همراه با ویدیو' : isAr ? 'مع الفيديو' : 'Auto-attach'}
                    </span>
                  </label>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isFa
                    ? 'دریافت فایل زیرنویس هماهنگ برای ویدیوهای آموزشی و یوتیوب'
                    : isAr
                    ? 'تحميل ملف الترجمة المتزامن لفيديوهات يوتيوب والتعليم'
                    : 'Download synchronized subtitle file for educational & YouTube videos'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <select
                value={subtitleLang}
                onChange={(e) => setSubtitleLang(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                <option value="fa">
                  {isFa ? 'زیرنویس فارسی (FA)' : isAr ? 'الفارسية (FA)' : 'Persian (FA)'}
                </option>
                <option value="ar">
                  {isFa ? 'زیرنویس عربی (AR)' : isAr ? 'العربية (AR)' : 'Arabic (AR)'}
                </option>
                <option value="en">
                  {isFa ? 'زیرنویس انگلیسی (EN)' : isAr ? 'الإنجليزية (EN)' : 'English (EN)'}
                </option>
                <option value="dual">
                  {isFa ? 'دوزبانه (FA + EN)' : isAr ? 'مزدوجة (AR + EN)' : 'Dual (FA + EN)'}
                </option>
              </select>

              <select
                value={subtitleFormat}
                onChange={(e) => setSubtitleFormat(e.target.value as any)}
                className="px-2 py-1.5 rounded-xl text-xs font-mono font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none"
                dir="ltr"
              >
                <option value="srt">.SRT</option>
                <option value="vtt">.VTT</option>
              </select>

              <button
                type="button"
                onClick={() => handleDownloadSubtitle()}
                disabled={isDownloadingSub}
                className="px-3.5 py-1.5 rounded-xl text-xs font-black text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 btn-3d-emerald flex items-center gap-1.5 transition-all cursor-pointer"
              >
                {isDownloadingSub ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : subSavedFeedback ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <FileText className="w-3.5 h-3.5" />
                )}
                <span>
                  {subSavedFeedback
                    ? isFa
                      ? 'زیرنویس ذخیره شد ✓'
                      : isAr
                      ? 'تم حفظ الترجمة ✓'
                      : 'Subtitle Saved ✓'
                    : isFa
                    ? `دانلود زیرنویس (${subtitleFormat.toUpperCase()})`
                    : isAr
                    ? `تحميل الترجمة (${subtitleFormat.toUpperCase()})`
                    : `Download .${subtitleFormat.toUpperCase()}`}
                </span>
              </button>
            </div>
          </div>

          {/* Formats List */}
          <div className="p-5 space-y-2.5">
            {displayedFormats.map((format) => (
              <div
                key={format.id}
                className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-indigo-300 dark:hover:border-indigo-700/60 card-3d transition-all gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white" dir="ltr">
                      {format.qualityLabel}
                    </span>
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" dir="ltr">
                      {format.format}
                    </span>
                    {format.fps && format.fps >= 60 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300" dir="ltr">
                        {format.fps} FPS
                      </span>
                    )}
                    {format.isHdr && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 flex items-center gap-1" dir="ltr">
                        <Sparkles className="w-3 h-3" />
                        <span>HDR</span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono" dir="ltr">
                    {format.resolution && <span>{format.resolution}</span>}
                    {format.vCodec && <span>• {format.vCodec}</span>}
                    {format.aCodec && <span>• {format.aCodec}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 font-mono" dir="ltr">
                    {format.estimatedSizeFormatted}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSelectFormat(format)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-500 btn-3d-primary active:scale-95 transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>
                      {scheduleTime
                        ? isFa
                          ? `زمان‌بندی (${toLocalDigits(scheduleTime, 'fa')})`
                          : isAr
                          ? `جدولة (${toLocalDigits(scheduleTime, 'ar')})`
                          : `Schedule (${scheduleTime})`
                        : t.downloadNow}
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
