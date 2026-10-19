/**
 * Commercial Download Quota, VIP Pro Subscription & Jet Coins Reward Service
 * - Default mode: Guest / Free Tier (کاربر مهمان / عادی) with 1 free download per calendar day.
 * - Users can upgrade to VIP Pro via In-App Purchase OR by spending collected Jet Coins
 *   (including +3 Extra Downloads, 24h Pass, 7-Day Pass, and 1-Month Full VIP Plan with Coins).
 * - Standardized 3 Rewarded Actions:
 *   1. Watch Sponsored/Promotional Video (+20 Coins)
 *   2. Share & Invite Friends (+50 Coins)
 *   3. Daily Check-in (+10 Coins)
 */

export interface QuotaInfo {
  usedToday: number;
  maxDaily: number;
  bonusDownloadsToday: number;
  remainingToday: number;
  isPro: boolean;
  proPlanName?: string;
  proExpiryDate?: number;
  dateKey: string;
}

export interface RewardStatus {
  coins: number;
  checkedInToday: boolean;
  watchedAdsToday: number;
  maxAdsPerDay: number;
  sharedToday: boolean;
}

const QUOTA_STORAGE_KEY = 'onedownload_daily_quota_v2';
const PRO_STORAGE_KEY = 'onedownload_vip_pro_sub_v2';
const COINS_STORAGE_KEY = 'onedownload_jet_coins_v2';
const REWARD_LOG_STORAGE_KEY = 'onedownload_reward_log_v2';

type QuotaSubscriber = () => void;
const subscribers: Set<QuotaSubscriber> = new Set();

export function subscribeQuotaAndCoins(cb: QuotaSubscriber): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function notifySubscribers() {
  subscribers.forEach((cb) => cb());
}

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getCoinsBalance(): number {
  try {
    const raw = localStorage.getItem(COINS_STORAGE_KEY);
    if (raw === null) {
      localStorage.setItem(COINS_STORAGE_KEY, '20');
      return 20;
    }
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  } catch {
    return 20;
  }
}

export function setCoinsBalance(newAmount: number): number {
  const safe = Math.max(0, Math.floor(newAmount));
  try {
    localStorage.setItem(COINS_STORAGE_KEY, String(safe));
  } catch {
    // ignore
  }
  notifySubscribers();
  return safe;
}

export function getRewardStatus(): RewardStatus {
  const todayKey = getTodayKey();
  const coins = getCoinsBalance();
  let checkedInToday = false;
  let watchedAdsToday = 0;
  let sharedToday = false;

  try {
    const raw = localStorage.getItem(REWARD_LOG_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.dateKey === todayKey) {
        checkedInToday = Boolean(data.checkedInToday);
        watchedAdsToday = Number(data.watchedAdsToday) || 0;
        sharedToday = Boolean(data.sharedToday);
      }
    }
  } catch {
    // ignore
  }

  return {
    coins,
    checkedInToday,
    watchedAdsToday,
    maxAdsPerDay: 5,
    sharedToday
  };
}

