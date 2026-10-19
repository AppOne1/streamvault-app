import React, { useState } from 'react';
import { Play, Download, Flame, Music, Film, Sparkles } from 'lucide-react';
import { DownloadTask, FormatOption, Language, ParsedMediaInfo, PlatformId } from '../types';
import { PlatformIcon } from './PlatformIcon';

export interface TrendingMediaItem {
  id: string;
  titleFa: string;
  titleEn: string;
  creator: string;
  platform: PlatformId;
  type: 'video' | 'audio';
  qualityLabel: string;
  durationFormatted: string;
  durationSeconds: number;
  sizeBytes: number;
  sizeFormatted: string;
  thumbnail: string;
  directStreamUrl: string;
  originalUrl: string;
  videoId?: string;
}

export const TRENDING_ITEMS: TrendingMediaItem[] = [
  {
    id: 'trend-vid-1',
    titleFa: 'تیزر سینمایی طبیعت و هیجان 4K HDR',
    titleEn: 'Cinematic Nature & Adventure 4K HDR',
    creator: 'OneDownload Studio',
    platform: 'youtube',
    type: 'video',
    qualityLabel: '1080p Full HD',
    durationFormatted: '00:15',
    durationSeconds: 15,
    sizeBytes: 2498235,
    sizeFormatted: '2.5 MB',
    thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=640&q=80',
    directStreamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    originalUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
  },
  {
    id: 'trend-vid-2',
    titleFa: 'کلیپ وایرال تیک‌تاک — سفر در دل کوهستان',
    titleEn: 'Viral Mountain Escape Clip (No Watermark)',
    creator: '@travel_vibes',
    platform: 'tiktok',
    type: 'video',
    qualityLabel: '1080p HD',
    durationFormatted: '00:15',
    durationSeconds: 15,
    sizeBytes: 2299653,
    sizeFormatted: '2.3 MB',
    thumbnail: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=640&q=80',
    directStreamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    originalUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'
  },
  {
    id: 'trend-vid-3',
    titleFa: 'ریلز اینستاگرام — لحظات شاد و پرانرژی',
    titleEn: 'Instagram Reels — High Energy Highlights',
    creator: '@insta_reels_hd',
    platform: 'instagram',
    type: 'video',
    qualityLabel: '1080p Full HD',
    durationFormatted: '00:15',
    durationSeconds: 15,
    sizeBytes: 2719790,
    sizeFormatted: '2.7 MB',
    thumbnail: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=640&q=80',
    directStreamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoy.mp4',
    originalUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoy.mp4'
  },
  {
    id: 'trend-aud-1',
    titleFa: 'موزیک بیکلام سینث‌ویو شبانه (320kbps اصلی)',
    titleEn: 'Midnight Synthwave Instrumental (320kbps HQ)',
    creator: 'SoundHelix Studio',
    platform: 'soundcloud',
    type: 'audio',
    qualityLabel: '320 kbps Studio HQ',
    durationFormatted: '06:12',
    durationSeconds: 372,
    sizeBytes: 8945200,
    sizeFormatted: '8.9 MB',
    thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=640&q=80',
    directStreamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    originalUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
  }
];

interface TrendingShowcaseProps {
  language: Language;
  onPlayItem: (task: DownloadTask) => void;
  onDownloadItem: (media: ParsedMediaInfo, format: FormatOption) => void;
}

