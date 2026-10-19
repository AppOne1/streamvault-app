import React, { useState } from 'react';
import { DownloadTask, Language, TaskStatus } from '../types';
import { PlatformIcon } from './PlatformIcon';
import { getTranslation } from '../i18n/translations';
import { getSafeThumbnail } from '../services/platformDetector';
import {
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Save,
  CheckCircle2,
  Clock,
  Gauge,
  XCircle,
  PauseCircle,
  PlayCircle,
  Download
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
}

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
  onClearCompleted
}) => {
  const t = getTranslation(language);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'paused'>('all');

  const filteredTasks = tasks.filter((task) => {
    if (filter === 'active') return task.status === 'downloading' || task.status === 'queued';
    if (filter === 'completed') return task.status === 'completed';
    if (filter === 'paused') return task.status === 'paused';
    return true;
  });

  const activeCount = tasks.filter(t => t.status === 'downloading' || t.status === 'queued').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const pausedCount = tasks.filter(t => t.status === 'paused').length;

  return (
    <section className="w-full max-w-5xl mx-auto px-4 py-6">
      {/* Header & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
            {t.downloadsHeader}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {tasks.length} total tasks • {activeCount} active
          </p>
        </div>

        {/* Global Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {activeCount > 0 && (
            <button
              onClick={onPauseAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
            >
              <PauseCircle className="w-3.5 h-3.5 text-amber-500" />
              <span>{t.pauseAll}</span>
            </button>
          )}

          {pausedCount > 0 && (
            <button
              onClick={onResumeAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
            >
              <PlayCircle className="w-3.5 h-3.5 text-indigo-500" />
              <span>{t.resumeAll}</span>
            </button>
          )}

          {completedCount > 0 && (
            <button
              onClick={onClearCompleted}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>{t.clearCompleted}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
        {[
          { id: 'all', label: t.filterAll, count: tasks.length },
          { id: 'active', label: t.filterActive, count: activeCount },
          { id: 'completed', label: t.filterCompleted, count: completedCount },
          { id: 'paused', label: t.filterPaused, count: pausedCount },
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
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Empty State */}
      {filteredTasks.length === 0 && (
        <div className="p-12 text-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
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

      {/* Task Cards List */}
      <div className="space-y-3">
        {filteredTasks.map((task) => (
          <TaskCard
            key={task.id}
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

  // Status badge styling
  const renderStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'downloading':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
            <span>{t.statusDownloading}</span>
          </span>
        );
      case 'completed':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{t.statusCompleted}</span>
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
      default:
        return (
          <span className="text-[11px] font-medium text-slate-500">
            {task.status}
          </span>
        );
    }
  };

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
              onError={(e) => {
                e.currentTarget.style.display = 'none';
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
            <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate">
              {task.title}
            </h4>
            {renderStatusBadge(task.status)}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mb-2 font-mono">
            <span className="font-bold text-indigo-600 dark:text-indigo-400">
              {task.format.qualityLabel}
            </span>
            <span>•</span>
            <span>
              {task.downloadedSizeFormatted} / {task.totalSizeFormatted}
            </span>
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

          {/* Linear Progress Bar */}
          <div className="relative w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mb-1 input-3d">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                task.status === 'completed'
                  ? 'bg-emerald-500'
                  : task.status === 'paused'
                  ? 'bg-amber-500'
                  : task.status === 'error'
                  ? 'bg-rose-500'
                  : 'bg-gradient-to-r from-indigo-500 to-violet-500'
              }`}
              style={{ width: `${task.status === 'error' ? 100 : task.progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>{task.fileName}</span>
            <span className={`font-bold ${task.status === 'error' ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'}`}>
              {task.status === 'error' ? (language === 'fa' ? 'خطا در دریافت' : 'Error') : `${task.progressPercent}%`}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
          {task.status === 'downloading' && task.directUrl && (
            <button
              onClick={() => onSave(task)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 btn-3d-secondary transition-all"
              title={language === 'fa' ? 'خروجی مستقیم به حافظه دستگاه' : 'Save directly to device'}
            >
              <Download className="w-3.5 h-3.5 text-indigo-500" />
              <span className="hidden sm:inline">{language === 'fa' ? 'ذخیره در گوشی' : 'Save'}</span>
            </button>
          )}

          {task.status === 'downloading' && (
            <button
              onClick={() => onPause(task)}
              className="p-2.5 rounded-2xl text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 btn-3d-secondary transition-colors"
              title={t.pause}
            >
              <Pause className="w-4 h-4" />
            </button>
          )}

          {task.status === 'paused' && (
            <button
              onClick={() => onResume(task)}
              className="p-2.5 rounded-2xl text-indigo-600 dark:text-indigo-400 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 btn-3d-secondary transition-colors"
              title={t.resume}
            >
              <Play className="w-4 h-4" />
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => onPlay(task)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 btn-3d-primary active:scale-95"
                title={language === 'fa' ? 'پخش آفلاین بدون فیلترشکن' : 'Play Offline'}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{language === 'fa' ? 'پخش آفلاین' : t.openFile}</span>
              </button>

              <button
                onClick={() => onSave(task)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 btn-3d-secondary active:scale-95"
                title={language === 'fa' ? 'خروجی فایل به پوشه Downloads گوشی' : t.saveToDisk}
              >
                <Download className="w-3.5 h-3.5 text-indigo-500" />
                <span className="hidden xs:inline">{language === 'fa' ? 'خروجی فایل' : 'Export File'}</span>
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
                <span>{language === 'fa' ? 'تلاش مجدد' : t.retry}</span>
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