export function claimRewardAction(action: 'daily_checkin' | 'watch_ad' | 'share_app'): {
  success: boolean;
  coinsAdded: number;
  newBalance: number;
  messageFa: string;
  messageEn: string;
} {
  const todayKey = getTodayKey();
  const status = getRewardStatus();
  let checkedInToday = status.checkedInToday;
  let watchedAdsToday = status.watchedAdsToday;
  let sharedToday = status.sharedToday;
  let coinsAdded = 0;
  let messageFa = '';
  let messageEn = '';

  if (action === 'daily_checkin') {
    if (checkedInToday) {
      return {
        success: false,
        coinsAdded: 0,
        newBalance: status.coins,
        messageFa: 'هدیه ورود روزانه امروز قبلاً دریافت شده است (فردا مجدد سر بزنید)',
        messageEn: 'Daily check-in reward already claimed today'
      };
    }
    checkedInToday = true;
    coinsAdded = 10;
    messageFa = '+۱۰ سکه بابت ورود روزانه به حساب شما اضافه شد!';
    messageEn = '+10 Coins added for Daily Check-in!';
  } else if (action === 'watch_ad') {
    if (watchedAdsToday >= status.maxAdsPerDay) {
      return {
        success: false,
        coinsAdded: 0,
        newBalance: status.coins,
        messageFa: 'سقف تماشای ویدیوی پیشنهادی امروز تکمیل شده است',
        messageEn: 'Daily promotional video limit reached'
      };
    }
    watchedAdsToday += 1;
    coinsAdded = 20;
    messageFa = '+۲۰ سکه بابت تماشای کامل ویدیوی پیشنهادی دریافت شد!';
    messageEn = '+20 Coins earned from watching promotional video!';
  } else if (action === 'share_app') {
    if (sharedToday) {
      return {
        success: false,
        coinsAdded: 0,
        newBalance: status.coins,
        messageFa: 'پاداش اشتراک‌گذاری امروز قبلاً دریافت شده است',
        messageEn: 'Share reward already claimed today'
      };
    }
    sharedToday = true;
    coinsAdded = 50;
    messageFa = '+۵۰ سکه بابت دعوت از دوستان و اشتراک‌گذاری برنامه دریافت شد!';
    messageEn = '+50 Coins earned for sharing OneDownload with friends!';
  }

  try {
    localStorage.setItem(
      REWARD_LOG_STORAGE_KEY,
      JSON.stringify({
        dateKey: todayKey,
        checkedInToday,
        watchedAdsToday,
        sharedToday
      })
    );
  } catch {
    // ignore
  }

  const newBalance = setCoinsBalance(status.coins + coinsAdded);
  return {
    success: true,
    coinsAdded,
    newBalance,
    messageFa,
    messageEn
  };
}

export function getDailyQuota(): QuotaInfo {
  const todayKey = getTodayKey();
  // Guest / Free Tier default: 1 free download per day
  const baseMaxDaily = 1;

  let isPro = false;
  let proPlanName: string | undefined;
  let proExpiryDate: number | undefined;

  try {
    const proRaw = localStorage.getItem(PRO_STORAGE_KEY);
    if (proRaw) {
      const proData = JSON.parse(proRaw);
      if (proData && proData.isActive === true && (!proData.expiry || proData.expiry > Date.now())) {
        isPro = true;
        proPlanName = proData.planName || 'VIP Pro';
        proExpiryDate = proData.expiry;
      }
    }
  } catch {
    // Ignore
  }

  let usedToday = 0;
  let bonusDownloadsToday = 0;
  try {
    const raw = localStorage.getItem(QUOTA_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.dateKey === todayKey) {
        usedToday = Number(data.usedCount) || 0;
        bonusDownloadsToday = Number(data.bonusDownloads) || 0;
      }
    }
  } catch {
    // Ignore
  }

  const maxDaily = baseMaxDaily + bonusDownloadsToday;
  const remainingToday = isPro ? 9999 : Math.max(0, maxDaily - usedToday);

  return {
    usedToday,
    maxDaily,
    bonusDownloadsToday,
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

  try {
    localStorage.setItem(
      QUOTA_STORAGE_KEY,
      JSON.stringify({
        dateKey: todayKey,
        usedCount: newUsed,
        bonusDownloads: quota.bonusDownloadsToday,
        updatedAt: Date.now()
      })
    );
  } catch {
    // ignore
  }

  notifySubscribers();
  return getDailyQuota();
}

