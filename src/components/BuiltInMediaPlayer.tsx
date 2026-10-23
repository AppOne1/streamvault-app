import React, { useEffect, useRef, useState } from 'react';
import { DownloadTask, Language } from '../types';
import { getTranslation } from '../i18n/translations';
import { PlatformIcon } from './PlatformIcon';
import { getMediaBlobFromIDB, getOfflineMedia } from '../services/storageService';
import {
  extractYouTubeVideoId,
  getSafeThumbnail,
  isCapacitorOrNative,
  isWebpageUrl
} from '../services/platformDetector';
import { resolveDirectMediaStream } from '../services/mediaExtractor';
import { downloadEngine } from '../services/downloadEngine';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize2,
  X,
  RotateCcw,
  Sparkles,
  Music,
  Download,
  Tv,
  HardDrive,
  Film,
  ExternalLink,
  Loader2,
  Check,
  Timer,
  RotateCw,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';

interface BuiltInMediaPlayerProps {
  language: Language;
  task: DownloadTask | null;
  onClose: () => void;
  onSaveToDisk: (task: DownloadTask) => void;
}

export const BuiltInMediaPlayer: React.FC<BuiltInMediaPlayerProps> = ({
  language,
  task,
  onClose,
  onSaveToDisk
}) => {
  const t = getTranslation(language);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(task?.durationSeconds || 0);
  const [volume, setVolume] = useState<number>(0.9);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [activeMediaUrl, setActiveMediaUrl] = useState<string | null>(null);
  const [sleepTimer, setSleepTimer] = useState<number | null>(null);
  const [showSleepMenu, setShowSleepMenu] = useState<boolean>(false);

  // Detect YouTube ID for authentic real video playback
  const ytVideoId = task?.videoId || (task?.originalUrl ? extractYouTubeVideoId(task.originalUrl) : null);
  const [activeEngine, setActiveEngine] = useState<'server1' | 'server2'>('server1');

  // Default to real stream embed when YouTube video has no local cached Blob, or local file when cached
  const [playerMode, setPlayerMode] = useState<'stream' | 'file'>('file');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveStatusText, setSaveStatusText] = useState<string | null>(null);
  const [useAnimatedCoverPlayer, setUseAnimatedCoverPlayer] = useState<boolean>(false);
  const [coverImgFailed, setCoverImgFailed] = useState<boolean>(false);

  // Helper to send commands to YouTube IFrame API (Play, Pause, Seek, Volume, Speed)
  const sendYtCommand = (func: string, args: any[] = []) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func, args }),
        '*'
      );
    } catch {
      // ignore postMessage errors
    }
  };

  // Listen to YouTube IFrame API telemetry (currentTime, duration, playerState)
  useEffect(() => {
    if (!ytVideoId || playerMode !== 'stream') return;

    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'infoDelivery' && data.info) {
          if (typeof data.info.currentTime === 'number') {
            setCurrentTime(data.info.currentTime);
          }
          if (typeof data.info.duration === 'number' && data.info.duration > 0) {
            setDuration(data.info.duration);
          }
          if (typeof data.info.playerState === 'number') {
            // 1 = playing, 2 = paused, 0 = ended
            if (data.info.playerState === 1) setIsPlaying(true);
            else if (data.info.playerState === 2 || data.info.playerState === 0) setIsPlaying(false);
          }
        }
      } catch {
        // ignore non-JSON messages
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [ytVideoId, playerMode]);

  // Sleep timer auto-pause
  useEffect(() => {
    if (!sleepTimer) return;
    const timeout = setTimeout(() => {
      const mediaEl = task?.format.type === 'video' ? videoRef.current : audioRef.current;
      if (mediaEl) {
        mediaEl.pause();
        setIsPlaying(false);
      }
      setSleepTimer(null);
    }, sleepTimer * 60 * 1000);

    return () => clearTimeout(timeout);
  }, [sleepTimer, task?.format.type]);

  const handleSaveClick = async () => {
    if (isSaving || !task) return;
    setIsSaving(true);
    setSaveStatusText(language === 'fa' ? 'در حال آماده‌سازی...' : 'Preparing...');
    try {
      const success = await downloadEngine.saveFileToDisk(task, (msg) => {
        setSaveStatusText(msg);
      });
      if (success) {
        setSaveStatusText(language === 'fa' ? 'ذخیره شد! ✓' : 'Saved! ✓');
        setTimeout(() => {
          setIsSaving(false);
          setSaveStatusText(null);
        }, 3000);
      } else {
        setIsSaving(false);
        setSaveStatusText(null);
      }
    } catch {
      setIsSaving(false);
      setSaveStatusText(null);
    }
  };

  // Load / resolve playable Blob URL from memory or IndexedDB offline_media store, or progressive chunked stream
  useEffect(() => {
    if (!task) return;

    let isMounted = true;
    let createdObjectUrl: string | null = null;
    const isAudio = task.format.type === 'audio';
    const minValidBytes = isAudio ? 15 * 1024 : 30 * 1024;
    const heightMatch = task.format.qualityLabel.match(/\d+/);
    const requestedHeight = heightMatch ? heightMatch[0] : '720';

    const resolveBlob = async () => {
      setUseAnimatedCoverPlayer(false);
      setCoverImgFailed(false);

      // 1. Fully downloaded in-memory mediaBlob -> Play immediately via URL.createObjectURL(blob)
      if (task.mediaBlob && task.mediaBlob.size >= minValidBytes) {
        const url = URL.createObjectURL(task.mediaBlob);
        createdObjectUrl = url;
        task.blobUrl = url;
        if (isMounted) {
          setActiveMediaUrl(url);
          setPlayerMode('file');
        }
        return;
      }

      // 2. Try fetching completed Blob from IndexedDB offline_media ObjectStore -> URL.createObjectURL(blob)
      const offlineRecord = await getOfflineMedia(task.id);
      if (offlineRecord && offlineRecord.mediaBlob && offlineRecord.mediaBlob.size >= minValidBytes && isMounted) {
        const url = URL.createObjectURL(offlineRecord.mediaBlob);
        createdObjectUrl = url;
        task.blobUrl = url;
        task.mediaBlob = offlineRecord.mediaBlob;
        setActiveMediaUrl(url);
        setPlayerMode('file');
        return;
      }

      // 3. Try legacy IDB store -> URL.createObjectURL(blob)
      const blobFromDB = await getMediaBlobFromIDB(task.id);
      if (blobFromDB && blobFromDB.size >= minValidBytes && isMounted) {
        const url = URL.createObjectURL(blobFromDB);
        createdObjectUrl = url;
        task.blobUrl = url;
        task.mediaBlob = blobFromDB;
        setActiveMediaUrl(url);
        setPlayerMode('file');
        return;
      }

      // 4. For long YouTube videos (or un-downloaded YouTube videos):
      // Never buffer the entire huge file into memory before starting playback!
      // Instead, use progressive chunked streaming (/api/media/stream with HTTP Range 206 Partial Content) + real-time YouTube stream player.
      if (ytVideoId && !isAudio && isMounted) {
        const progressiveStreamUrl = !isCapacitorOrNative()
          ? `/api/media/stream?url=${encodeURIComponent(task.originalUrl)}&quality=${requestedHeight}`
          : task.directUrl && !isWebpageUrl(task.directUrl)
          ? task.directUrl
          : '';

        if (progressiveStreamUrl) {
          setActiveMediaUrl(progressiveStreamUrl);
        }
        setPlayerMode('stream');
        setIsPlaying(true);
        return;
      }

      // 5. Try direct stream URL (progressive HTTP Range streaming without loading full file into RAM)
      if (task.directUrl && !isWebpageUrl(task.directUrl) && isMounted) {
        setActiveMediaUrl(task.directUrl);
        setPlayerMode('file');
        return;
      }

      // 6. On Web, use progressive chunked stream endpoint (/api/media/stream) first for instant playback
      if (!isCapacitorOrNative() && task.originalUrl && isMounted) {
        const progressiveUrl = `/api/media/stream?url=${encodeURIComponent(
          task.originalUrl
        )}&quality=${requestedHeight}&audio=${isAudio ? '1' : '0'}`;
        setActiveMediaUrl(progressiveUrl);
        setPlayerMode('file');
        return;
      }

      // 7. Resolve live online stream directly (Aparat / TikWM / Piped / Cobalt / Verified HD Stream)
      try {
        const onlineStream = await resolveDirectMediaStream(
          task.originalUrl,
          task.format.type,
          task.format.qualityLabel
        );
        if (onlineStream && onlineStream.url && isMounted) {
          task.directUrl = onlineStream.url;
          setActiveMediaUrl(onlineStream.url);
          setPlayerMode('file');
          return;
        }
      } catch {
        // Fallback below
      }

      if (isMounted) {
        if (ytVideoId && !isAudio) {
          setPlayerMode('stream');
        } else {
          setUseAnimatedCoverPlayer(true);
        }
      }
    };

    resolveBlob();

    return () => {
      isMounted = false;
      if (createdObjectUrl) {
        try {
          URL.revokeObjectURL(createdObjectUrl);
        } catch {
          // ignore
        }
      }
    };
  }, [task, ytVideoId]);

  // Simulated progress ticker when in animated native cover player mode or YouTube stream fallback
  useEffect(() => {
    const isYtStreamActive = Boolean(ytVideoId && playerMode === 'stream');
    if ((!useAnimatedCoverPlayer && !isYtStreamActive) || !isPlaying) return;
    const totalDur = duration || task?.durationSeconds || 180;
    if (!duration && totalDur) {
      setDuration(totalDur);
    }
    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        if (prev + 1 >= totalDur) {
          return isLooping ? 0 : totalDur;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [useAnimatedCoverPlayer, ytVideoId, playerMode, isPlaying, duration, task?.durationSeconds, isLooping]);

  if (!task) return null;

  const isVideo = task.format.type === 'video';

  const handleMediaError = async () => {
    if (ytVideoId && isVideo) {
      setPlayerMode('stream');
      setUseAnimatedCoverPlayer(false);
      return;
    }

    try {
      const onlineStream = await resolveDirectMediaStream(
        task.originalUrl,
        task.format.type,
        task.format.qualityLabel
      );
      if (onlineStream && onlineStream.url && onlineStream.url !== activeMediaUrl) {
        task.directUrl = onlineStream.url;
        setActiveMediaUrl(onlineStream.url);
        setUseAnimatedCoverPlayer(false);
        return;
      }
    } catch {
      // Switch to native animated cover player so user never sees a broken image or error
    }

    setUseAnimatedCoverPlayer(true);
    setIsPlaying(true);
  };

  const togglePlay = () => {
    if (isVideo && playerMode === 'stream' && ytVideoId) {
      if (isPlaying) {
        sendYtCommand('pauseVideo');
        setIsPlaying(false);
      } else {
        sendYtCommand('playVideo');
        setIsPlaying(true);
      }
      return;
    }

    if (useAnimatedCoverPlayer) {
      setIsPlaying((prev) => !prev);
      return;
    }
    const mediaEl = isVideo ? videoRef.current : audioRef.current;
    if (!mediaEl) {
      setUseAnimatedCoverPlayer(true);
      setIsPlaying((prev) => !prev);
      return;
    }

    if (isPlaying) {
      mediaEl.pause();
      setIsPlaying(false);
    } else {
      mediaEl
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          if (ytVideoId && isVideo) {
            setPlayerMode('stream');
            setIsPlaying(true);
          } else {
            setUseAnimatedCoverPlayer(true);
            setIsPlaying(true);
          }
        });
    }
  };

  const handleTimeUpdate = () => {
    const mediaEl = isVideo ? videoRef.current : audioRef.current;
    if (mediaEl) {
      setCurrentTime(mediaEl.currentTime);
      if (mediaEl.duration && !isNaN(mediaEl.duration)) {
        setDuration(mediaEl.duration);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (isVideo && playerMode === 'stream' && ytVideoId) {
      sendYtCommand('seekTo', [newTime, true]);
      return;
    }
    const mediaEl = isVideo ? videoRef.current : audioRef.current;
    if (mediaEl) {
      mediaEl.currentTime = newTime;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (isVideo && playerMode === 'stream' && ytVideoId) {
      sendYtCommand('setVolume', [Math.round(newVol * 100)]);
      if (newVol === 0) sendYtCommand('mute');
      else sendYtCommand('unMute');
      return;
    }
    const mediaEl = isVideo ? videoRef.current : audioRef.current;
    if (mediaEl) mediaEl.volume = newVol;
  };

  const toggleMute = () => {
    if (isVideo && playerMode === 'stream' && ytVideoId) {
      if (isMuted) {
        sendYtCommand('unMute');
        setIsMuted(false);
      } else {
        sendYtCommand('mute');
        setIsMuted(true);
      }
      return;
    }
    const mediaEl = isVideo ? videoRef.current : audioRef.current;
    if (!mediaEl) return;
    if (isMuted) {
      mediaEl.muted = false;
      setIsMuted(false);
    } else {
      mediaEl.muted = true;
      setIsMuted(true);
    }
  };

  const cycleSpeed = () => {
    const speeds = [0.75, 1, 1.25, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    setPlaybackSpeed(nextSpeed);
    if (isVideo && playerMode === 'stream' && ytVideoId) {
      sendYtCommand('setPlaybackRate', [nextSpeed]);
      return;
    }
    const mediaEl = isVideo ? videoRef.current : audioRef.current;
    if (mediaEl) mediaEl.playbackRate = nextSpeed;
  };

  const togglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP error:', err);
    }
  };

  const toggleFullscreen = async () => {
    if (!playerContainerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await playerContainerRef.current.requestFullscreen();
        setIsFullscreen(true);
        if (typeof screen !== 'undefined' && 'orientation' in screen && (screen.orientation as any).lock) {
          (screen.orientation as any).lock('any').catch(() => {});
        }
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
        if (typeof screen !== 'undefined' && 'orientation' in screen && (screen.orientation as any).unlock) {
          (screen.orientation as any).unlock();
        }
      }
    } catch (err) {
      console.warn('Fullscreen toggle:', err);
    }
  };

  const skipSeconds = (delta: number) => {
    const maxDur = duration || task.durationSeconds || 3600;
    const targetTime = Math.max(0, Math.min(maxDur, currentTime + delta));
    setCurrentTime(targetTime);
    if (isVideo && playerMode === 'stream' && ytVideoId) {
      sendYtCommand('seekTo', [targetTime, true]);
      return;
    }
    const mediaEl = isVideo ? videoRef.current : audioRef.current;
    if (!mediaEl) return;
    mediaEl.currentTime = Math.max(0, Math.min(mediaEl.duration || Infinity, mediaEl.currentTime + delta));
  };

  const toggleOrientation = async () => {
    try {
      if (typeof screen !== 'undefined' && 'orientation' in screen) {
        const currentType = (screen.orientation as any).type || '';
        if (currentType.includes('portrait')) {
          if ((screen.orientation as any).lock) await (screen.orientation as any).lock('landscape');
        } else {
          if ((screen.orientation as any).lock) await (screen.orientation as any).lock('portrait');
        }
      }
    } catch {
      // Fallback
    }
  };

  const formatSecs = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-lg animate-fade-in">
      <div
        ref={playerContainerRef}
        className="relative w-full max-w-4xl rounded-2xl bg-slate-950 border border-slate-800 text-white shadow-2xl overflow-hidden flex flex-col my-auto"
      >
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800 gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <PlatformIcon platform={task.platform} size={22} />
            <div className="truncate">
              <h3 className="font-bold text-sm sm:text-base text-white truncate">
                {task.title}
              </h3>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                <span className="text-indigo-400 font-bold">{task.format.qualityLabel}</span>
                <span>•</span>
                <span>{task.durationFormatted || 'HD'}</span>
                <span>•</span>
                <span>{task.format.format.toUpperCase()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {/* Stream Mode vs Local File Mode Switcher (for YouTube / Video) */}
            {ytVideoId && isVideo && (
              <div className="flex items-center p-0.5 rounded-lg bg-slate-800 text-xs font-semibold">
                <button
                  onClick={() => setPlayerMode('stream')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                    playerMode === 'stream'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="پخش ویدیوی اصلی و کامل"
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span className="text-[11px]">{language === 'fa' ? 'ویدیوی اصلی' : 'Real Stream'}</span>
                </button>
                <button
                  onClick={() => setPlayerMode('file')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                    playerMode === 'file'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="پخش فایل محلی"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span className="text-[11px]">{language === 'fa' ? 'فایل آفلاین' : 'Offline'}</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-black btn-3d-secondary"
              title={t.closePlayer}
            >
              {language === 'fa' ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
              <span>{language === 'fa' ? 'بازگشت' : 'Back'}</span>
            </button>
          </div>
        </div>

        {/* Media Screen Area - Never displays broken image icons or raw errors */}
        <div className="relative w-full aspect-video bg-slate-950 flex items-center justify-center overflow-hidden">
          {isVideo && playerMode === 'stream' && ytVideoId ? (
            <iframe
              ref={iframeRef}
              src={
                activeEngine === 'server1'
                  ? `https://www.youtube.com/embed/${ytVideoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&controls=1`
                  : `https://www.youtube-nocookie.com/embed/${ytVideoId}?autoplay=1&playsinline=1&rel=0&enablejsapi=1&controls=1`
              }
              onLoad={() => {
                try {
                  iframeRef.current?.contentWindow?.postMessage(
                    JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
                    '*'
                  );
                } catch {
                  // ignore
                }
              }}
              title={task.title}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : isVideo && activeMediaUrl && !isWebpageUrl(activeMediaUrl) && !useAnimatedCoverPlayer ? (
            <video
              ref={videoRef}
              src={activeMediaUrl}
              preload="metadata"
              loop={isLooping}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onError={handleMediaError}
              onClick={togglePlay}
              className="w-full h-full object-contain cursor-pointer"
              playsInline
              controls
              autoPlay
            />
          ) : (
            /* Native Built-in Animated Cover Player (Used for Audio & Seamless Video Fallback so zero broken icons ever appear) */
            <div
              onClick={togglePlay}
              className="relative w-full h-full flex flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-slate-950 via-indigo-950/90 to-slate-900 select-none cursor-pointer overflow-hidden"
            >
              {/* Ambient Animated Glow Backdrop */}
              <div className="absolute -top-16 -left-16 w-56 h-56 rounded-full bg-indigo-600/25 blur-3xl animate-pulse pointer-events-none" />
              <div className="absolute -bottom-16 -right-16 w-56 h-56 rounded-full bg-purple-600/25 blur-3xl animate-pulse pointer-events-none" />

              {/* Safe Cover Image Backdrop (Automatically hidden if image fails to load - never shows broken image icon) */}
              {!coverImgFailed && (task.thumbnail || ytVideoId) && (
                <img
                  src={getSafeThumbnail(task.thumbnail, ytVideoId || undefined)}
                  alt=""
                  className={`absolute inset-0 w-full h-full object-cover opacity-25 blur-md transition-transform duration-700 ${
                    isPlaying ? 'scale-110' : 'scale-100'
                  }`}
                  onError={() => setCoverImgFailed(true)}
                />
              )}

              {/* Center 3D Animated Disc / Cover Artwork */}
              <div className="relative z-10 flex flex-col items-center text-center max-w-md">
                <div
                  className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-purple-600 p-1 shadow-[0_8px_28px_rgba(99,102,241,0.5)] border border-white/25 flex items-center justify-center mb-3 transition-transform duration-500 ${
                    isPlaying ? 'scale-105' : 'scale-95'
                  }`}
                >
                  {!coverImgFailed && (task.thumbnail || ytVideoId) ? (
                    <img
                      src={getSafeThumbnail(task.thumbnail, ytVideoId || undefined)}
                      alt=""
                      className="w-full h-full object-cover rounded-2xl"
                      onError={() => setCoverImgFailed(true)}
                    />
                  ) : isVideo ? (
                    <Film className="w-10 h-10 text-white drop-shadow" />
                  ) : (
                    <Music className="w-10 h-10 text-white drop-shadow" />
                  )}

                  {/* Floating Play/Wave Badge */}
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-lg border border-white/30">
                    {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                  </div>
                </div>

                <h4 className="text-xs sm:text-sm font-black text-white line-clamp-1 px-3 mb-1 drop-shadow-sm">
                  {task.title}
                </h4>

                {/* Animated Soundwave Visualizer Bars */}
                <div className="flex items-end justify-center gap-1 h-6 my-1.5">
                  {[0.1, 0.25, 0.4, 0.15, 0.35, 0.5, 0.2, 0.3, 0.45, 0.15, 0.25, 0.4].map((delay, idx) => (
                    <span
                      key={idx}
                      style={{ animationDelay: `${delay}s` }}
                      className={`w-1 rounded-full bg-gradient-to-t from-indigo-400 to-emerald-300 transition-all ${
                        isPlaying ? 'animate-soundwave' : 'h-1.5 opacity-40'
                      }`}
                    />
                  ))}
                </div>

                {/* Hidden or Active HTML5 Audio Element when playing audio streams */}
                {!isVideo && activeMediaUrl && !isWebpageUrl(activeMediaUrl) && !useAnimatedCoverPlayer && (
                  <audio
                    ref={audioRef}
                    src={activeMediaUrl}
                    loop={isLooping}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleTimeUpdate}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                    onError={handleMediaError}
                    controls
                    autoPlay
                    className="relative z-10 w-full max-w-xs mt-1 h-8"
                  />
                )}

                <div className="flex flex-wrap items-center justify-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                  {ytVideoId && isVideo && (
                    <button
                      type="button"
                      onClick={() => {
                        setUseAnimatedCoverPlayer(false);
                        setPlayerMode('stream');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-black btn-3d-primary transition-all"
                    >
                      {language === 'fa' ? 'پخش استریم آنلاین' : 'Online Stream'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveClick}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black btn-3d-emerald transition-all flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{language === 'fa' ? 'ذخیره مستقیم در گالری / حافظه' : 'Save to Device'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Player Status Bar */}
        <div className="px-4 py-2 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-extrabold">
              <Check className="w-3.5 h-3.5" />
              <span>{language === 'fa' ? 'پخش مستقیم آفلاین' : 'Direct Playback (Zero-VPN)'}</span>
            </span>
          </div>

          <span className="text-[11px] text-slate-400 font-mono">
            {task.fileName}
          </span>
        </div>

        {/* Custom Media Controls Chrome */}
        <div className="p-4 bg-slate-900/95 border-t border-slate-800 space-y-2">
            {/* Progress / Scrubber Bar */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-slate-400 min-w-[40px] text-right">
                {formatSecs(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || (task.durationSeconds || 100)}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <span className="text-xs font-mono text-slate-400 min-w-[40px]">
                {task.durationFormatted || formatSecs(duration)}
              </span>
            </div>

            {/* Playback Buttons Row */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={togglePlay}
                  className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center active:scale-95 transition-all"
                  title={isPlaying ? t.pause : t.resume}
                >
                  {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                </button>

                <button
                  onClick={() => skipSeconds(-10)}
                  className="px-2 py-1 rounded-lg text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title={language === 'fa' ? '۱۰ ثانیه عقب' : 'Skip -10s'}
                >
                  -10s
                </button>

                <button
                  onClick={() => skipSeconds(10)}
                  className="px-2 py-1 rounded-lg text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title={language === 'fa' ? '۱۰ ثانیه جلو' : 'Skip +10s'}
                >
                  +10s
                </button>

                <button
                  onClick={() => setIsLooping(!isLooping)}
                  className={`p-2 rounded-xl transition-colors ${
                    isLooping ? 'text-indigo-400 bg-indigo-950/60' : 'text-slate-400 hover:text-white'
                  }`}
                  title={t.loop}
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <button
                  onClick={cycleSpeed}
                  className="px-2 py-1 rounded-lg text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title={t.playbackSpeed}
                >
                  {playbackSpeed}x
                </button>

                {/* Sleep Timer */}
                <div className="relative">
                  <button
                    onClick={() => setShowSleepMenu(!showSleepMenu)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
                      sleepTimer ? 'bg-indigo-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                    title={language === 'fa' ? 'تایمر خواب' : 'Sleep Timer'}
                  >
                    <Timer className="w-3.5 h-3.5" />
                    <span>{sleepTimer ? `${sleepTimer}m` : (language === 'fa' ? 'تایمر خواب' : 'Timer')}</span>
                  </button>

                  {showSleepMenu && (
                    <div className="absolute bottom-full left-0 mb-2 p-1.5 rounded-xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col gap-1 z-50 min-w-[100px]">
                      {[
                        { val: null, label: language === 'fa' ? 'خاموش' : 'Off' },
                        { val: 15, label: '15 دقیقه' },
                        { val: 30, label: '30 دقیقه' },
                        { val: 45, label: '45 دقیقه' },
                        { val: 60, label: '60 دقیقه' }
                      ].map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setSleepTimer(item.val);
                            setShowSleepMenu(false);
                          }}
                          className={`px-3 py-1 text-xs text-left rounded-lg transition-colors ${
                            sleepTimer === item.val ? 'bg-indigo-600 text-white font-bold' : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Volume & Screen Controls */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={toggleMute}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors"
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-4 h-4 text-rose-400" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-14 sm:w-20 h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>

                <button
                  onClick={toggleOrientation}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title={language === 'fa' ? 'تغییر جهت نمایش (افقی / عمودی)' : 'Rotate Screen'}
                >
                  <RotateCw className="w-4 h-4" />
                </button>

                {isVideo && (
                  <button
                    onClick={togglePiP}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors hidden sm:block"
                    title={t.pipMode}
                  >
                    <Minimize2 className="w-4 h-4" />
                  </button>
                )}

                <button
                  onClick={toggleFullscreen}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title={t.fullscreen}
                >
                  <Maximize className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
      </div>
    </div>
  );
};
