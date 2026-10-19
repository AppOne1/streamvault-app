import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Download,
  Flame,
  Volume2,
  VolumeX,
  Gift,
  Coins,
  Crown,
  Share2,
  CalendarCheck,
  Tv,
  CheckCircle2,
  Music,
  X
} from 'lucide-react';
import { DownloadTask, FormatOption, Language, ParsedMediaInfo, PlatformId } from '../types';
import { PlatformIcon } from './PlatformIcon';
import {
  claimRewardAction,
  getRewardStatus,
  RewardStatus,
  subscribeQuotaAndCoins
} from '../services/quotaService';

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
  previewVideoUrl: string;
  directStreamUrl: string;
  originalUrl: string;
  videoId?: string;
}

export const TRENDING_ITEMS: TrendingMediaItem[] = [
  {
    id: 'trend-vid-1',
    titleFa: 'تیزر سینمایی طبیعت و انیمیشن 4K HDR',
    titleEn: 'Cinematic Nature & Animation 4K HDR',
    creator: 'OneDownload Studio',
    platform: 'youtube',
    type: 'video',
    qualityLabel: '1080p Full HD',
    durationFormatted: '00:33',
    durationSeconds: 33,
    sizeBytes: 5510872,
    sizeFormatted: '5.5 MB',
    thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=640&q=80',
    previewVideoUrl: 'https://cdn.jsdelivr.net/gh/mediaelement/mediaelement-files@master/big_buck_bunny.mp4',
    directStreamUrl: 'https://cdn.jsdelivr.net/gh/mediaelement/mediaelement-files@master/big_buck_bunny.mp4',
    originalUrl: 'https://cdn.jsdelivr.net/gh/mediaelement/mediaelement-files@master/big_buck_bunny.mp4'
  },
  {
    id: 'trend-vid-2',
    titleFa: 'تریلر حماسی سینتل — صدای استریو اصلی',
    titleEn: 'Sintel Epic Trailer — Full Stereo Audio',
    creator: '@cinema_vibes',
    platform: 'tiktok',
    type: 'video',
    qualityLabel: '1080p HD',
    durationFormatted: '00:52',
    durationSeconds: 52,
    sizeBytes: 4372373,
    sizeFormatted: '4.4 MB',
    thumbnail: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=640&q=80',
    previewVideoUrl: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    directStreamUrl: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/f/f3/Big_Buck_Bunny_first_23_seconds_1080p.ogv/Big_Buck_Bunny_first_23_seconds_1080p.ogv.480p.vp9.webm',
    originalUrl: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/f/f3/Big_Buck_Bunny_first_23_seconds_1080p.ogv/Big_Buck_Bunny_first_23_seconds_1080p.ogv.480p.vp9.webm'
  },
  {
    id: 'trend-vid-3',
    titleFa: 'ریلز اینستاگرام — لحظات پرانرژی با صدا',
    titleEn: 'Instagram Reels — High Energy with Audio',
    creator: '@insta_reels_hd',
    platform: 'instagram',
    type: 'video',
    qualityLabel: '1080p Full HD',
    durationFormatted: '00:30',
    durationSeconds: 30,
    sizeBytes: 2757913,
    sizeFormatted: '2.8 MB',
    thumbnail: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=640&q=80',
    previewVideoUrl: 'https://media.w3.org/2010/05/video/movie_300.mp4',
    directStreamUrl: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/a/a7/How_to_make_video.webm/How_to_make_video.webm.480p.vp9.webm',
    originalUrl: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/a/a7/How_to_make_video.webm/How_to_make_video.webm.480p.vp9.webm'
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
    previewVideoUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    directStreamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    originalUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
  }
];

interface TrendingShowcaseProps {
  language: Language;
  onPlayItem: (task: DownloadTask) => void;
  onDownloadItem: (media: ParsedMediaInfo, format: FormatOption) => void;
  onOpenShare: () => void;
  onOpenUpgrade: () => void;
}