export function activateProPlan(
  planId: 'monthly' | 'quarterly' | 'lifetime' | 'coin_24h' | 'coin_7d' | 'coin_30d'
): QuotaInfo {
  let days = 30;
  let planName = 'طرح ۱ ماهه VIP Pro';
  if (planId === 'quarterly') {
    days = 90;
    planName = 'طرح ۳ ماهه ویژه VIP Pro';
  } else if (planId === 'lifetime') {
    days = 36500;
    planName = 'اشتراک مادام‌العمر VIP Pro';
  } else if (planId === 'coin_24h') {
    days = 1;
    planName = 'اشتراک ۲۴ ساعته VIP (فعال‌شده با سکه)';
  } else if (planId === 'coin_7d') {
    days = 7;
    planName = 'اشتراک ۷ روزه VIP (فعال‌شده با سکه)';
  } else if (planId === 'coin_30d') {
    days = 30;
    planName = 'طرح ۱ ماهه VIP Pro (فعال‌شده با سکه)';
  }

  const expiry = Date.now() + days * 24 * 60 * 60 * 1000;
  try {
    localStorage.setItem(
      PRO_STORAGE_KEY,
      JSON.stringify({
        isActive: true,
        planId,
        planName,
        expiry,
        activatedAt: Date.now()
      })
    );
  } catch {
    // ignore
  }

  notifySubscribers();
  return getDailyQuota();
}

export function redeemCoinsForQuotaOrPro(
  option: 'extra_3_downloads' | 'pro_24h' | 'pro_7d' | 'pro_30d'
): {
  success: boolean;
  newBalance: number;
  quota: QuotaInfo;
  messageFa: string;
  messageEn: string;
} {
  const currentCoins = getCoinsBalance();
  const todayKey = getTodayKey();
  const quota = getDailyQuota();

  const costs = {
    extra_3_downloads: 30,
    pro_24h: 80,
    pro_7d: 180,
    pro_30d: 350
  };

  const requiredCoins = costs[option];
  if (currentCoins < requiredCoins) {
    return {
      success: false,
      newBalance: currentCoins,
      quota,
      messageFa: `موجودی سکه کافی نیست! به ${requiredCoins} سکه نیاز دارید (موجودی فعلی: ${currentCoins} سکه).`,
      messageEn: `Not enough coins! Need ${requiredCoins} coins (Current: ${currentCoins}).`
    };
  }

  const newBalance = setCoinsBalance(currentCoins - requiredCoins);

  if (option === 'extra_3_downloads') {
    const nextBonus = quota.bonusDownloadsToday + 3;
    try {
      localStorage.setItem(
        QUOTA_STORAGE_KEY,
        JSON.stringify({
          dateKey: todayKey,
          usedCount: quota.usedToday,
          bonusDownloads: nextBonus,
          updatedAt: Date.now()
        })
      );
    } catch {
      // ignore
    }
    notifySubscribers();
    return {
      success: true,
      newBalance,
      quota: getDailyQuota(),
      messageFa: '۳ سهمیه دانلود رایگان جدید به سهمیه امروز شما اضافه شد!',
      messageEn: '+3 Extra downloads added to your daily quota!'
    };
  }

  if (option === 'pro_24h') {
    const updatedQuota = activateProPlan('coin_24h');
    return {
      success: true,
      newBalance,
      quota: updatedQuota,
      messageFa: 'اشتراک ۲۴ ساعته نامحدود VIP Pro با موفقیت فعال شد!',
      messageEn: '24-Hour Unlimited VIP Pro Pass activated!'
    };
  }

  if (option === 'pro_7d') {
    const updatedQuota = activateProPlan('coin_7d');
    return {
      success: true,
      newBalance,
      quota: updatedQuota,
      messageFa: 'اشتراک ۷ روزه نامحدود VIP Pro با موفقیت فعال شد!',
      messageEn: '7-Day Unlimited VIP Pro Pass activated!'
    };
  }

  const updatedQuota = activateProPlan('coin_30d');
  return {
    success: true,
    newBalance,
    quota: updatedQuota,
    messageFa: 'طرح ۱ ماهه کامل نامحدود VIP Pro با سکه فعال شد!',
    messageEn: '1-Month Unlimited VIP Pro Plan activated with coins!'
  };
}
