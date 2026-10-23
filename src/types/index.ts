export type PlatformId = 
  | 'youtube' 
  | 'tiktok' 
  | 'instagram' 
  | 'twitter' 
  | 'facebook' 
  | 'vimeo' 
  | 'soundcloud' 
  | 'pinterest' 
  | 'aparat'
  | 'generic';

export type MediaType = 'video' | 'audio';
export type VideoFormat = 'mp4' | 'webm';
export type AudioFormat = 'mp3' | 'm4a' | 'aac';
export type MediaFormat = VideoFormat | AudioFormat;

export interface FormatOption {
  id: string;
  type: MediaType;
  format: MediaFormat;
  qualityLabel: string; // e.g. "4K (2160p)", "1080p FHD", "320 kbps HQ"
  resolution?: string;  // e.g. "3840x2160"
  fps?: number;         // 60 or 30
  vCodec?: string;      // e.g. "AV01 (AV1)", "VP9.2 HDR", "AVC1 / H.264"
  aCodec?: string;      // e.g. "Opus 48kHz", "AAC-LC", "MP3 320k"
  bitrate?: string;     // e.g. "320 kbps", "18 Mbps"
  channels?: string;    // "Stereo 2.0"
  isHdr?: boolean;
  estimatedSizeBytes: number;
  estimatedSizeFormatted: string;
  directUrl?: string;   // Direct resolved stream URL when extracted per-format
}

export interface ParsedMediaInfo {
  id: string;
  originalUrl: string;
  videoId?: string;
  platform: PlatformId;
  title: string;
  author: string;
  authorAvatar?: string;
  durationSeconds: number;
  durationFormatted: string;
  viewsCount?: string;
  thumbnail: string;
  formats: FormatOption[];
  directVideoUrl?: string;
  directAudioUrl?: string;
  timestamp: number;
}

export type TaskStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'cancelled' | 'error';

export interface CustomMediaFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface DownloadTask {
  id: string;
  mediaId: string;
  originalUrl: string;
  videoId?: string;
  title: string;
  platform: PlatformId;
  thumbnail: string;
  durationFormatted?: string;
  durationSeconds?: number;
  format: FormatOption;
  status: TaskStatus;
  progressPercent: number;
  speedBytesPerSec: number;
  speedFormatted: string;
  downloadedBytes: number;
  totalBytes: number;
  downloadedSizeFormatted: string;
  totalSizeFormatted: string;
  elapsedSeconds: number;
  etaSeconds: number;
  blobUrl?: string;
  mediaBlob?: Blob;
  directUrl?: string;
  fileName: string;
  createdAt: number;
  completedAt?: number;
  scheduledTime?: string; // e.g. "14:30" for Scheduled Download
  isStarred?: boolean;
  isVaulted?: boolean;
  folderId?: string;
  errorMessage?: string;
}

export type UserCountryCode = 'IR' | 'IQ' | 'AE' | 'SA' | 'GCC' | 'INT';

export interface UserSession {
  isLoggedIn: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    country?: UserCountryCode;
    passwordHash?: string;
    avatarUrl?: string;
    plan: 'Free' | 'VIP Pro';
    quotaUsedMb: number;
    quotaMaxMb: number;
  };
}

export type Language = 'fa' | 'en' | 'ar';
export type ThemeMode = 'dark' | 'light';

export interface AppSettings {
  language: Language;
  theme: ThemeMode;
  autoPlayAfterDownload: boolean;
  autoSaveToDevice: boolean;
  autoSniffClipboard: boolean;
  downloadPathHint: string;
  chunkConcurrency: number;
}
