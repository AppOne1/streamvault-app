import React, { useState } from 'react';
import { DownloadTask, Language, TaskStatus } from '../types';
import { PlatformIcon } from './PlatformIcon';
import { getTranslation } from '../i18n/translations';
import { extractUrlFromText, getSafeThumbnail, SAMPLE_URLS } from '../services/platformDetector';
import { formatDownloadTimestamp } from '../services/downloadEngine';
import { shareDownloadedMediaFile } from '../services/deviceService';
import {
  Play,
  Pause,
  RotateCcw,
  Trash2,
  CheckCircle2,
  Clock,
  Gauge,
  XCircle,
  PauseCircle,
  PlayCircle,
  Layers,
  ListPlus,
  HardDrive,
  ArrowRight,
  ArrowLeft,
  Share2
} from 'lucide-react';

interface DownloadManagerProps {
  language: Language;
  tasks: DownloadTask[];
  onPauseTask: (task: DownloadTask) => void;
  onResumeTask: (task: DownloadTask) => void;
  onCancelTask: (task: DownloadTask) => void;
  onRetryTask: (task: DownloadTask) => void;
  onDeleteTask: (taskId: string) => void;
  onPlayMedia: (task: DownloadTask) => void;
  onSaveToDisk: (task: DownloadTask) => void;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onClearCompleted: () => void;
  onStartBatchDownload?: (urls: string[], qualityPreset: '1080p' | '720p' | 'mp3') => void;
  onBackToHome?: () => void;
}

const toFaDigits = (val: string | number): string =>
  String(val).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

