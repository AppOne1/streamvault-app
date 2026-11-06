import React, { useEffect, useRef, useState } from 'react';
import { DownloadTask, Language } from '../types';
import { getTranslation } from '../i18n/translations';
import { PlatformIcon } from './PlatformIcon';
import { getMediaBlobFromIDB, getOfflineMedia } from '../services/storageService';
import {
  extractYouTubeVideoId,
  getApiUrl,
  getSafeThumbnail,
  isWebpageUrl
} from '../services/platformDetector';
import { resolveDirectMediaStream } from '../services/mediaExtractor';
import { downloadEngine } from '../services/downloadEngine';
import { MIN_VALID_AUDIO_BYTES, MIN_VALID_VIDEO_BYTES } from '../services/nativeStorage';
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
  ArrowLeft,
  AlertTriangle
} from 'lucide-react';

interface BuiltInMediaPlayerProps {
  language: Language;
  task: DownloadTask | null;
  onClose: () => void;
  onSaveToDisk: (task: DownloadTask) => void;
}

const isLikelyVerticalVideo = (task: DownloadTask | null): boolean => {
  if (!task) return false;
  const u = (task.originalUrl || '').toLowerCase();
  if (
    task.platform === 'tiktok' ||
    task.platform === 'instagram' ||
    u.includes('/shorts/') ||
    u.includes('/reel/') ||
    u.includes('/reels/') ||
    u.includes('/stories/') ||
    u.includes('tiktok.com')
  ) {
    return true;
  }
  return false;
};

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
  const videoFallbackTriedRef = useRef<boolean>(false);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(task?.durationSeconds || 0);
  const [volume, setVolume] = useState<number>(0.9);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState<boolean>(false);
  const [isLandscapeRotated, setIsLandscapeRotated] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [hasOfflineBlob, setHasOfflineBlob] = useState<boolean>(false);
  const [videoAspect, setVideoAspect] = useState<'landscape' | 'portrait'>(() =>
    isLikelyVerticalVideo(task) ? 'portrait' : 'landscape'
  );
  const [isViewportPortrait, setIsViewportPortrait] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );
  const [activeMediaUrl, setActiveMediaUrl] = useState<string | null>(null);
  const [sleepTimer, setSleepTimer] = useState<number | null>(null);
  const [showSleepMenu, setShowSleepMenu] = useState<boolean>(false);
  const [fitMode, setFitMode] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [videoFilter, setVideoFilter] = useState<'normal' | 'vivid' | 'cinema' | 'night'>('normal');
  const [audioBoost, setAudioBoost] = useState<1 | 1.5 | 2>(1);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const connectedMediaElRef = useRef<HTMLMediaElement | null>(null);

  // Detect YouTube ID for authentic real video playback
  const ytVideoId = task?.videoId || (task?.originalUrl ? extractYouTubeVideoId(task.originalUrl) : null);
  const [activeEngine] = useState<'server1' | 'server2'>('server1');

  // Default to local file mode so offline blobs play directly in HTML5 <video> without internet
  const [playerMode, setPlayerMode] = useState<'stream' | 'file'>('file');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveStatusText, setSaveStatusText] = useState<string | null>(null);
  const [useAnimatedCoverPlayer, setUseAnimatedCoverPlayer] = useState<boolean>(false);
  const [videoRenderError, setVideoRenderError] = useState<string | null>(null);
  const [coverImgFailed, setCoverImgFailed] = useState<boolean>(false);

  // Unlock screen orientation on mount & listen for viewport rotation / fullscreen changes
  useEffect(() => {
    setVideoAspect(isLikelyVerticalVideo(task) ? 'portrait' : 'landscape');
  }, [task]);

  useEffect(() => {
    // Use 'user' orientation mode in native APK so OS rotation ONLY occurs if the user's phone Auto-Rotate is unlocked
    try {
      (window as any).OneDownloadNative?.setScreenOrientation?.('user');
    } catch {
      // ignore
    }

    const updateViewportAndFullscreen = () => {
      if (typeof window !== 'undefined') {
        const portrait = window.innerHeight >= window.innerWidth;
        setIsViewportPortrait(portrait);
        // If native OS viewport rotated into landscape (when phone Auto-Rotate is ON), clear manual CSS rotation
        if (!portrait) {
          setIsLandscapeRotated(false);
        }
      }
      const fsEl =
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        null;
      setIsFullscreen(Boolean(fsEl));
    };

    window.addEventListener('resize', updateViewportAndFullscreen);
    window.addEventListener('orientationchange', updateViewportAndFullscreen);
    document.addEventListener('fullscreenchange', updateViewportAndFullscreen);
    document.addEventListener('webkitfullscreenchange', updateViewportAndFullscreen as any);

    return () => {
      window.removeEventListener('resize', updateViewportAndFullscreen);
      window.removeEventListener('orientationchange', updateViewportAndFullscreen);
      document.removeEventListener('fullscreenchange', updateViewportAndFullscreen);
      document.removeEventListener('webkitfullscreenchange', updateViewportAndFullscreen as any);
      try {
        (window as any).OneDownloadNative?.setScreenOrientation?.('portrait');
      } catch {
        // ignore
      }
      try {
        if (typeof screen !== 'undefined' && 'orientation' in screen && (screen.orientation as any)?.lock) {
          (screen.orientation as any).lock('portrait-primary').catch(() => {});
        }
      } catch {
        // ignore
      }
    };
  }, [task?.format.type]);

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

  // Load / resolve playable Blob URL from memory or IndexedDB offline_media store, or progressive stream
  useEffect(() => {
    if (!task) return;

    let isMounted = true;
    let createdObjectUrl: string | null = null;
    const isAudio = task.format.type === 'audio';
    const minValidBytes = isAudio ? MIN_VALID_AUDIO_BYTES : MIN_VALID_VIDEO_BYTES;
    const heightMatch = task.format.qualityLabel.match(/\d+/);
    const requestedHeight = heightMatch ? heightMatch[0] : '720';
    videoFallbackTriedRef.current = false;

    const resolveBlob = async () => {
      setUseAnimatedCoverPlayer(false);
      setVideoRenderError(null);
      setCoverImgFailed(false);
      setHasOfflineBlob(false);
      setActiveMediaUrl(null);

      // 1. Unified Offline Binary Resolver (Memory + IndexedDB offline_media + CacheStorage, verified >= 120 KB for video)
      const verifiedOfflineBlob = await downloadEngine.getTaskMediaBlob(task);
      if (verifiedOfflineBlob && verifiedOfflineBlob.size >= minValidBytes) {
        const url = URL.createObjectURL(verifiedOfflineBlob);
        createdObjectUrl = url;
        task.blobUrl = url;
        task.mediaBlob = verifiedOfflineBlob;
        if (isMounted) {
          setHasOfflineBlob(true);
          setVideoRenderError(null);
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
        setHasOfflineBlob(true);
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
        setHasOfflineBlob(true);
        setActiveMediaUrl(url);
        setPlayerMode('file');
        return;
      }

      // 3b. Try Cache API store (onedownload-offline-media-v1) -> URL.createObjectURL(blob)
      if (typeof window !== 'undefined' && 'caches' in window) {
        try {
          const cache = await caches.open('onedownload-offline-media-v1');
          const cachedResp = await cache.match(`/offline-media/${encodeURIComponent(task.id)}`);
          if (cachedResp) {
            const cachedBlob = await cachedResp.blob();
            if (cachedBlob && cachedBlob.size >= minValidBytes && isMounted) {
              const url = URL.createObjectURL(cachedBlob);
              createdObjectUrl = url;
              task.blobUrl = url;
              task.mediaBlob = cachedBlob;
              setHasOfflineBlob(true);
              setActiveMediaUrl(url);
              setPlayerMode('file');
              return;
            }
          }
        } catch {
          // ignore Cache API error
        }
      }

      // 4. Resolve live online stream directly (Backend / SaveVideo / TikWM / Aparat) so token is always fresh
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

      // 5. Try direct stream URL if already resolved
      if (task.directUrl && !isWebpageUrl(task.directUrl) && isMounted) {
        setActiveMediaUrl(task.directUrl);
        setPlayerMode('file');
        return;
      }

      // 6. Use progressive stream endpoint (/api/media/stream)
      if (task.originalUrl && isMounted) {
        const progressiveUrl = getApiUrl(
          `/api/media/stream?url=${encodeURIComponent(
            task.originalUrl
          )}&quality=${requestedHeight}&audio=${isAudio ? '1' : '0'}`
        );
        setActiveMediaUrl(progressiveUrl);
        setPlayerMode('file');
        return;
      }

      if (isMounted) {
        if (isAudio) {
          setUseAnimatedCoverPlayer(true);
        } else {
          setVideoRenderError('خطا در رندر فایل ویدیو');
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

  // Simulated progress ticker when in audio cover player mode or YouTube stream fallback
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
    if (!videoFallbackTriedRef.current) {
      videoFallbackTriedRef.current = true;
      try {
        const onlineStream = await resolveDirectMediaStream(
          task.originalUrl,
          task.format.type,
          task.format.qualityLabel
        );
        if (onlineStream && onlineStream.url && onlineStream.url !== activeMediaUrl) {
          task.directUrl = onlineStream.url;
          setActiveMediaUrl(onlineStream.url);
          setVideoRenderError(null);
          return;
        }
      } catch {
        // Fall through to explicit error message below
      }
    }

    if (isVideo) {
      if (ytVideoId) {
        setVideoRenderError(null);
        setPlayerMode('stream');
        setIsPlaying(true);
        return;
      }
      setIsPlaying(false);
      setUseAnimatedCoverPlayer(false);
      setVideoRenderError('خطا در رندر فایل ویدیو');
      return;
    }

    setUseAnimatedCoverPlayer(true);
    setIsPlaying(true);
  };

  const togglePlay = () => {
    if (isVideo && videoRenderError) {
      return;
    }

    if (isVideo && playerMode === 'stream' && ytVideoId && !hasOfflineBlob) {
      if (isPlaying) {
        sendYtCommand('pauseVideo');
        setIsPlaying(false);
      } else {
        sendYtCommand('playVideo');
        setIsPlaying(true);
      }
      return;
    }

    if (!isVideo && useAnimatedCoverPlayer) {
      setIsPlaying((prev) => !prev);
      return;
    }
    const mediaEl = isVideo ? videoRef.current : audioRef.current;
    if (!mediaEl) {
      if (isVideo) {
        setVideoRenderError('خطا در رندر فایل ویدیو');
      } else {
        setUseAnimatedCoverPlayer(true);
        setIsPlaying((prev) => !prev);
      }
      return;
    }

    if (isPlaying) {
      mediaEl.pause();
      setIsPlaying(false);
    } else {
      mediaEl
        .play()
        .then(() => {
          setVideoRenderError(null);
          setIsPlaying(true);
        })
        .catch(() => {
          if (isVideo) {
            setIsPlaying(false);
            setVideoRenderError('خطا در رندر فایل ویدیو');
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
      if (isVideo && videoRef.current) {
        const vw = videoRef.current.videoWidth;
        const vh = videoRef.current.videoHeight;
        if (vw > 0 && vh > 0) {
          setVideoAspect(vh > vw ? 'portrait' : 'landscape');
        }
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

  const cycleFitMode = () => {
    const modes: Array<'contain' | 'cover' | 'fill'> = ['contain', 'cover', 'fill'];
    setFitMode((prev) => modes[(modes.indexOf(prev) + 1) % modes.length]);
  };

  const cycleVideoFilter = () => {
    const filters: Array<'normal' | 'vivid' | 'cinema' | 'night'> = ['normal', 'vivid', 'cinema', 'night'];
    setVideoFilter((prev) => filters[(filters.indexOf(prev) + 1) % filters.length]);
  };

  const cycleAudioBoost = () => {
    const boosts: Array<1 | 1.5 | 2> = [1, 1.5, 2];
    const nextBoost = boosts[(boosts.indexOf(audioBoost) + 1) % boosts.length];
    setAudioBoost(nextBoost);
    try {
      const mediaEl = isVideo ? videoRef.current : audioRef.current;
      if (mediaEl) {
        if (!audioCtxRef.current) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            const gain = ctx.createGain();
            const source = ctx.createMediaElementSource(mediaEl);
            source.connect(gain);
            gain.connect(ctx.destination);
            audioCtxRef.current = ctx;
            gainNodeRef.current = gain;
            connectedMediaElRef.current = mediaEl;
          }
        }
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume().catch(() => {});
        }
        if (gainNodeRef.current) {
          gainNodeRef.current.gain.value = nextBoost;
        }
      }
    } catch {
      // If cross-origin stream prevents MediaElementSource, fallback to max native volume
      const mediaEl = isVideo ? videoRef.current : audioRef.current;
      if (mediaEl) mediaEl.volume = 1;
    }
  };

  const videoFilterStyle =
    videoFilter === 'vivid'
      ? 'contrast(1.12) saturate(1.25) brightness(1.04)'
      : videoFilter === 'cinema'
      ? 'contrast(1.18) saturate(1.1) sepia(0.08)'
      : videoFilter === 'night'
      ? 'brightness(0.85) contrast(1.08)'
      : 'none';

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
    try {
      // Unlock orientation so physical phone rotation works freely
      if (typeof screen !== 'undefined' && 'orientation' in screen && (screen.orientation as any)?.unlock) {
        try {
          (screen.orientation as any).unlock();
        } catch {
          // ignore
        }
      }

      const fsElement =
        document.fullscreenElement || (document as any).webkitFullscreenElement;

      if (fsElement || isCssFullscreen) {
        if (fsElement) {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          } else if ((document as any).webkitExitFullscreen) {
            await (document as any).webkitExitFullscreen();
          }
        }
        setIsFullscreen(false);
        setIsCssFullscreen(false);
        setIsLandscapeRotated(false);
      } else {
        const container = playerContainerRef.current;
        let enteredNativeFs = false;
        if (container) {
          if (container.requestFullscreen) {
            await container
              .requestFullscreen()
              .then(() => {
                enteredNativeFs = true;
              })
              .catch(() => {});
          } else if ((container as any).webkitRequestFullscreen) {
            try {
              (container as any).webkitRequestFullscreen();
              enteredNativeFs = true;
            } catch {
              // fallback to CSS fullscreen
            }
          }
        }
        setIsFullscreen(true);
        if (!enteredNativeFs) {
          setIsCssFullscreen(true);
        }
        // For widescreen videos on a portrait phone, try locking orientation to landscape or applying cinema mode
        if (videoAspect === 'landscape' && isViewportPortrait) {
          if (typeof screen !== 'undefined' && 'orientation' in screen && (screen.orientation as any)?.lock) {
            await (screen.orientation as any).lock('landscape').catch(() => {});
          }
        }
      }
    } catch {
      setIsCssFullscreen((prev) => !prev);
      setIsFullscreen((prev) => !prev);
    }
  };

  const skipSeconds = (delta: number) => {
    const maxDur = duration || task.durationSeconds || 3600;
    const targetTime = Math.max(0, Math.min(maxDur, currentTime + delta));
    setCurrentTime(targetTime);
    if (isVideo && playerMode === 'stream' && ytVideoId && !hasOfflineBlob) {
      sendYtCommand('seekTo', [targetTime, true]);
      return;
    }
    const mediaEl = isVideo ? videoRef.current : audioRef.current;
    if (!mediaEl) return;
    mediaEl.currentTime = Math.max(0, Math.min(mediaEl.duration || Infinity, mediaEl.currentTime + delta));
  };

  const toggleOrientation = async () => {
    try {
      const nextRotated = !isLandscapeRotated;
      if (!isFullscreen && !isCssFullscreen) {
        setIsCssFullscreen(true);
        setIsFullscreen(true);
      }

      // 1. Native Android APK Bridge orientation switch
      const nativeBridge = typeof window !== 'undefined' ? (window as any).OneDownloadNative : null;
      if (nativeBridge && typeof nativeBridge.setScreenOrientation === 'function') {
        const isCurrentlyLandscape =
          typeof window !== 'undefined' && window.innerWidth > window.innerHeight;
        nativeBridge.setScreenOrientation(isCurrentlyLandscape ? 'portrait' : 'landscape');
        setIsLandscapeRotated(false);
        return;
      }

      // 2. Web Screen Orientation API
      if (typeof screen !== 'undefined' && 'orientation' in screen) {
        const orient = screen.orientation as any;
        const currentType = orient?.type || '';
        if (orient?.lock) {
          let lockedNative = false;
          if (currentType.includes('portrait')) {
            await orient
              .lock('landscape')
              .then(() => {
                lockedNative = true;
              })
              .catch(() => {});
          } else {
            await orient
              .lock('portrait')
              .then(() => {
                lockedNative = true;
              })
              .catch(() => {});
          }
          if (lockedNative) {
            setIsLandscapeRotated(false);
            return;
          }
        }
      }

      // 3. CSS Fixed Cinema Landscape Rotation Fallback
      setIsLandscapeRotated(nextRotated);
    } catch {
      setIsLandscapeRotated((prev) => !prev);
    }
  };

  const formatSecs = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const activeFullscreen = isFullscreen || isCssFullscreen || isLandscapeRotated;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-lg animate-fade-in ${
        activeFullscreen ? 'p-0' : 'p-2 sm:p-4'
      }`}
    >
      <div
        ref={playerContainerRef}
        style={
          isLandscapeRotated
            ? {
                position: 'fixed',
                top: '50%',
                left: '50%',
                width: '100dvh',
                height: '100vw',
                transform: 'translate(-50%, -50%) rotate(90deg)',
                transformOrigin: 'center center',
                zIndex: 60
              }
            : undefined
        }
        className={`bg-slate-950 text-white shadow-2xl overflow-hidden flex flex-col ${
          isLandscapeRotated
            ? 'max-w-none rounded-none border-0'
            : activeFullscreen
            ? 'fixed inset-0 w-screen h-dvh max-w-none rounded-none border-0 z-50'
            : videoAspect === 'portrait' && isViewportPortrait
            ? 'relative w-full max-w-md rounded-2xl border border-slate-800 my-auto max-h-[96dvh]'
            : 'relative w-full max-w-4xl rounded-2xl border border-slate-800 my-auto max-h-[96dvh]'
        }`}
      >
        {/* Top Header Bar - Auto-hides in Fullscreen/Rotated mode when showControls is false */}
        <div
          className={`flex items-center justify-between px-3.5 py-2 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 gap-2 shrink-0 transition-opacity duration-200 ${
            activeFullscreen
              ? `absolute top-0 left-0 right-0 z-30 ${
                  showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`
              : ''
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <PlatformIcon platform={task.platform} size={20} />
            <div className="truncate">
              <h3 className="font-bold text-xs sm:text-sm text-white truncate">
                {task.title}
              </h3>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                <span className="text-indigo-400 font-bold">{task.format.qualityLabel}</span>
                <span>•</span>
                <span>{task.format.format.toUpperCase()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {ytVideoId && isVideo && (
              <div className="flex items-center p-0.5 rounded-lg bg-slate-800 text-[11px] font-semibold">
                <button
                  onClick={() => setPlayerMode('stream')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                    playerMode === 'stream'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Tv className="w-3 h-3" />
                  <span>{language === 'fa' ? 'اصلی' : 'Stream'}</span>
                </button>
                <button
                  onClick={() => setPlayerMode('file')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                    playerMode === 'file'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <HardDrive className="w-3 h-3" />
                  <span>{language === 'fa' ? 'آفلاین' : 'Offline'}</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                try {
                  (window as any).OneDownloadNative?.setScreenOrientation?.('portrait');
                } catch {}
                setIsLandscapeRotated(false);
                setIsCssFullscreen(false);
                setIsFullscreen(false);
                onClose();
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-black btn-3d-secondary cursor-pointer"
              title={t.closePlayer}
            >
              {language === 'fa' ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
              <span>{language === 'fa' ? 'بازگشت' : 'Back'}</span>
            </button>
          </div>
        </div>

        {/* Media Screen Area - Guaranteed full height in Fullscreen & Rotated modes */}
        <div
          onClick={() => {
            if (activeFullscreen) {
              setShowControls((prev) => !prev);
            }
          }}
          className={`relative w-full bg-black flex items-center justify-center overflow-hidden ${
            activeFullscreen
              ? 'w-full h-full flex-1 min-h-0'
              : videoAspect === 'portrait' && isViewportPortrait
              ? 'aspect-[9/16] max-h-[68dvh] min-h-[260px]'
              : 'aspect-video max-h-[68dvh] min-h-[220px]'
          }`}
        >
          {/* Floating Quick Fullscreen & Orientation Controls Overlay */}
          {isVideo && (!activeFullscreen || showControls) && (
            <div
              className={`absolute ${
                activeFullscreen ? 'top-14' : 'top-3'
              } right-3 z-20 flex items-center gap-1.5 pointer-events-auto`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleOrientation();
                }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-white text-[11px] font-bold backdrop-blur-md border shadow-lg transition-all cursor-pointer ${
                  isLandscapeRotated
                    ? 'bg-emerald-600/90 border-emerald-400/50'
                    : 'bg-black/65 hover:bg-indigo-600/90 border-white/15'
                }`}
                title={language === 'fa' ? 'چرخش افقی / عمودی ویدیو' : 'Toggle Horizontal / Vertical'}
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>
                  {isLandscapeRotated
                    ? language === 'fa'
                      ? 'حالت عمودی'
                      : 'Vertical'
                    : language === 'fa'
                    ? 'حالت افقی (چرخش)'
                    : language === 'ar'
                    ? 'الوضع الأفقي'
                    : 'Horizontal'}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-black/65 hover:bg-indigo-600/90 text-white text-[11px] font-bold backdrop-blur-md border border-white/15 shadow-lg transition-all cursor-pointer"
                title={t.fullscreen}
              >
                {activeFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
                <span>
                  {activeFullscreen
                    ? language === 'fa'
                      ? 'خروج از تمام‌صفحه'
                      : 'Exit Fullscreen'
                    : language === 'fa'
                    ? 'تمام‌صفحه'
                    : 'Fullscreen'}
                </span>
              </button>
            </div>
          )}

          {isVideo && playerMode === 'stream' && ytVideoId && !hasOfflineBlob ? (
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
          ) : isVideo && videoRenderError ? (
            <div className="relative w-full h-full flex flex-col items-center justify-center p-6 bg-slate-950 text-center select-none">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-3 shadow-lg">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h4 className="text-base sm:text-lg font-black text-rose-400 mb-1.5">
                خطا در رندر فایل ویدیو
              </h4>
              <p className="text-xs text-slate-400 max-w-md mb-4 leading-relaxed">
                {language === 'fa'
                  ? 'فایل ویدیو ناقص است یا لینک پخش مستقیم منقضی شده است. لطفاً مجدداً استریم مستقیم را بارگذاری کنید.'
                  : 'Video file could not be rendered or stream link expired. Please reload the direct stream.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={async () => {
                    setVideoRenderError(null);
                    videoFallbackTriedRef.current = false;
                    try {
                      const onlineStream = await resolveDirectMediaStream(
                        task.originalUrl,
                        task.format.type,
                        task.format.qualityLabel
                      );
                      if (onlineStream && onlineStream.url) {
                        task.directUrl = onlineStream.url;
                        setActiveMediaUrl(onlineStream.url);
                        setPlayerMode('file');
                        return;
                      }
                    } catch {
                      // ignore
                    }
                    setVideoRenderError('خطا در رندر فایل ویدیو');
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black btn-3d-primary transition-all flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{language === 'fa' ? 'تلاش مجدد پخش ویدیو' : 'Retry Video Playback'}</span>
                </button>
                {ytVideoId && (
                  <button
                    type="button"
                    onClick={() => {
                      setVideoRenderError(null);
                      setPlayerMode('stream');
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-black btn-3d-secondary transition-all flex items-center gap-1.5"
                  >
                    <Tv className="w-3.5 h-3.5" />
                    <span>{language === 'fa' ? 'پخش استریم آنلاین' : 'Online Stream'}</span>
                  </button>
                )}
              </div>
            </div>
          ) : isVideo && !activeMediaUrl ? (
            <div className="relative w-full h-full flex flex-col items-center justify-center p-6 bg-slate-950 text-center select-none">
              <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mb-3" />
              <p className="text-xs sm:text-sm font-bold text-slate-300">
                {language === 'fa' ? 'در حال آماده‌سازی و بارگذاری ویدیو...' : 'Loading video stream...'}
              </p>
            </div>
          ) : isVideo ? (
            <video
              ref={videoRef}
              src={activeMediaUrl || undefined}
              preload="auto"
              loop={isLooping}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleTimeUpdate}
              onCanPlay={() => setVideoRenderError(null)}
              onPlay={() => {
                setVideoRenderError(null);
                setIsPlaying(true);
              }}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onError={handleMediaError}
              onClick={togglePlay}
              style={{ filter: videoFilterStyle }}
              className={`w-full h-full max-w-full max-h-full cursor-pointer bg-black ${
                fitMode === 'cover'
                  ? 'object-cover'
                  : fitMode === 'fill'
                  ? 'object-fill'
                  : 'object-contain'
              }`}
              playsInline
              controls
              autoPlay
            />
          ) : (
            /* Native Built-in Audio Cover Player (Exclusively for Audio files) */
            <div
              onClick={togglePlay}
              className="relative w-full h-full flex flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-slate-950 via-indigo-950/90 to-slate-900 select-none cursor-pointer overflow-hidden"
            >
              {/* Ambient Animated Glow Backdrop */}
              <div className="absolute -top-16 -left-16 w-56 h-56 rounded-full bg-indigo-600/25 blur-3xl animate-pulse pointer-events-none" />
              <div className="absolute -bottom-16 -right-16 w-56 h-56 rounded-full bg-purple-600/25 blur-3xl animate-pulse pointer-events-none" />

              {/* Safe Cover Image Backdrop */}
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

                {/* Active HTML5 Audio Element when playing audio streams */}
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

        {/* Custom Media Controls Chrome (Floating Overlay in Fullscreen/Rotated mode, Clean Compact Bar in Window mode) */}
        <div
          onClick={(e) => e.stopPropagation()}
          className={`p-3 bg-slate-900/95 backdrop-blur-md border-t border-slate-800/80 space-y-2 transition-opacity duration-200 ${
            activeFullscreen
              ? `absolute bottom-0 left-0 right-0 z-30 ${
                  showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`
              : ''
          }`}
        >
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

                {/* Audio Boost Button (100% / 150% / 200%) */}
                <button
                  type="button"
                  onClick={cycleAudioBoost}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                    audioBoost > 1
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                  title={language === 'fa' ? 'تقویت صدای پخش' : 'Audio Boost'}
                >
                  {language === 'fa' ? `صدا ${Math.round(audioBoost * 100)}%` : `Boost ${Math.round(audioBoost * 100)}%`}
                </button>

                {/* Video Fit & Visual Filter Controls */}
                {isVideo && (
                  <>
                    <button
                      type="button"
                      onClick={cycleFitMode}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                        fitMode !== 'contain'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                      title={language === 'fa' ? 'تنظیم کادر تصویر' : 'Aspect Fit'}
                    >
                      {fitMode === 'contain'
                        ? language === 'fa'
                          ? 'کادر: عادی'
                          : 'Fit'
                        : fitMode === 'cover'
                        ? language === 'fa'
                          ? 'کادر: زوم'
                          : 'Zoom'
                        : language === 'fa'
                        ? 'کادر: پر'
                        : 'Stretch'}
                    </button>

                    <button
                      type="button"
                      onClick={cycleVideoFilter}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                        videoFilter !== 'normal'
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                      title={language === 'fa' ? 'بهبود رنگ و تصویر' : 'Video Filter'}
                    >
                      {videoFilter === 'normal'
                        ? language === 'fa'
                          ? 'تصویر: عادی'
                          : 'Normal'
                        : videoFilter === 'vivid'
                        ? language === 'fa'
                          ? 'تصویر: شفاف'
                          : 'Vivid'
                        : videoFilter === 'cinema'
                        ? language === 'fa'
                          ? 'تصویر: سینمایی'
                          : 'Cinema'
                        : language === 'fa'
                        ? 'تصویر: شب'
                        : 'Night'}
                    </button>
                  </>
                )}

                <button
                  onClick={toggleOrientation}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    isLandscapeRotated
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                  title={language === 'fa' ? 'تغییر جهت نمایش (افقی / عمودی)' : 'Rotate Screen'}
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span className="text-[11px]">
                    {isLandscapeRotated
                      ? language === 'fa'
                        ? 'عمودی'
                        : 'Portrait'
                      : language === 'fa'
                      ? 'افقی'
                      : 'Landscape'}
                  </span>
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
                  className={`p-2 rounded-xl transition-colors ${
                    activeFullscreen
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                  title={t.fullscreen}
                >
                  {activeFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
      </div>
    </div>
  );
};