export const TrendingShowcase: React.FC<TrendingShowcaseProps> = ({
  language,
  onPlayItem,
  onDownloadItem
}) => {
  const [filter, setFilter] = useState<'all' | 'video' | 'audio'>('all');

  const visibleItems = TRENDING_ITEMS.filter((item) => {
    if (filter === 'all') return true;
    return item.type === filter;
  });

  const buildFormat = (item: TrendingMediaItem): FormatOption => ({
    id: `fmt-${item.id}`,
    type: item.type,
    format: item.type === 'audio' ? 'mp3' : 'mp4',
    qualityLabel: item.qualityLabel,
    resolution: item.type === 'video' ? '1920x1080' : undefined,
    fps: item.type === 'video' ? 60 : undefined,
    bitrate: item.type === 'audio' ? '320 kbps' : '5.4 Mbps',
    estimatedSizeBytes: item.sizeBytes,
    estimatedSizeFormatted: item.sizeFormatted
  });

  const handleInstantPlay = (item: TrendingMediaItem) => {
    const title = language === 'fa' ? item.titleFa : item.titleEn;
    const format = buildFormat(item);
    const task: DownloadTask = {
      id: `trend-play-${item.id}`,
      mediaId: item.id,
      originalUrl: item.directStreamUrl,
      videoId: item.videoId,
      title,
      platform: item.platform,
      thumbnail: item.thumbnail,
      durationFormatted: item.durationFormatted,
      durationSeconds: item.durationSeconds,
      format,
      status: 'completed',
      progressPercent: 100,
      speedBytesPerSec: 0,
      speedFormatted: 'Online Stream',
      downloadedBytes: item.sizeBytes,
      totalBytes: item.sizeBytes,
      downloadedSizeFormatted: item.sizeFormatted,
      totalSizeFormatted: item.sizeFormatted,
      elapsedSeconds: 0,
      etaSeconds: 0,
      directUrl: item.directStreamUrl,
      fileName: `${title.replace(/\s+/g, '_')}.${item.type === 'audio' ? 'mp3' : 'mp4'}`,
      createdAt: Date.now()
    };
    onPlayItem(task);
  };

  const handleInstantDownload = (item: TrendingMediaItem) => {
    const title = language === 'fa' ? item.titleFa : item.titleEn;
    const format = buildFormat(item);
    const media: ParsedMediaInfo = {
      id: item.id,
      originalUrl: item.directStreamUrl,
      videoId: item.videoId,
      platform: item.platform,
      title,
      author: item.creator,
      durationSeconds: item.durationSeconds,
      durationFormatted: item.durationFormatted,
      viewsCount: 'Trending 🔥',
      thumbnail: item.thumbnail,
      formats: [format],
      timestamp: Date.now()
    };
    onDownloadItem(media, format);
  };

  return (
    <section className="w-full max-w-4xl mx-auto px-3 sm:px-4 mt-5 overflow-x-hidden">
      {/* Header & Compact Filter Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 text-white flex items-center justify-center shadow-sm card-3d shrink-0">
            <Flame className="w-4 h-4 fill-current" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white drop-shadow-sm text-3d truncate">
              {language === 'fa' ? 'ویترین کلیپ و موزیک‌های ترند' : 'Trending Clips & Music Showcase'}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {language === 'fa'
                ? 'پخش آنلاین و دانلود مستقیم با یک کلیک (بدون نیاز به لینک)'
                : 'Instant 1-tap play & direct download without needing a link'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0">
          {[
            { id: 'all', labelFa: 'همه', labelEn: 'All' },
            { id: 'video', labelFa: 'ویدیو', labelEn: 'Clips' },
            { id: 'audio', labelFa: 'موزیک', labelEn: 'Music' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id as any)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all ${
                filter === tab.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {language === 'fa' ? tab.labelFa : tab.labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* Compact 3D Grid of Trending Items */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visibleItems.map((item) => {
          const title = language === 'fa' ? item.titleFa : item.titleEn;
          return (
            <div
              key={item.id}
              className="p-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 card-3d flex items-center gap-3 min-w-0"
            >
              {/* Thumbnail with Play Overlay */}
              <div
                onClick={() => handleInstantPlay(item)}
                className="relative w-20 h-16 sm:w-24 sm:h-16 rounded-xl bg-slate-800 overflow-hidden shrink-0 cursor-pointer group"
              >
                <img
                  src={item.thumbnail}
                  alt={title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                  <div className="w-7 h-7 rounded-full bg-white/95 text-indigo-600 flex items-center justify-center shadow-md">
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  </div>
                </div>
                <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 text-[9px] text-white font-bold">
                  {item.durationFormatted}
                </span>
              </div>

              {/* Info & 3D Action Buttons */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <PlatformIcon platform={item.platform} size={13} />
                  <span className="text-[10px] font-bold text-slate-400 truncate">
                    {item.creator} • {item.sizeFormatted}
                  </span>
                </div>
                <h3 className="font-extrabold text-xs text-slate-900 dark:text-white truncate mb-2 drop-shadow-xs">
                  {title}
                </h3>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleInstantPlay(item)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 btn-3d-secondary active:translate-y-[2px] transition-all duration-150"
                  >
                    <Play className="w-3 h-3 text-indigo-500 fill-current" />
                    <span>{language === 'fa' ? 'پخش' : 'Play'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleInstantDownload(item)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 border-t border-white/25 shadow-[0_3px_0_rgb(76,29,149),0_6px_12px_rgba(124,58,237,0.25)] active:translate-y-[2px] active:shadow-[0_1px_0_rgb(76,29,149)] transition-all duration-150"
                  >
                    <Download className="w-3 h-3" />
                    <span>{language === 'fa' ? 'دانلود مستقیم' : 'Download'}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
