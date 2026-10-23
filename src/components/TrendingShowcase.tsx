import React, { useState, useEffect } from 'react';
import {
  Coins,
  Crown,
  Clock,
  Gift,
  User,
  Sparkles,
  Play,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { DownloadTask, Language } from '../types';
import {
  claimRewardAction,
  getCoinsBalance,
  getDailyQuota,
  getRewardStatus,
  subscribeQuotaAndCoins
} from '../services/quotaService';
import { getSafeThumbnail } from '../services/platformDetector';
import { PlatformIcon } from './PlatformIcon';

interface TrendingShowcaseProps {
  language: Language;
  recentTasks: DownloadTask[];
  onPlayItem: (task: DownloadTask) => void;
  onOpenViewAllDownloads?: () => void;
  onOpenShare?: () => void;
  onOpenUpgrade: () => void;
  onOpenAuth: () => void;
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

export const TrendingShowcase: React.FC<TrendingShowcaseProps> = ({
  language,
  recentTasks,
  onPlayItem,
  onOpenViewAllDownloads,
  onOpenUpgrade,
  onOpenAuth
}) => {
  const isFa = language === 'fa';
  const isAr = language === 'ar';

  const [rewardStatus, setRewardStatus] = useState(() => getRewardStatus());
  const [coinsBalance, setCoinsBalance] = useState(() => getCoinsBalance());
  const [quota, setQuota] = useState(() => getDailyQuota());
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeQuotaAndCoins(() => {
      setRewardStatus(getRewardStatus());
      setCoinsBalance(getCoinsBalance());
      setQuota(getDailyQuota());
    });
    return () => unsub();
  }, []);

  const handleWatchAd = () => {
    setFeedbackMessage(
      isFa
        ? 'در حال به‌روزرسانی — بخش تماشای تبلیغ (+۵ سکه) در حال به‌روزرسانی است.'
        : isAr
        ? 'قيد التحديث — ميزة مشاهدة الإعلان (+٥ عملات) قيد التحديث حالياً.'
        : 'Updating — Watch Ad (+5 Coins) is currently being updated.'
    );
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  const handleDailyCheckin = () => {
    const res = claimRewardAction('daily_checkin');
    setRewardStatus(getRewardStatus());
    setCoinsBalance(getCoinsBalance());
    if (isFa) {
      setFeedbackMessage(res.messageFa);
    } else if (isAr) {
      setFeedbackMessage(
        res.success
          ? '+٢ عملة تمت إضافتها إلى محفظتك كهدية الدخول اليومي!'
          : 'تم استلام هدية الدخول اليومي لهذا اليوم مسبقاً'
      );
    } else {
      setFeedbackMessage(res.messageEn);
    }
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  const latestTwo = recentTasks.slice(0, 2);

  return (
    <section className="w-full max-w-4xl mx-auto px-3 sm:px-4 mt-4 space-y-5">
      {/* Gamified Coin Wallet & Daily Quota Card */}
      <div className="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white border border-indigo-500/30 card-3d space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-amber-400 text-slate-950 shadow-md shrink-0">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-xs sm:text-sm text-white flex flex-wrap items-center gap-2">
                <span>
                  {isFa
                    ? 'کیف پول سکه و سهمیه روزانه'
                    : isAr
                    ? 'محفظة العملات والحصة اليومية'
                    : 'Coin Wallet & Daily Quota'}
                </span>
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-400 text-slate-950">
                  {isFa
                    ? `${toLocalDigits(coinsBalance, 'fa')} سکه`
                    : isAr
                    ? `${toLocalDigits(coinsBalance, 'ar')} عملة`
                    : `${coinsBalance} Coins`}
                </span>
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-indigo-500/30 border border-indigo-400/40 text-indigo-100">
                  {quota.isPro
                    ? isFa
                      ? 'اشتراک VIP فعال (دانلود نامحدود)'
                      : isAr
                      ? 'اشتراك VIP نشط (تحميل غير محدود)'
                      : 'VIP Active (Unlimited)'
                    : isFa
                    ? `سهمیه رایگان امروز: ${toLocalDigits(quota.remainingToday, 'fa')} از ${toLocalDigits(quota.maxDaily, 'fa')} دانلود`
                    : isAr
                    ? `المجاني اليوم: ${toLocalDigits(quota.remainingToday, 'ar')} من ${toLocalDigits(quota.maxDaily, 'ar')} تحميلات`
                    : `Free Today: ${quota.remainingToday}/${quota.maxDaily} downloads`}
                </span>
              </h3>
              <p className="text-[11px] text-indigo-200/85 mt-0.5">
                {isFa
                  ? '۳ دانلود رایگان در روز • دانلود اضافه = ۵ سکه • ۱۰۰ سکه = اشتراک VIP'
                  : isAr
                  ? '٣ تحميلات مجانية يومياً • تحميل إضافي = ٥ عملات • ١٠٠ عملة = اشتراك VIP'
                  : '3 Free Downloads/Day • Extra Download = 5 Coins • 100 Coins = 1-Month VIP'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenUpgrade}
            className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs btn-3d-amber flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Crown className="w-3.5 h-3.5 fill-slate-950" />
            <span>
              {isFa
                ? 'فعال‌سازی VIP'
                : isAr
                ? 'تفعيل VIP'
                : 'Activate VIP'}
            </span>
          </button>
        </div>

        {feedbackMessage && (
          <div className="p-2.5 rounded-xl bg-indigo-500/25 border border-indigo-400/40 text-indigo-100 text-xs font-extrabold flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{feedbackMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleWatchAd}
            className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700 text-slate-400 font-black text-xs flex items-center justify-center gap-2 opacity-85 cursor-pointer"
          >
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {isFa
                ? 'تماشای تبلیغ (+۵ سکه • در حال به‌روزرسانی)'
                : isAr
                ? 'مشاهدة إعلان (+٥ عملات • قيد التحديث)'
                : 'Watch Ad (+5 Coins • Updating)'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleDailyCheckin}
            disabled={rewardStatus.checkedInToday}
            className={`p-3 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
              rewardStatus.checkedInToday
                ? 'bg-slate-800/80 text-slate-400 border border-slate-700'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white btn-3d-primary'
            }`}
          >
            <Gift className="w-4 h-4 shrink-0" />
            <span>
              {rewardStatus.checkedInToday
                ? isFa
                  ? 'هدیه امروز دریافت شد ✓'
                  : isAr
                  ? 'تم استلام هدية اليوم ✓'
                  : 'Daily Bonus Claimed ✓'
                : isFa
                ? 'هدیه ورود روزانه (+۲ سکه)'
                : isAr
                ? 'هدية الدخول اليومي (+٢ عملة)'
                : 'Daily Check-in (+2 Coins)'}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenAuth}
            className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-black text-xs border border-slate-700 btn-3d-secondary flex items-center justify-center gap-2 cursor-pointer"
          >
            <User className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>
              {isFa
                ? 'پروفایل شخصی'
                : isAr
                ? 'الملف الشخصي'
                : 'Personal Profile'}
            </span>
          </button>
        </div>
      </div>

      {/* Latest 2 Downloaded Files Card */}
      <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 card-3d space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white text-3d">
                {isFa
                  ? 'آخرین فایل‌های شما (۲ مورد اخیر)'
                  : isAr
                  ? 'أحدث ملفاتك (آخر ملفين)'
                  : 'Your Latest Files (2 Most Recent)'}
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {isFa
                  ? 'جدیدترین فایل‌های رسانه دانلود شده توسط شما'
                  : isAr
                  ? 'أحدث ملفات الوسائط التي قمت بتحميلها'
                  : 'Most recent media files downloaded by you'}
              </p>
            </div>
          </div>

          {recentTasks.length > 2 && onOpenViewAllDownloads && (
            <button
              type="button"
              onClick={onOpenViewAllDownloads}
              className="text-xs font-black text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 cursor-pointer"
            >
              {isFa
                ? `مشاهده همه (${toLocalDigits(recentTasks.length, 'fa')}) ←`
                : isAr
                ? `عرض الكل (${toLocalDigits(recentTasks.length, 'ar')}) ←`
                : `View All (${recentTasks.length}) →`}
            </button>
          )}
        </div>

        {latestTwo.length === 0 ? (
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-dashed border-slate-200 dark:border-slate-800 text-center">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {isFa
                ? 'هنوز فایلی دانلود نشده است. لینک ویدیو یا موزیک خود را در کادر بالا قرار دهید.'
                : isAr
                ? 'لم يتم تحميل أي ملفات بعد. الصق رابط الفيديو أو الموسيقى في الأعلى للبدء.'
                : 'No files downloaded yet. Paste a media link above to begin.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {latestTwo.map((task, idx) => {
              const badgeNum = toLocalDigits(idx + 1, language);
              return (
                <div
                  key={task.id}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 card-3d"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                      {badgeNum}
                    </span>
                    <div className="relative w-14 h-10 rounded-xl bg-slate-800 overflow-hidden shrink-0">
                      {task.thumbnail && (
                        <img
                          src={getSafeThumbnail(task.thumbnail, task.videoId)}
                          alt={task.title}
                          className="w-full h-full object-cover"
                        />
                      )}
                      <div className="absolute bottom-0.5 right-0.5 p-0.5 rounded bg-black/70">
                        <PlatformIcon platform={task.platform} size={10} />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-black text-xs text-slate-900 dark:text-white truncate">
                        {task.title}
                      </h4>
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate" dir="ltr">
                        {task.format.qualityLabel} •{' '}
                        {task.status === 'completed'
                          ? task.totalSizeFormatted
                          : `${task.progressPercent}%`}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {task.status === 'completed' ? (
                      <button
                        type="button"
                        onClick={() => onPlayItem(task)}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs btn-3d-primary flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>{isFa ? 'پخش' : isAr ? 'تشغيل' : 'Play'}</span>
                      </button>
                    ) : task.status === 'downloading' ? (
                      <span className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>
                          {isFa
                            ? 'در حال دانلود'
                            : isAr
                            ? 'جاري التحميل'
                            : 'Downloading'}
                        </span>
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-xl text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {isFa ? 'در صف' : isAr ? 'في الانتظار' : 'Queued'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
