/**
 * Download Quota & VIP Pro Subscription Service
 * Limits free users to 3 video/audio downloads per calendar day.
 */

export interface QuotaInfo {
  usedToday: number;
  maxDaily: number;
  remainingToday: number;
  isPro: boolean;
  proPlanName?: string;
  proExpiryDate?: number;
  dateKey: string;
}

const QUOTA_STORAGE_KEY = 'appone_daily_quota_data';
const PRO_STORAGE_KEY = 'appone_vip_pro_subscription';

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getDailyQuota(): QuotaInfo {
  const todayKey = getTodayKey();
  const maxDaily = 3;

  // VIP Pro enabled by default without requiring login
  let isPro = true;
  let proPlanName: string | undefined = 'VIP Pro';
  let proExpiryDate: number | undefined;

  try {
    const proRaw = localStorage.getItem(PRO_STORAGE_KEY);
    if (proRaw) {
      const proData = JSON.parse(proRaw);
      if (proData && (!proData.expiry || proData.expiry > Date.now())) {
        isPro = true;
        proPlanName = proData.planName || 'VIP Pro';
        proExpiryDate = proData.expiry;
      }
    }
  } catch {
    // Ignore
  }

  // Check daily count
  let usedToday = 0;
  try {
    const raw = localStorage.getItem(QUOTA_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.dateKey === todayKey) {
        usedToday = Number(data.usedCount) || 0;
      }
    }
  } catch {
    // Ignore
  }

  const remainingToday = isPro ? 9999 : Math.max(0, maxDaily - usedToday);

  return {
    usedToday,
    maxDaily,
    remainingToday,
    isPro,
    proPlanName,
    proExpiryDate,
    dateKey: todayKey
  };
}

export function canDownload(): boolean {
  const quota = getDailyQuota();
  return quota.isPro || quota.remainingToday > 0;
}

export function consumeDownloadQuota(): QuotaInfo {
  const quota = getDailyQuota();
  if (quota.isPro) return quota;

  const todayKey = getTodayKey();
  const newUsed = quota.usedToday + 1;

  localStorage.setItem(
    QUOTA_STORAGE_KEY,
    JSON.stringify({
      dateKey: todayKey,
      usedCount: newUsed,
      updatedAt: Date.now()
    })
  );

  return getDailyQuota();
}

export function activateProPlan(planId: 'monthly' | 'quarterly' | 'lifetime'): QuotaInfo {
  let days = 30;
  let planName = 'طرح ۱ ماهه VIP Pro';
  if (planId === 'quarterly') {
    days = 90;
    planName = 'طرح ۳ ماهه ویژه VIP Pro';
  } else if (planId === 'lifetime') {
    days = 36500; // 100 years
    planName = 'اشتراک مادام‌العمر VIP Pro Lifetime';
  }

  const expiry = Date.now() + days * 24 * 60 * 60 * 1000;
  localStorage.setItem(
    PRO_STORAGE_KEY,
    JSON.stringify({
      planId,
      planName,
      expiry,
      activatedAt: Date.now()
    })
  );

  return getDailyQuota();
}