export const TrendingShowcase: React.FC<TrendingShowcaseProps> = ({
  language,
  onPlayItem,
  onDownloadItem,
  onOpenShare,
  onOpenUpgrade
}) => {
  const [filter, setFilter] = useState<'all' | 'video' | 'audio'>('all');
  const [unmutedItemId, setUnmutedItemId] = useState<string | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  const [rewardStatus, setRewardStatus] = useState<RewardStatus>(() => getRewardStatus());
  const [rewardFeedback, setRewardFeedback] = useState<string | null>(null);

  // Promotional Video Watch Modal state (+20 Coins)
  const [isWatchingPromo, setIsWatchingPromo] = useState<boolean>(false);
  const [promoSecondsLeft, setPromoSecondsLeft] = useState<number>(8);
  const promoVideoRef = useRef<HTMLVideoElement | null>(null);

  const isFa = language === 'fa';

  useEffect(() => {
    const unsub = subscribeQuotaAndCoins(() => {
      setRewardStatus(getRewardStatus());
    });
    return () => unsub();
  }, []);

  // Countdown timer when watching promotional video
  useEffect(() => {
    if (!isWatchingPromo) return;
    if (promoSecondsLeft <= 0) {
      const res = claimRewardAction('watch_ad');
      setRewardStatus(getRewardStatus());
      setRewardFeedback(isFa ? res.messageFa : res.messageEn);
      setTimeout(() => setRewardFeedback(null), 4000);
      setIsWatchingPromo(false);
      return;
    }
    const timer = setTimeout(() => {
      setPromoSecondsLeft((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [isWatchingPromo, promoSecondsLeft, isFa]);

  const handleDailyCheckIn = () => {
    const res = claimRewardAction('daily_checkin');
    setRewardStatus(getRewardStatus());
    setRewardFeedback(isFa ? res.messageFa : res.messageEn);
    setTimeout(() => setRewardFeedback(null), 3500);
  };

  const handleStartWatchPromo = () => {
    if (rewardStatus.watchedAdsToday >= rewardStatus.maxAdsPerDay) {
      setRewardFeedback(
        isFa
          ? 'سقف تماشای ویدیوی پیشنهادی امروز تکمیل شده است.'
          : 'Daily promotional video limit reached.'
      );
      setTimeout(() => setRewardFeedback(null), 3500);
      return;
    }
    // Mute any feed videos first
    muteAllFeedMedia();
    setPromoSecondsLeft(6);
    setIsWatchingPromo(true);
  };

  const handleShareAndEarn = () => {
    onOpenShare();
    if (!rewardStatus.sharedToday) {
      const res = claimRewardAction('share_app');
      setRewardStatus(getRewardStatus());
      setRewardFeedback(isFa ? res.messageFa : res.messageEn);
      setTimeout(() => setRewardFeedback(null), 4000);
    }
  };

  const muteAllFeedMedia = () => {
    Object.values(videoRefs.current).forEach((v) => {
      if (v) {
        v.muted = true;
      }
    });
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
    }
    setUnmutedItemId(null);
  };

  /**
   * Reliable Speaker Mute/Unmute Handler for Explore Feed Videos & Audio
   * Imperatively sets DOM video.muted = false and video.volume = 1.0 inside user click gesture
   */
  const toggleSound = (e: React.MouseEvent, item: TrendingMediaItem) => {
    e.stopPropagation();

    if (unmutedItemId === item.id) {
      if (item.type === 'video') {
        const v = videoRefs.current[item.id];
        if (v) {
          v.muted = true;
        }
      } else if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
      }
      setUnmutedItemId(null);
      return;
    }

    // Mute all other videos & audio preview first
    Object.entries(videoRefs.current).forEach(([id, v]) => {
      if (v && id !== item.id) {
        v.muted = true;
      }
    });
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
    }

    if (item.type === 'video') {
      const targetVideo = videoRefs.current[item.id];
      if (targetVideo) {
        targetVideo.defaultMuted = false;
        targetVideo.muted = false;
        targetVideo.volume = 1.0;
        const playPromise = targetVideo.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            // If paused or blocked, reload current frame and play with sound
            targetVideo.muted = false;
            targetVideo.play().catch(() => {});
          });
        }
      }
    } else {
      if (!audioPreviewRef.current) {
        audioPreviewRef.current = new Audio(item.directStreamUrl);
      } else if (audioPreviewRef.current.src !== item.directStreamUrl) {
        audioPreviewRef.current.src = item.directStreamUrl;
      }
      audioPreviewRef.current.muted = false;
      audioPreviewRef.current.volume = 1.0;
      audioPreviewRef.current.play().catch(() => {});
    }

    setUnmutedItemId(item.id);
  };

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
    muteAllFeedMedia();
    const title = isFa ? item.titleFa : item.titleEn;
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
      directUrl: item.previewVideoUrl,
      fileName: `${title.replace(/\s+/g, '_')}.${item.type === 'audio' ? 'mp3' : 'mp4'}`,
      createdAt: Date.now()
    };
    onPlayItem(task);
  };

  const handleInstantDownload = (item: TrendingMediaItem) => {
    const title = isFa ? item.titleFa : item.titleEn;
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
    <section className="w-full max-w-4xl mx-auto px-3 sm:px-4 mt-6 space-y-6 overflow-x-hidden">
      {/* 1. Clean Minimal 3DTrending Explore Feed (Separated clearly from URL Input) */}
      <div className="p-4 sm:p-5 rounded-3xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800 card-3d space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 text-white flex items-center justify-center shadow-sm shrink-0">
              <Flame className="w-4 h-4 fill-current" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white drop-shadow-sm text-3d truncate">
                {isFa ? 'ویترین کلیپ و موزیک‌های ترند' : 'Trending Clips & Music Feed'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {isFa
                  ? 'برای شنیدن صدای هر ویدیو روی آیکون اسپیکر لمس کنید'
                  : 'Tap the speaker icon on any video to toggle audio'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 shrink-0">
            {[
              { id: 'all', labelFa: 'همه', labelEn: 'All' },
              { id: 'video', labelFa: 'ویدیو', labelEn: 'Clips' },
              { id: 'audio', labelFa: 'موزیک', labelEn: 'Music' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id as any)}
                className={`px-3 py-1 rounded-lg text-[11px] font-black transition-all ${
                  filter === tab.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isFa ? tab.labelFa : tab.labelEn}
              </button>
            ))}
          </div>
        </div>

        {/* Minimal 3D Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {visibleItems.map((item) => {
            const title = isFa ? item.titleFa : item.titleEn;
            const isUnmuted = unmutedItemId === item.id;

            return (
              <div
                key={item.id}
                className="p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800/90 flex items-center gap-3.5 min-w-0 transition-all hover:border-indigo-500/40"
              >
                {/* Video / Audio Preview Box with Working Speaker Button */}
                <div
                  onClick={(e) => toggleSound(e, item)}
                  className="relative w-26 h-20 sm:w-28 sm:h-20 rounded-xl bg-slate-900 overflow-hidden shrink-0 cursor-pointer group border border-slate-200/40 dark:border-slate-800"
                >
                  {item.type === 'video' ? (
                    <video
                      ref={(el) => {
                        videoRefs.current[item.id] = el;
                      }}
                      src={item.previewVideoUrl}
                      poster={item.thumbnail}
                      muted={!isUnmuted}
                      loop
                      playsInline
                      autoPlay
                      preload="auto"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="relative w-full h-full">
                      <img
                        src={item.thumbnail}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-indigo-950/45 flex items-center justify-center">
                        <Music className="w-6 h-6 text-white drop-shadow" />
                      </div>
                    </div>
                  )}

                  {/* Prominent Speaker Control Button Overlay */}
                  <button
                    type="button"
                    onClick={(e) => toggleSound(e, item)}
                    title={isFa ? (isUnmuted ? 'قطع صدا' : 'پخش صدای ویدیو') : (isUnmuted ? 'Mute' : 'Unmute Audio')}
                    className={`absolute top-1.5 left-1.5 z-10 w-7 h-7 rounded-lg flex items-center justify-center transition-all shadow-md ${
                      isUnmuted
                        ? 'bg-emerald-500 text-white ring-2 ring-white scale-105'
                        : 'bg-black/75 hover:bg-black/90 text-white border border-white/25'
                    }`}
                  >
                    {isUnmuted ? (
                      <Volume2 className="w-4 h-4 animate-pulse" />
                    ) : (
                      <VolumeX className="w-4 h-4" />
                    )}
                  </button>

                  {/* Duration Badge */}
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.2 rounded bg-black/80 text-[9px] text-white font-bold">
                    {item.durationFormatted}
                  </span>
                </div>

                {/* Details & Clean Action Row */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <PlatformIcon platform={item.platform} size={13} />
                    <span className="text-[10px] font-bold text-slate-400 truncate">
                      {item.creator} • {item.sizeFormatted}
                    </span>
                  </div>
                  <h3 className="font-extrabold text-xs text-slate-900 dark:text-white truncate mb-2.5 drop-shadow-xs">
                    {title}
                  </h3>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => toggleSound(e, item)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-black transition-all duration-150 ${
                        isUnmuted
                          ? 'bg-emerald-500 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 btn-3d-secondary'
                      }`}
                    >
                      {isUnmuted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-indigo-500" />}
                      <span>{isFa ? (isUnmuted ? 'صدا روشن' : 'صدا') : (isUnmuted ? 'Sound On' : 'Sound')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleInstantPlay(item)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-black bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 btn-3d-secondary active:translate-y-[2px] transition-all duration-150"
                    >
                      <Play className="w-3 h-3 text-indigo-500 fill-current" />
                      <span>{isFa ? 'پخش' : 'Play'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleInstantDownload(item)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 border-t border-white/25 shadow-[0_3px_0_rgb(76,29,149)] active:translate-y-[2px] transition-all duration-150"
                    >
                      <Download className="w-3 h-3" />
                      <span>{isFa ? 'دانلود' : 'Get'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Standardized Commercial Jet Coins & Rewarded Actions Panel (3 Transparent Options) */}
      <div className="p-4 sm:p-5 rounded-3xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800 card-3d space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 flex items-center justify-center shadow-sm shrink-0">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white drop-shadow-sm text-3d">
                  {isFa ? 'دریافت سکه رایگان و پاداش' : 'Earn Free Jet Coins'}
                </h3>
                <span className="px-2 py-0.5 rounded-lg text-[11px] font-black bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                  {isFa ? `موجودی: ${rewardStatus.coins} سکه` : `${rewardStatus.coins} Coins`}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isFa
                  ? 'با انجام ماموریت‌های زیر سکه بگیرید و آن را به دانلود اضافه یا اشتراک PRO تبدیل کنید'
                  : 'Complete transparent tasks below to earn coins and unlock VIP Pro or extra downloads'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenUpgrade}
            className="px-3 py-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-indigo-600 to-violet-600 text-white btn-3d-primary flex items-center gap-1.5 shrink-0"
          >
            <Crown className="w-3.5 h-3.5 text-amber-300" />
            <span>{isFa ? 'استفاده از سکه‌ها / ارتقا' : 'Redeem Coins'}</span>
          </button>
        </div>

        {rewardFeedback && (
          <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 text-xs font-extrabold text-emerald-700 dark:text-emerald-300 flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{rewardFeedback}</span>
          </div>
        )}

        {/* The Exact 3 Commercial Rewarded Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Option 1: Watch Sponsored / Promotional Video (+20 Coins) */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                <Tv className="w-4 h-4" />
              </div>
              <span className="px-2 py-0.5 rounded-lg text-[11px] font-black bg-amber-400 text-slate-950 shadow-xs">
                {isFa ? '+۲۰ سکه' : '+20 Coins'}
              </span>
            </div>
            <div>
              <h4 className="font-extrabold text-xs text-slate-900 dark:text-white">
                {isFa ? '۱. تماشای ویدیوی پیشنهادی' : '1. Watch Promo Video'}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isFa
                  ? `تماشای کلیپ کوتاه تبلیغاتی (${rewardStatus.watchedAdsToday}/${rewardStatus.maxAdsPerDay} امروز)`
                  : `Watch short promo clip (${rewardStatus.watchedAdsToday}/${rewardStatus.maxAdsPerDay} today)`}
              </p>
            </div>
            <button
              type="button"
              onClick={handleStartWatchPromo}
              disabled={rewardStatus.watchedAdsToday >= rewardStatus.maxAdsPerDay}
              className="w-full py-2 px-3 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 btn-3d-primary transition-all"
            >
              {rewardStatus.watchedAdsToday >= rewardStatus.maxAdsPerDay
                ? (isFa ? 'تکمیل شد ✓' : 'Completed ✓')
                : (isFa ? 'تماشا و دریافت +۲۰ سکه' : 'Watch (+20 Coins)')}
            </button>
          </div>

          {/* Option 2: Invite Friends & Share App (+50 Coins) */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="p-2 rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400">
                <Share2 className="w-4 h-4" />
              </div>
              <span className="px-2 py-0.5 rounded-lg text-[11px] font-black bg-amber-400 text-slate-950 shadow-xs">
                {isFa ? '+۵۰ سکه' : '+50 Coins'}
              </span>
            </div>
            <div>
              <h4 className="font-extrabold text-xs text-slate-900 dark:text-white">
                {isFa ? '۲. دعوت از دوستان و اشتراک‌گذاری' : '2. Invite Friends & Share'}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isFa
                  ? 'ارسال لینک برنامه وان دانلود برای دوستان خود'
                  : 'Share OneDownload link with your friends'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleShareAndEarn}
              className={`w-full py-2 px-3 rounded-xl text-xs font-black transition-all ${
                rewardStatus.sharedToday
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : 'text-white bg-gradient-to-r from-violet-600 to-purple-600 btn-3d-primary'
              }`}
            >
              {rewardStatus.sharedToday
                ? (isFa ? 'امروز دریافت شد ✓ (ارسال مجدد)' : 'Claimed Today ✓ (Share)')
                : (isFa ? 'اشتراک‌گذاری (+۵۰ سکه)' : 'Share (+50 Coins)')}
            </button>
          </div>

          {/* Option 3: Daily Check-in (+10 Coins) */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <CalendarCheck className="w-4 h-4" />
              </div>
              <span className="px-2 py-0.5 rounded-lg text-[11px] font-black bg-amber-400 text-slate-950 shadow-xs">
                {isFa ? '+۱۰ سکه' : '+10 Coins'}
              </span>
            </div>
            <div>
              <h4 className="font-extrabold text-xs text-slate-900 dark:text-white">
                {isFa ? '۳. هدیه ورود روزانه' : '3. Daily Check-in'}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isFa
                  ? 'هر روز با باز کردن برنامه ۱۰ سکه رایگان دریافت کنید'
                  : 'Open the app daily to claim 10 free coins'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleDailyCheckIn}
              disabled={rewardStatus.checkedInToday}
              className={`w-full py-2 px-3 rounded-xl text-xs font-black transition-all ${
                rewardStatus.checkedInToday
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : 'text-white bg-emerald-600 hover:bg-emerald-500 btn-3d-emerald'
              }`}
            >
              {rewardStatus.checkedInToday
                ? (isFa ? 'امروز دریافت شد ✓' : 'Checked-in Today ✓')
                : (isFa ? 'ثبت ورود امروز (+۱۰ سکه)' : 'Check-in (+10 Coins)')}
            </button>
          </div>
        </div>
      </div>

      {/* Sponsored / Promotional Video Modal (+20 Coins) */}
      {isWatchingPromo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden card-3d">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs font-black text-amber-400">
                <Coins className="w-4 h-4" />
                <span>
                  {isFa
                    ? `پاداش +۲۰ سکه تا ${promoSecondsLeft} ثانیه دیگر...`
                    : `+20 Coins in ${promoSecondsLeft}s...`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsWatchingPromo(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
                title={isFa ? 'بستن (لغو پاداش)' : 'Close'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative aspect-video bg-black">
              <video
                ref={promoVideoRef}
                src="https://cdn.jsdelivr.net/gh/mediaelement/mediaelement-files@master/big_buck_bunny.mp4"
                autoPlay
                playsInline
                controls
                className="w-full h-full object-contain"
              />
            </div>

            <div className="p-4 text-center space-y-2">
              <h4 className="text-xs sm:text-sm font-black text-white">
                {isFa ? 'معرفی موتور دانلود توربو ۴K وان دانلود' : 'OneDownload 4K Turbo Engine Showcase'}
              </h4>
              <p className="text-[11px] text-slate-400">
                {isFa
                  ? 'لطفاً تا پایان شمارش معکوس صبر کنید تا ۲۰ سکه رایگان به کیف پول شما اضافه شود.'
                  : 'Please wait until the countdown finishes to receive your +20 free coins.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