export const DownloadManager: React.FC<DownloadManagerProps> = ({
  language,
  tasks,
  onPauseTask,
  onResumeTask,
  onCancelTask,
  onRetryTask,
  onDeleteTask,
  onPlayMedia,
  onSaveToDisk,
  onPauseAll,
  onResumeAll,
  onClearCompleted,
  onStartBatchDownload,
  onBackToHome
}) => {
  const t = getTranslation(language);
  const isFa = language === 'fa';
  const isAr = language === 'ar';
  const isRtl = isFa || isAr;

  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'paused'>('all');
  const [isBatchModalOpen, setIsBatchModalOpen] = useState<boolean>(false);
  const [batchText, setBatchText] = useState<string>('');
  const [batchPreset, setBatchPreset] = useState<'1080p' | '720p' | 'mp3'>('1080p');

  const filteredTasks = tasks.filter((task) => {
    if (filter === 'active') return task.status === 'downloading' || task.status === 'queued';
    if (filter === 'completed') return task.status === 'completed';
    if (filter === 'paused') return task.status === 'paused';
    return true;
  });

  const activeCount = tasks.filter((t) => t.status === 'downloading' || t.status === 'queued').length;
  const queuedCount = tasks.filter((t) => t.status === 'queued').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const pausedCount = tasks.filter((t) => t.status === 'paused').length;

  // Aggregate Batch Queue Metrics (Overall %, Total Speed, Total Queue Size)
  const totalQueueBytes = tasks.reduce((sum, item) => sum + (item.totalBytes || 0), 0);
  const totalDownloadedBytes = tasks.reduce((sum, item) => sum + (item.downloadedBytes || 0), 0);
  const overallQueuePercent =
    tasks.length === 0
      ? 0
      : totalQueueBytes > 0
      ? Math.min(100, Math.round((totalDownloadedBytes / totalQueueBytes) * 100))
      : Math.round(tasks.reduce((sum, item) => sum + item.progressPercent, 0) / tasks.length);

  const combinedSpeedBytes = tasks
    .filter((t) => t.status === 'downloading')
    .reduce((sum, item) => sum + (item.speedBytesPerSec || 0), 0);

  const formatMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  const combinedSpeedFormatted =
    combinedSpeedBytes > 0 ? `${(combinedSpeedBytes / (1024 * 1024)).toFixed(1)} MB/s` : '0.0 MB/s';

  // Clean non-duplicated volume display (e.g. "6.5 MB" instead of "6.5 MB / 6.5 MB")
  const totalVolumeFormatted =
    totalDownloadedBytes > 0 && totalDownloadedBytes < totalQueueBytes
      ? `${formatMb(totalDownloadedBytes)} / ${formatMb(totalQueueBytes)}`
      : formatMb(totalQueueBytes);

  const handleBatchSubmit = () => {
    const lines = batchText
      .split(/[\r\n]+/)
      .map((line) => extractUrlFromText(line) || line.trim())
      .filter((u) => /^https?:\/\//i.test(u));

    if (lines.length === 0 || !onStartBatchDownload) return;
    onStartBatchDownload(lines, batchPreset);
    setBatchText('');
    setIsBatchModalOpen(false);
  };

  return (
    <section className="w-full max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5">
      {/* Header & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center justify-between sm:justify-start gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white drop-shadow-sm text-3d">
              {t.downloadsHeader}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isFa
                ? `مدیریت صف دانلود نوبتی و پایدار • ${toFaDigits(tasks.length)} فایل (${toFaDigits(activeCount)} در صف فعال)`
                : isAr
                ? `إدارة قائمة انتظار التحميل المتسلسل • ${toFaDigits(tasks.length)} ملفات (${toFaDigits(activeCount)} نشط)`
                : `Sequential Queue Download Manager • ${tasks.length} tasks (${activeCount} active)`}
            </p>
          </div>
          {onBackToHome && (
            <button
              type="button"
              onClick={onBackToHome}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-black btn-3d-secondary shrink-0"
            >
              {isRtl ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
              <span>{isFa ? 'بازگشت' : isAr ? 'رجوع' : 'Back'}</span>
            </button>
          )}
        </div>

        {/* Global Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {onStartBatchDownload && (
            <button
              type="button"
              onClick={() => setIsBatchModalOpen(!isBatchModalOpen)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 btn-3d-primary transition-all"
            >
              <ListPlus className="w-4 h-4" />
              <span>
                {isFa
                  ? '+ افزودن دسته‌جمعی لینک‌ها'
                  : isAr
                  ? '+ إضافة روابط متعددة'
                  : '+ Batch Add Links'}
              </span>
            </button>
          )}

          {activeCount > 0 && (
            <button
              onClick={onPauseAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 btn-3d-secondary transition-colors"
            >
              <PauseCircle className="w-3.5 h-3.5 text-amber-500" />
              <span>{t.pauseAll}</span>
            </button>
          )}

          {pausedCount > 0 && (
            <button
              onClick={onResumeAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 btn-3d-secondary transition-colors"
            >
              <PlayCircle className="w-3.5 h-3.5 text-indigo-500" />
              <span>{t.resumeAll}</span>
            </button>
          )}

          {completedCount > 0 && (
            <button
              onClick={onClearCompleted}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 btn-3d-secondary transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>{t.clearCompleted}</span>
            </button>
          )}
        </div>
      </div>

      {/* Internet / VPN Speed & Foreground Keep-Alive Banner */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 text-xs font-bold text-amber-800 dark:text-amber-300 leading-relaxed">
        <Gauge className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <span>
          {isFa
            ? 'سرعت دانلود مستقیماً به سرعت اینترنت و کیفیت فیلترشکن (VPN) شما بستگی دارد. فایل‌های داخل صف به‌نوبت (یکی پس از اتمام دیگری) دانلود می‌شوند. برای جلوگیری از کند شدن یا توقف دانلود توسط سیستم‌عامل گوشی، لطفاً تا پایان دانلود از برنامه خارج نشوید.'
            : isAr
            ? 'تعتمد سرعة التحميل على سرعة الإنترنت وجودة الـ VPN لديك. يتم تحميل الملفات في قائمة الانتظار بالتسلسل. يرجى البقاء داخل التطبيق حتى انتهاء التحميل.'
            : 'Download speed depends directly on your internet speed and VPN quality. Queued files download sequentially one after another. Keep the app open during downloads.'}
        </span>
      </div>

      {/* Batch Queue Multi-Link Drawer */}
      {isBatchModalOpen && onStartBatchDownload && (
        <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-indigo-500/40 card-3d space-y-3 animate-fade-in">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-500">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                  {isFa
                    ? 'افزودن دسته‌جمعی لینک‌ها برای دانلود همزمان'
                    : isAr
                    ? 'إضافة روابط متعددة للتحميل المتزامن'
                    : 'Add Multiple Links for Parallel Download'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isFa
                    ? 'لینک‌ها را در خطوط جداگانه وارد کنید تا همزمان و مستقل از هم دانلود شوند'
                    : isAr
                    ? 'أدخل كل رابط في سطر منفصل ليتم تحميلها بالتوازي في نفس الوقت'
                    : 'Enter one URL per line for simultaneous parallel downloading'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                setBatchText(
                  SAMPLE_URLS.slice(0, 3)
                    .map((s) => s.url)
                    .join('\n')
                )
              }
              className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-300"
            >
              {isFa
                ? '+ درج ۳ لینک نمونه'
                : isAr
                ? '+ إدراج ٣ روابط تجريبية'
                : '+ Load 3 Samples'}
            </button>
          </div>

          <textarea
            rows={3}
            dir="ltr"
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=...\nhttps://www.tiktok.com/@user/video/..."
            className="w-full p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 input-3d"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
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
              disabled={!batchText.trim()}
              className="px-4 py-2 rounded-xl text-xs font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 btn-3d-primary disabled:opacity-50"
            >
              {isFa
                ? 'شروع دانلود همزمان لینک‌ها'
                : isAr
                ? 'بدء التحميل المتزامن'
                : 'Start Parallel Downloads'}
            </button>
          </div>
        </div>
      )}

      {/* Batch Queue Live Summary Dashboard (Overall %, Speed & Total Volume) */}
      {tasks.length > 0 && (
        <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 card-3d space-y-3">
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/70 dark:border-slate-800">
              <span className="block text-[10px] font-bold text-slate-400">
                {isFa ? 'پیشرفت کل' : isAr ? 'التقدم الإجمالي' : 'Total Progress'}
              </span>
              <span className="text-sm sm:text-base font-black text-indigo-600 dark:text-indigo-400 font-mono">
                {overallQueuePercent}%
              </span>
            </div>

            <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/70 dark:border-slate-800">
              <span className="block text-[10px] font-bold text-slate-400">
                {isFa ? 'مجموع سرعت همزمان' : isAr ? 'سرعة التحميل المتزامن' : 'Combined Speed'}
              </span>
              <span className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                {combinedSpeedFormatted}
              </span>
            </div>

            <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/70 dark:border-slate-800">
              <span className="block text-[10px] font-bold text-slate-400">
                {isFa ? 'حجم کل دانلودها' : isAr ? 'الحجم الإجمالي' : 'Total Volume'}
              </span>
              <span className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200 font-mono" dir="ltr">
                {totalVolumeFormatted}
              </span>
            </div>
          </div>

          <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden input-3d">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-violet-500 to-emerald-500 transition-all duration-300"
              style={{ width: `${overallQueuePercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        {[
          { id: 'all', label: t.filterAll, count: tasks.length },
          { id: 'active', label: t.filterActive, count: activeCount },
          { id: 'completed', label: t.filterCompleted, count: completedCount },
          { id: 'paused', label: t.filterPaused, count: pausedCount }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id as typeof filter)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              filter === tab.id
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                filter === tab.id
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              {isRtl ? toFaDigits(tab.count) : tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Empty State */}
      {filteredTasks.length === 0 && (
        <div className="p-12 text-center rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 card-3d">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
            <Clock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            {t.queueEmpty}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            {t.startNewPrompt}
          </p>
        </div>
      )}

      {/* Task Cards List (Numbered ۱، ۲، ۳...) */}
      <div className="space-y-3">
        {filteredTasks.map((task, idx) => (
          <TaskCard
            key={task.id}
            index={idx + 1}
            task={task}
            language={language}
            onPause={onPauseTask}
            onResume={onResumeTask}
            onCancel={onCancelTask}
            onRetry={onRetryTask}
            onDelete={onDeleteTask}
            onPlay={onPlayMedia}
            onSave={onSaveToDisk}
          />
        ))}
      </div>
    </section>
  );
};

interface TaskCardProps {
  index: number;
  task: DownloadTask;
  language: Language;
  onPause: (task: DownloadTask) => void;
  onResume: (task: DownloadTask) => void;
  onCancel: (task: DownloadTask) => void;
  onRetry: (task: DownloadTask) => void;
  onDelete: (taskId: string) => void;
  onPlay: (task: DownloadTask) => void;
  onSave: (task: DownloadTask) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({
  index,
  task,
  language,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onDelete,
  onPlay,
  onSave
}) => {
  const t = getTranslation(language);
  const isFa = language === 'fa';
  const isAr = language === 'ar';
  const isRtl = isFa || isAr;

  const renderStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'downloading':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
            <span>{t.statusDownloading}</span>
          </span>
        );
      case 'queued':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {task.scheduledTime
                ? isFa
                  ? `⏰ زمان‌بندی: ${task.scheduledTime}`
                  : isAr
                  ? `⏰ مجدول: ${task.scheduledTime}`
                  : `⏰ Scheduled: ${task.scheduledTime}`
                : isFa
                ? 'در صف دانلود (نوبت بعدی)'
                : isAr
                ? 'في قائمة الانتظار'
                : 'In Queue (Next)'}
            </span>
          </span>
        );
      case 'completed':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{isFa ? 'پایان یافت' : t.statusCompleted}</span>
          </span>
        );
      case 'paused':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-500">
            <Pause className="w-3.5 h-3.5" />
            <span>{t.statusPaused}</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
            <XCircle className="w-3.5 h-3.5" />
            <span>{t.statusCancelled}</span>
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-rose-500">
            <XCircle className="w-3.5 h-3.5" />
            <span>
              {task.speedFormatted ||
                (isFa
                  ? 'خطا در دریافت — تلاش مجدد کنید'
                  : isAr
                  ? 'خطأ في التحميل — أعد المحاولة'
                  : 'Download interrupted — Tap Retry')}
            </span>
          </span>
        );
      default:
        return (
          <span className="text-[11px] font-medium text-slate-500">
            {task.status}
          </span>
        );
    }
  };

  const sizeInfoLabel =
    task.status === 'completed' || task.downloadedSizeFormatted === task.totalSizeFormatted
      ? task.totalSizeFormatted
      : `${task.downloadedSizeFormatted} / ${task.totalSizeFormatted}`;

  return (
    <div className="relative p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 card-3d overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Thumbnail with overlay icon */}
        <div className="relative w-full sm:w-28 aspect-video rounded-2xl overflow-hidden bg-slate-900 shrink-0 shadow-inner flex items-center justify-center">
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 bg-slate-800">
            <PlatformIcon platform={task.platform} size={20} />
          </div>
          {(task.thumbnail || task.videoId) && (
            <img
              src={getSafeThumbnail(task.thumbnail, task.videoId)}
              alt={task.title}
              className="absolute inset-0 w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                const imgEl = e.currentTarget;
                if (
                  task.thumbnail &&
                  task.thumbnail.startsWith('http') &&
                  !imgEl.dataset.retriedRaw &&
                  imgEl.src !== task.thumbnail
                ) {
                  imgEl.dataset.retriedRaw = '1';
                  imgEl.src = task.thumbnail;
                  return;
                }
                imgEl.style.display = 'none';
              }}
            />
          )}
          <div className="absolute top-1.5 left-1.5 p-1 rounded-md bg-black/60 backdrop-blur-xs">
            <PlatformIcon platform={task.platform} size={14} />
          </div>
          <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.2 rounded bg-black/80 text-[10px] font-mono font-bold text-white uppercase">
            {task.format.format}
          </div>
        </div>

        {/* Task Details & Metrics */}
        <div className="flex-1 min-w-0 w-full">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-6 h-6 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                {isRtl ? toFaDigits(index) : index}
              </span>
              <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                {task.title}
              </h4>
            </div>
            {renderStatusBadge(task.status)}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400 mb-2 font-mono">
            <span className="font-bold text-indigo-600 dark:text-indigo-400">
              {task.format.qualityLabel}
            </span>
            <span>•</span>
            <span dir="ltr">{sizeInfoLabel}</span>
            {task.status === 'completed' && (
              <>
                <span>•</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400" dir="ltr">
                  <Clock className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span>{formatDownloadTimestamp(task.completedAt || task.createdAt, language)}</span>
                </span>
              </>
            )}
            {task.status === 'downloading' && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1 text-slate-700 dark:text-slate-200 font-bold">
                  <Gauge className="w-3 h-3 text-emerald-500" />
                  <span>{task.speedFormatted}</span>
                </span>
                <span>•</span>
                <span>
                  {t.eta}: {task.etaSeconds}s
                </span>
              </>
            )}
          </div>

          {/* TubeMate Single Direct Stream Progress Bar */}
          <div className="relative w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mb-1.5 input-3d">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                task.status === 'completed'
                  ? 'bg-emerald-500'
                  : task.status === 'paused'
                  ? 'bg-amber-500'
                  : task.status === 'error'
                  ? 'bg-rose-500'
                  : 'bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400'
              }`}
              style={{ width: `${task.status === 'error' ? 100 : task.progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span className="truncate max-w-[220px] sm:max-w-md">{task.fileName}</span>
            <span
              className={`font-bold ${
                task.status === 'error'
                  ? 'text-rose-500'
                  : task.status === 'completed'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {task.status === 'error'
                ? task.speedFormatted ||
                  (isFa
                    ? 'خطا در دریافت — تلاش مجدد'
                    : isAr
                    ? 'خطأ في التحميل — أعد المحاولة'
                    : 'Download failed — Retry')
                : task.status === 'completed'
                ? isFa
                  ? 'پایان یافت • 100%'
                  : isAr
                  ? 'مكتمل • 100%'
                  : 'Completed • 100%'
                : `${task.progressPercent}%`}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
          {(task.status === 'downloading' || task.status === 'queued') && (
            <button
              type="button"
              onClick={() => onPause(task)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-black text-amber-700 dark:text-amber-300 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 border border-amber-500/30 btn-3d-secondary transition-colors cursor-pointer"
              title={
                task.status === 'queued'
                  ? isFa
                    ? 'نگه داشتن در صف'
                    : isAr
                    ? 'إيقاف مؤقت في الانتظار'
                    : 'Hold / Pause in Queue'
                  : t.pause
              }
            >
              <Pause className="w-4 h-4 shrink-0" />
              <span>
                {task.status === 'queued'
                  ? isFa
                    ? 'نگه داشتن'
                    : isAr
                    ? 'إيقاف مؤقت'
                    : 'Hold'
                  : isFa
                  ? 'توقف موقت'
                  : isAr
                  ? 'إيقاف'
                  : 'Pause'}
              </span>
            </button>
          )}

          {task.status === 'paused' && (
            <button
              type="button"
              onClick={() => onResume(task)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-black text-indigo-600 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-indigo-500/30 btn-3d-secondary transition-colors cursor-pointer"
              title={t.resume}
            >
              <Play className="w-4 h-4 shrink-0" />
              <span>
                {isFa ? 'ادامه دانلود' : isAr ? 'استئناف التحميل' : 'Resume'}
              </span>
            </button>
          )}

          {(task.status === 'downloading' || task.status === 'queued') && (
            <button
              onClick={() => onCancel(task)}
              className="p-2.5 rounded-2xl text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 btn-3d-secondary transition-colors"
              title={t.cancel}
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}

          {task.status === 'completed' && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onPlay(task)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 btn-3d-primary active:scale-95 cursor-pointer"
                title={isFa ? 'پخش آفلاین' : isAr ? 'تشغيل بدون نت' : 'Play Offline'}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isFa ? 'پخش' : isAr ? 'تشغيل' : 'Play'}</span>
              </button>

              <button
                type="button"
                onClick={() => onSave(task)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 btn-3d-amber active:scale-95 cursor-pointer"
                title={isFa ? 'ذخیره در دستگاه' : isAr ? 'حفظ في الجهاز' : 'Save to Device'}
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>
                  {isFa ? 'ذخیره در دستگاه' : isAr ? 'حفظ في الجهاز' : 'Save to Device'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => shareDownloadedMediaFile(task)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 btn-3d-emerald active:scale-95 cursor-pointer"
                title={isFa ? 'اشتراک‌گذاری' : isAr ? 'مشاركة' : 'Share'}
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{isFa ? 'اشتراک‌گذاری' : isAr ? 'مشاركة' : 'Share'}</span>
              </button>
            </div>
          )}

          {(task.status === 'cancelled' || task.status === 'error') && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onRetry(task)}
                className="flex items-center gap-1 px-3 py-2 rounded-2xl text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 btn-3d-secondary transition-colors"
                title={t.retry}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isFa ? 'تلاش مجدد' : isAr ? 'إعادة المحاولة' : t.retry}</span>
              </button>
            </div>
          )}

          <button
            onClick={() => onDelete(task.id)}
            className="p-2.5 rounded-2xl text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 btn-3d-secondary transition-colors"
            title={t.deleteTask}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
