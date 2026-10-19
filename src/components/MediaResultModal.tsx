import React, { useState, useEffect } from 'react';
import { Download, Film, Music, X, Sparkles, Eye, Clock, Edit2, Check, Play } from 'lucide-react';
import { FormatOption, Language, ParsedMediaInfo } from '../types';
import { PlatformIcon } from './PlatformIcon';
import { getTranslation } from '../i18n/translations';
import { getSafeThumbnail } from '../services/platformDetector';

interface MediaResultModalProps {
  language: Language;
  media: ParsedMediaInfo | null;
  onClose: () => void;
  onStartDownload: (media: ParsedMediaInfo, format: FormatOption) => void;
}

export const MediaResultModal: React.FC<MediaResultModalProps> = ({
  language,
  media,
  onClose,
  onStartDownload
}) => {
  const [activeTab, setActiveTab] = useState<'video' | 'audio'>('video');
  const [editableTitle, setEditableTitle] = useState<string>('');
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);
  const t = getTranslation(language);

  useEffect(() => {
    if (media) {
      setEditableTitle(media.title);
      setIsEditingTitle(false);
      setIsPlayingPreview(false);
    }
  }, [media]);

  if (!media) return null;

  const videoStreams = media.formats.filter((f) => f.type === 'video');
  const audioStreams = media.formats.filter((f) => f.type === 'audio');
  const displayedStreams = activeTab === 'video' ? videoStreams : audioStreams;

  const handleDownload = (fmt: FormatOption) => {
    const customizedMedia: ParsedMediaInfo = {
      ...media,
      title: editableTitle.trim() || media.title
    };
    onStartDownload(customizedMedia, fmt);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-8">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <PlatformIcon platform={media.platform} size={22} />
            <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
              {t.mediaFound}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Media Overview Card */}
        <div className="p-5 flex flex-col sm:flex-row gap-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30">
          <div className="relative w-full sm:w-56 aspect-video rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0 shadow-inner">
            {isPlayingPreview && media.videoId ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${media.videoId}?autoplay=1&rel=0`}
                title={media.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (media.thumbnail || media.videoId) ? (
              <>
                <div className="absolute inset-0 flex items-center justify-center text-slate-500 bg-slate-800">
                  <PlatformIcon platform={media.platform} size={36} />
                </div>
                <img
                  src={getSafeThumbnail(media.thumbnail, media.videoId)}
                  alt={editableTitle || media.title}
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                {/* Watch live preview overlay */}
                {media.videoId && (
                  <button
                    onClick={() => setIsPlayingPreview(true)}
                    className="absolute inset-0 bg-black/40 hover:bg-black/60 transition-colors flex flex-col items-center justify-center gap-1.5 text-white group"
                  >
                    <div className="w-10 h-10 rounded-full bg-indigo-600 group-hover:scale-110 flex items-center justify-center shadow-lg transition-transform">
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    </div>
                    <span className="text-[11px] font-bold tracking-tight bg-black/70 px-2 py-0.5 rounded-md">
                      {language === 'fa' ? 'پیش‌نمایش زنده ویدیو' : 'Watch Preview'}
                    </span>
                  </button>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-500 bg-slate-800">
                <Film className="w-8 h-8" />
              </div>
            )}
            {!isPlayingPreview && (
              <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-xs text-[11px] font-mono font-medium text-white flex items-center gap-1 pointer-events-none">
                <Clock className="w-3 h-3" />
                <span>{media.durationFormatted}</span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-between">
            <div>
              {/* Editable Media Title */}
              <div className="mb-2">
                {isEditingTitle ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editableTitle}
                      onChange={(e) => setEditableTitle(e.target.value)}
                      className="w-full px-2.5 py-1 text-sm font-bold rounded-lg border border-indigo-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => setIsEditingTitle(false)}
                      className="p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2 group">
                    <h4 className="font-extrabold text-slate-900 dark:text-white text-base sm:text-lg line-clamp-2">
                      {editableTitle || media.title}
                    </h4>
                    <button
                      onClick={() => setIsEditingTitle(true)}
                      className="p-1 rounded-md text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 opacity-70 group-hover:opacity-100 transition-opacity shrink-0"
                      title="ویرایش عنوان / Edit Title"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {media.author}
                </span>
                {media.viewsCount && (
                  <span className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" />
                    <span>{media.viewsCount}</span>
                  </span>
                )}
                <span className="px-2 py-0.5 rounded uppercase font-bold text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {media.platform}
                </span>
              </div>
            </div>

            {/* Stream Category Selector Tabs */}
            <div className="mt-4 flex items-center gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit">
              <button
                onClick={() => setActiveTab('video')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'video'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Film className="w-4 h-4" />
                <span>{t.videoStreams}</span>
              </button>
              <button
                onClick={() => setActiveTab('audio')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'audio'
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

        {/* Stream Formats List / Table */}
        <div className="p-5 max-h-[380px] overflow-y-auto space-y-2.5">
          {displayedStreams.map((fmt) => (
            <div
              key={fmt.id}
              className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-indigo-300 dark:hover:border-indigo-700/60 card-3d transition-all gap-3"
            >
              {/* Quality & Codec Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                    {fmt.qualityLabel}
                  </span>
                  
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {fmt.format}
                  </span>

                  {fmt.fps && fmt.fps >= 60 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
                      {fmt.fps} FPS
                    </span>
                  )}

                  {fmt.isHdr && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      <span>HDR</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
                  {fmt.resolution && <span>{fmt.resolution}</span>}
                  {fmt.vCodec && <span>• {fmt.vCodec}</span>}
                  {fmt.aCodec && <span>• {fmt.aCodec}</span>}
                </div>
              </div>

              {/* File size & Action */}
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                  {fmt.estimatedSizeFormatted}
                </span>

                <button
                  onClick={() => handleDownload(fmt)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-500 btn-3d-primary active:scale-95 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t.downloadNow}</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};
