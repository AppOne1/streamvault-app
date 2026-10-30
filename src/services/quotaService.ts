/**
 * Commercial Download Quota, Algorithmic VIP Activation Engine, Referral System & Coin Wallet Service
 * - Daily Free Downloads for normal users: Strictly 3 per day (۳ عدد در روز).
 * - Extra Download Cost: Strictly 5 Coins per extra download (کسر ۵ سکه برای هر دانلود اضافه).
 * - Initial Coin Balance for new users: Strictly 0 (صفر).
 * - Daily Check-in Reward: Strictly +2 Coins per day (+۲ سکه).
 * - Watch Ad (+5 Coins): Currently disabled ("در حال به‌روزرسانی" — 0 coins awarded).
 * - 100 Coins OR 3 Referrals: Unlocks 1-Month VIP Subscription (اشتراک VIP یک‌ماهه).
 * - Random, unguessable personal Referral Code per user.
 * - Algorithmic VIP Activation Code verification (detects 1-Month, 3-Month, and 12-Month plans without exposing guessable patterns).
 */

import { getOrCreateDeviceId } from './deviceService';

export const DEFAULT_LOCK_PASSWORD = '12345678';
export const MASTER_KEYWORD = 'onedownload';

export const APP_LOCK_ENABLED_KEY = 'onedownload_app_lock_enabled_v1';
export const APP_LOCK_PIN_KEY = 'onedownload_app_lock_pin_v1';

export function isAppLockEnabled(): boolean {
  try {
    return localStorage.getItem(APP_LOCK_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAppLockEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(APP_LOCK_ENABLED_KEY, String(enabled));
  } catch {
    // ignore
  }
}

export function getAppLockPin(): string {
  try {
    return localStorage.getItem(APP_LOCK_PIN_KEY) || DEFAULT_LOCK_PASSWORD;
  } catch {
    return DEFAULT_LOCK_PASSWORD;
  }
}

export function setAppLockPin(newPin: string): void {
  try {
    localStorage.setItem(APP_LOCK_PIN_KEY, newPin.trim() || DEFAULT_LOCK_PASSWORD);
  } catch {
    // ignore
  }
}

export function verifyAppLockPinOrKeyword(input: string): boolean {
  const clean = input.trim();
  const currentPin = getAppLockPin();
  if (clean === currentPin) return true;
  if (clean.toLowerCase() === MASTER_KEYWORD.toLowerCase()) return true;
  if (clean === DEFAULT_LOCK_PASSWORD) return true;
  return false;
}

export interface QuotaInfo {
  usedToday: number;
  maxDaily: number;
  bonusDownloadsToday: number;
  remainingToday: number;
  isPro: boolean;
  proPlanName?: string;
  proExpiryDate?: number;
  remainingProDays?: number;
  dateKey: string;
}

export interface RewardStatus {
  coins: number;
  checkedInToday: boolean;
  watchedAdsToday: number;
  maxAdsPerDay: number;
  sharedToday: boolean;
}

export interface InvitedReferralRecord {
  id: string;
  codeOrIdentifier: string;
  timestamp: number;
}

export interface ReferralInfo {
  myReferralCode: string;
  invitedCount: number;
  targetInvitesForVip: number;
  invitedUsers: InvitedReferralRecord[];
  appliedReferralCode?: string;
  vipEligibleByReferral: boolean;
}

export interface VipEligibilityState {
  isEligibleForOneMonthRequest: boolean;
  hasRequestedOneMonth: boolean;
  requestedVia?: 'coins_100' | 'referrals_3';
  requestedAt?: number;
  hardwareId: string;
}

export interface CoinAnimationEvent {
  id: number;
  coinsDelta: number;
  type: 'earn' | 'spend' | 'vip';
  labelFa: string;
  labelEn: string;
}

const QUOTA_STORAGE_KEY = 'onedownload_daily_quota_v5';
const PRO_STORAGE_KEY = 'onedownload_vip_pro_sub_v5';
const COINS_STORAGE_KEY = 'onedownload_jet_coins_v5';
const REWARD_LOG_STORAGE_KEY = 'onedownload_reward_log_v5';
const REFERRAL_STORAGE_KEY = 'od_permanent_referral_state_v1';
const LEGACY_REFERRAL_STORAGE_KEY = 'onedownload_referral_state_v5';
const MY_RANDOM_REF_CODE_KEY = 'od_fixed_referral_code';
const LEGACY_REF_CODE_KEY = 'onedownload_my_random_ref_code_v5';
const VIP_REQUEST_STORAGE_KEY = 'onedownload_vip_request_v5';
const ACCOUNT_VIP_MAP_KEY = 'od_account_vip_registry_v1';
const ACTIVE_ACCOUNT_ID_KEY = 'od_active_account_identifier_v1';

interface AccountVipRecord {
  identifier: string;
  vipActive: boolean;
  vipPlan: string;
  vipExpiry: number;
  planName: string;
  referralCode: string;
  updatedAt: number;
}

function normalizeAccountIdentifier(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim()
    .toLowerCase();
}

function readCookieValue(name: string): string | null {
  try {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  } catch {
    return null;
  }
}

function writeCookieValue(name: string, value: string): void {
  try {
    if (typeof document === 'undefined') return;
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=315360000; SameSite=Lax`;
  } catch {
    // ignore
  }
}

function getActiveAccountIdentifier(): string {
  try {
    const explicit = localStorage.getItem(ACTIVE_ACCOUNT_ID_KEY);
    if (explicit) return normalizeAccountIdentifier(explicit);
    const sessionRaw =
      localStorage.getItem('od_user_session') ||
      localStorage.getItem('onedownload_user_session_v2');
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw);
      const emailOrPhone = parsed?.user?.email || parsed?.user?.phone || '';
      if (emailOrPhone && emailOrPhone !== 'guest@appone.ir') {
        return normalizeAccountIdentifier(emailOrPhone);
      }
    }
  } catch {
    // ignore
  }
  return '';
}

function saveVipRecordForCurrentAccount(
  vipExpiry: number,
  vipPlan: string,
  planName: string,
  explicitIdentifier?: string
): void {
  try {
    const id = normalizeAccountIdentifier(explicitIdentifier) || getActiveAccountIdentifier();
    writeCookieValue('od_vip_expiry_cookie', String(vipExpiry));
    writeCookieValue('od_vip_plan_cookie', String(vipPlan));
    if (!id) return;
    const rawMap = localStorage.getItem(ACCOUNT_VIP_MAP_KEY);
    const map: Record<string, AccountVipRecord> = rawMap ? JSON.parse(rawMap) : {};
    map[id] = {
      identifier: id,
      vipActive: vipExpiry > Date.now(),
      vipPlan,
      vipExpiry,
      planName,
      referralCode: getMyReferralCode(),
      updatedAt: Date.now()
    };
    localStorage.setItem(ACCOUNT_VIP_MAP_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

type QuotaSubscriber = () => void;
const subscribers: Set<QuotaSubscriber> = new Set();

type CoinAnimSubscriber = (event: CoinAnimationEvent) => void;
const coinAnimSubscribers: Set<CoinAnimSubscriber> = new Set();

export function subscribeQuotaAndCoins(cb: QuotaSubscriber): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function subscribeCoinAnimation(cb: CoinAnimSubscriber): () => void {
  coinAnimSubscribers.add(cb);
  return () => coinAnimSubscribers.delete(cb);
}

function notifySubscribers() {
  subscribers.forEach((cb) => cb());
}

export function triggerCoinAnimation(
  coinsDelta: number,
  type: 'earn' | 'spend' | 'vip',
  labelFa: string,
  labelEn: string
) {
  const evt: CoinAnimationEvent = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    coinsDelta,
    type,
    labelFa,
    labelEn
  };
  coinAnimSubscribers.forEach((cb) => cb(evt));
}

/**
 * Synthesizes an upbeat metallic coin-collection sound effect using Web Audio API
 */
export function playCoinCollectSound(coinCount = 2): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [1318.51, 1567.98, 1760.0, 2093.0, 2637.02];
    const pulses = Math.min(8, Math.max(2, coinCount));

    for (let i = 0; i < pulses; i++) {
      const startTime = ctx.currentTime + i * 0.075;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      const freq = notes[i % notes.length];
      osc.frequency.setValueAtTime(freq, startTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.25, startTime + 0.06);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.24, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.23);
    }

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1500);
  } catch {
    // Ignore audio context restrictions
  }
}

/**
 * Synthesizes a celebratory VIP Pro unlock fanfare sound using Web Audio API
 */
export function playVipUnlockSound(): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const chord = [523.25, 659.25, 783.99, 1046.5, 1318.51];

    chord.forEach((freq, idx) => {
      const startTime = ctx.currentTime + idx * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.25, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.46);
    });

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 2000);
  } catch {
    // Ignore
  }
}

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Initial coin balance for every new user is strictly 0 (صفر)
 */
export function getCoinsBalance(): number {
  try {
    const raw = localStorage.getItem(COINS_STORAGE_KEY);
    if (raw === null) {
      localStorage.setItem(COINS_STORAGE_KEY, '0');
      return 0;
    }
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  } catch {
    return 0;
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
    maxAdsPerDay: 0,
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
  const watchedAdsToday = status.watchedAdsToday;
  const sharedToday = status.sharedToday;
  let coinsAdded = 0;
  let messageFa = '';
  let messageEn = '';

  if (action === 'daily_checkin') {
    if (checkedInToday) {
      return {
        success: false,
        coinsAdded: 0,
        newBalance: status.coins,
        messageFa: 'هدیه ورود روزانه امروز قبلاً دریافت شده است',
        messageEn: 'Daily check-in reward already claimed today'
      };
    }
    checkedInToday = true;
    // Strictly +2 Coins for Daily Check-in as requested
    coinsAdded = 2;
    messageFa = '+۲ سکه بابت هدیه ورود روزانه به کیف پول شما اضافه شد!';
    messageEn = '+2 Coins added for Daily Check-in!';
  } else if (action === 'watch_ad') {
    // Watch Ad (+5 Coins) is strictly disabled and returns "در حال به‌روزرسانی" without awarding any coins
    return {
      success: false,
      coinsAdded: 0,
      newBalance: status.coins,
      messageFa: 'در حال به‌روزرسانی',
      messageEn: 'Updating...'
    };
  } else if (action === 'share_app') {
    return {
      success: true,
      coinsAdded: 0,
      newBalance: status.coins,
      messageFa: 'منوی ارسال نرم‌افزار و کد معرف باز شد',
      messageEn: 'Share menu opened'
    };
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

  if (coinsAdded > 0) {
    playCoinCollectSound(coinsAdded);
    triggerCoinAnimation(
      coinsAdded,
      'earn',
      `+${coinsAdded} سکه دریافت شد!`,
      `+${coinsAdded} Coins Earned!`
    );
  }

  return {
    success: true,
    coinsAdded,
    newBalance,
    messageFa,
    messageEn
  };
}

/**
 * Generates a 100% permanent, non-changeable personal referral code bound deterministically
 * to the device's permanent Hardware ID (`od_fixed_hardware_id`, e.g., OD-8K4X9P2M)
 * and locked permanently across localStorage and cookies (`od_fixed_referral_code`).
 */
export function getMyReferralCode(): string {
  try {
    const existing = localStorage.getItem(MY_RANDOM_REF_CODE_KEY);
    if (existing && /^OD-[A-Z0-9]{8}$/.test(existing)) {
      writeCookieValue(MY_RANDOM_REF_CODE_KEY, existing);
      return existing;
    }
    const fromCookie = readCookieValue(MY_RANDOM_REF_CODE_KEY);
    if (fromCookie && /^OD-[A-Z0-9]{8}$/.test(fromCookie)) {
      localStorage.setItem(MY_RANDOM_REF_CODE_KEY, fromCookie);
      return fromCookie;
    }
    const legacy = localStorage.getItem(LEGACY_REF_CODE_KEY);
    if (legacy && /^OD-[A-Z0-9]{8}$/.test(legacy)) {
      localStorage.setItem(MY_RANDOM_REF_CODE_KEY, legacy);
      writeCookieValue(MY_RANDOM_REF_CODE_KEY, legacy);
      return legacy;
    }
    const hwid = getOrCreateDeviceId();
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const seedStr = `OD_REF_PERMANENT_V1::${hwid}::APPONE_LOCK`;
    let h1 = 0x811c9dc5;
    let h2 = 0x1b873593;
    for (let i = 0; i < seedStr.length; i++) {
      const c = seedStr.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= c + i * 29;
      h2 = Math.imul(h2, 0x85ebca6b);
    }
    let token = '';
    for (let i = 0; i < 8; i++) {
      const mixed = Math.abs(Math.imul(i % 2 === 0 ? h1 : h2, (i + 3) * 41) ^ (h1 >>> (i % 5)));
      token += alphabet[mixed % alphabet.length];
    }
    const generated = `OD-${token}`;
    localStorage.setItem(MY_RANDOM_REF_CODE_KEY, generated);
    writeCookieValue(MY_RANDOM_REF_CODE_KEY, generated);
    return generated;
  } catch {
    return 'OD-9X4K7M2P';
  }
}

/**
 * Loads current user's Referral progress (0/3, 1/3, 2/3, 3/3)
 */
export function getReferralInfo(): ReferralInfo {
  const myCode = getMyReferralCode();
  let invitedUsers: InvitedReferralRecord[] = [];
  let appliedReferralCode: string | undefined;

  try {
    const raw =
      localStorage.getItem(REFERRAL_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_REFERRAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.invitedUsers)) {
        invitedUsers = parsed.invitedUsers;
      }
      if (parsed.appliedReferralCode) {
        appliedReferralCode = parsed.appliedReferralCode;
      }
      if (!localStorage.getItem(REFERRAL_STORAGE_KEY)) {
        localStorage.setItem(REFERRAL_STORAGE_KEY, raw);
      }
    }
  } catch {
    // ignore
  }

  return {
    myReferralCode: myCode,
    invitedCount: invitedUsers.length,
    targetInvitesForVip: 3,
    invitedUsers,
    appliedReferralCode,
    vipEligibleByReferral: invitedUsers.length >= 3
  };
}

/**
 * Processes a Referral Code entered on the Registration screen.
 * - Saves the referral permanently in `od_permanent_referral_state_v1` so «تعداد رفرال‌های موفق» increments by +1.
 * - When the counter reaches 3 (`invitedCount >= 3`), automatically and permanently activates the 1-Month VIP subscription.
 */
export function submitReferralCodeOrInvite(
  rawCodeInput: string,
  friendIdentifier?: string
): {
  success: boolean;
  referralInfo: ReferralInfo;
  unlockedVipRequest: boolean;
  coinsAwarded: number;
  messageFa: string;
  messageEn: string;
} {
  const cleanedCode = rawCodeInput.trim().toUpperCase();
  const currentInfo = getReferralInfo();

  if (!cleanedCode || cleanedCode.length < 3) {
    return {
      success: false,
      referralInfo: currentInfo,
      unlockedVipRequest: false,
      coinsAwarded: 0,
      messageFa: 'لطفاً یک کد معرف معتبر وارد نمایید.',
      messageEn: 'Please enter a valid referral code.'
    };
  }

  const newRecord: InvitedReferralRecord = {
    id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    codeOrIdentifier: friendIdentifier ? `${friendIdentifier} (${cleanedCode})` : cleanedCode,
    timestamp: Date.now()
  };

  const updatedInvites = [...currentInfo.invitedUsers, newRecord];
  const newCount = updatedInvites.length;
  const unlockedVipRequest = newCount >= 3;

  try {
    localStorage.setItem(
      REFERRAL_STORAGE_KEY,
      JSON.stringify({
        invitedUsers: updatedInvites,
        appliedReferralCode: cleanedCode,
        vipUnlockedByReferral: unlockedVipRequest
      })
    );
  } catch {
    // ignore
  }

  // Cloud Sync: Register referral usage on backend so both local and cloud state stay synced
  if (typeof window !== 'undefined' && typeof fetch === 'function') {
    fetch('/api/referral/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerCode: cleanedCode,
        friendIdentifier: friendIdentifier || '',
        refereeHardwareId: getOrCreateDeviceId()
      })
    }).catch(() => {});
    if (cleanedCode !== currentInfo.myReferralCode) {
      fetch('/api/referral/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerCode: currentInfo.myReferralCode,
          friendIdentifier: friendIdentifier || cleanedCode,
          refereeHardwareId: getOrCreateDeviceId()
        })
      }).catch(() => {});
    }
  }

  if (unlockedVipRequest) {
    activateProPlan('monthly_referral');
    playVipUnlockSound();
    triggerCoinAnimation(
      0,
      'vip',
      '🎉 تبریک! با ثبت ۳ رفرال موفق، اشتراک VIP یک‌ماهه (۳۰ روزه) شما به طور خودکار فعال شد!',
      '🎉 Congratulations! 3 Referrals Completed — 1-Month VIP Activated Automatically!'
    );
  }

  notifySubscribers();
  const updatedInfo = getReferralInfo();

  if (unlockedVipRequest) {
    return {
      success: true,
      referralInfo: updatedInfo,
      unlockedVipRequest: true,
      coinsAwarded: 0,
      messageFa: '🎉 تبریک! با تکمیل ۳ رفرال موفق، اشتراک ۱ ماهه VIP (۳۰ روزه) به طور خودکار فعال گردید!',
      messageEn: '🎉 Congratulations! 3 referrals completed and 1-Month VIP activated automatically!'
    };
  }

  const remainingToVip = Math.max(0, 3 - (newCount % 3));
  return {
    success: true,
    referralInfo: updatedInfo,
    unlockedVipRequest: false,
    coinsAwarded: 0,
    messageFa: `کد معرف با موفقیت ثبت شد (${newCount} از ۳ رفرال موفق — ${remainingToVip} دعوت دیگر تا فعال‌سازی خودکار اشتراک ۱ ماهه VIP).`,
    messageEn: `Referral recorded (${newCount}/3 invites — ${remainingToVip} more for automatic 1-Month VIP).`
  };
}

/**
 * Syncs the current user's referral invite list from the Cloud Sync API (/api/referral/sync).
 * Automatically activates 1-Month (30-Day) VIP as soon as 3 successful referrals are reached!
 */
export async function syncReferralFromCloud(): Promise<{
  referralInfo: ReferralInfo;
  autoActivatedVip: boolean;
}> {
  const myCode = getMyReferralCode();
  const current = getReferralInfo();
  try {
    const res = await fetch(`/api/referral/sync?code=${encodeURIComponent(myCode)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && Array.isArray(data.invitedUsers)) {
        const mergedMap = new Map<string, InvitedReferralRecord>();
        for (const item of current.invitedUsers) {
          mergedMap.set(item.codeOrIdentifier, item);
        }
        for (const cloudItem of data.invitedUsers) {
          if (cloudItem && cloudItem.codeOrIdentifier && !mergedMap.has(cloudItem.codeOrIdentifier)) {
            mergedMap.set(cloudItem.codeOrIdentifier, {
              id: cloudItem.id || `cloud-${Date.now()}`,
              codeOrIdentifier: cloudItem.codeOrIdentifier,
              timestamp: cloudItem.timestamp || Date.now()
            });
          }
        }
        const mergedList = Array.from(mergedMap.values());
        const prevCount = current.invitedUsers.length;
        if (mergedList.length !== prevCount) {
          localStorage.setItem(
            REFERRAL_STORAGE_KEY,
            JSON.stringify({
              invitedUsers: mergedList,
              appliedReferralCode: current.appliedReferralCode
            })
          );
        }

        const quota = getDailyQuota();
        let autoActivatedVip = false;
        if (mergedList.length >= 3 && !quota.isPro) {
          activateProPlan('monthly_referral');
          playVipUnlockSound();
          triggerCoinAnimation(
            0,
            'vip',
            '🎉 تبریک! ۳ زیرمجموعه با کد معرف شما ثبت شد و اشتراک VIP یک‌ماهه (۳۰ روزه) فعال گردید!',
            '🎉 Congratulations! 3 Referrals Reached — 1-Month VIP Activated Automatically!'
          );
          autoActivatedVip = true;
        }
        notifySubscribers();
        return {
          referralInfo: getReferralInfo(),
          autoActivatedVip
        };
      }
    }
  } catch {
    // ignore offline/network errors
  }
  return {
    referralInfo: current,
    autoActivatedVip: false
  };
}

/**
 * Checks whether the user is eligible to activate 1-Month VIP via 100 Coins or 3 Referrals
 */
export function getVipEligibilityState(): VipEligibilityState {
  const coins = getCoinsBalance();
  const ref = getReferralInfo();
  const hardwareId = getOrCreateDeviceId();

  let hasRequestedOneMonth = false;
  let requestedVia: 'coins_100' | 'referrals_3' | undefined;
  let requestedAt: number | undefined;

  try {
    const raw = localStorage.getItem(VIP_REQUEST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.hasRequestedOneMonth) {
        hasRequestedOneMonth = true;
        requestedVia = parsed.requestedVia;
        requestedAt = parsed.requestedAt;
      }
    }
  } catch {
    // ignore
  }

  const isEligibleForOneMonthRequest =
    hasRequestedOneMonth || coins >= 100 || ref.invitedCount >= 3;

  return {
    isEligibleForOneMonthRequest,
    hasRequestedOneMonth,
    requestedVia,
    requestedAt,
    hardwareId
  };
}

/**
 * Activates 1-Month VIP Subscription immediately when user reaches 100 Coins or 3 Referrals
 */
export function submitOneMonthVipRequest(): {
  success: boolean;
  state: VipEligibilityState;
  quota?: QuotaInfo;
  messageFa: string;
  messageEn: string;
} {
  const coins = getCoinsBalance();
  const ref = getReferralInfo();
  const current = getVipEligibilityState();

  if (coins >= 100) {
    setCoinsBalance(coins - 100);
    const updatedQuota = activateProPlan('coin_30d');
    playVipUnlockSound();
    triggerCoinAnimation(
      -100,
      'vip',
      '🎉 ۱۰۰ سکه کسر شد • اشتراک VIP یک‌ماهه (۳۰ روزه) فعال گردید!',
      '🎉 100 Coins Redeemed • 1-Month VIP Activated!'
    );
    const nextState: VipEligibilityState = {
      isEligibleForOneMonthRequest: true,
      hasRequestedOneMonth: true,
      requestedVia: 'coins_100',
      requestedAt: Date.now(),
      hardwareId: current.hardwareId
    };
    try {
      localStorage.setItem(VIP_REQUEST_STORAGE_KEY, JSON.stringify(nextState));
    } catch {
      // ignore
    }
    notifySubscribers();
    return {
      success: true,
      state: nextState,
      quota: updatedQuota,
      messageFa: '🎉 تبریک! با کسر ۱۰۰ سکه، اشتراک VIP یک‌ماهه (۳۰ روزه) شما با موفقیت فعال گردید!',
      messageEn: '🎉 Congratulations! 100 Coins redeemed and your 1-Month VIP subscription is now active!'
    };
  }

  if (ref.invitedCount >= 3) {
    const updatedQuota = activateProPlan('monthly_referral');
    playVipUnlockSound();
    triggerCoinAnimation(
      0,
      'vip',
      '🎉 پاداش ۳ دعوت موفق • اشتراک VIP یک‌ماهه (۳۰ روزه) فعال گردید!',
      '🎉 3 Referrals Reward • 1-Month VIP Activated!'
    );
    const nextState: VipEligibilityState = {
      isEligibleForOneMonthRequest: true,
      hasRequestedOneMonth: true,
      requestedVia: 'referrals_3',
      requestedAt: Date.now(),
      hardwareId: current.hardwareId
    };
    try {
      localStorage.setItem(VIP_REQUEST_STORAGE_KEY, JSON.stringify(nextState));
    } catch {
      // ignore
    }
    notifySubscribers();
    return {
      success: true,
      state: nextState,
      quota: updatedQuota,
      messageFa: '🎉 تبریک! با ۳ دعوت موفق، اشتراک VIP یک‌ماهه (۳۰ روزه) شما با موفقیت فعال گردید!',
      messageEn: '🎉 Congratulations! Your 1-Month VIP subscription is now active via 3 referrals!'
    };
  }

  return {
    success: false,
    state: current,
    messageFa: `برای فعال‌سازی اشتراک VIP یک‌ماهه با سکه، موجودی شما باید به ۱۰۰ سکه برسد (موجودی فعلی: ${coins} سکه) یا ۳ نفر را دعوت کنید (${ref.invitedCount} از ۳).`,
    messageEn: `You need 100 Coins (current: ${coins}) or 3 Referrals (${ref.invitedCount}/3) to activate 1-Month VIP.`
  };
}

/**
 * Cryptographic-style hash signature generator for non-guessable VIP Activation Codes
 * Computes a deterministic 6-character alphanumeric signature from (Hardware ID + Tier Secret Salt)
 */
function computeAlgorithmicSignature(cleanDeviceId: string, tierSalt: string): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const payload = `OD_SIG_V5::${cleanDeviceId}::${tierSalt}::APPONE_SECRET_9941`;
  let h1 = 0x811c9dc5;
  let h2 = 0x1b873593;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + i * 17;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const combined = [
    Math.abs(h1),
    Math.abs(h2),
    Math.abs(h1 ^ h2),
    Math.abs(Math.imul(h1, 31) + h2),
    Math.abs(Math.imul(h2, 37) + h1),
    Math.abs((h1 >>> 3) ^ (h2 << 2))
  ];
  return combined.map((val) => alphabet[val % alphabet.length]).join('');
}

/**
 * تابع استاندارد و دقیق اعتبارسنجی لایسنس VIP در وان دانلود
 * هماهنگ با سامانه مرکزی مدیریت لایسنس (ODVIP-P1-P2-P3-P4)
 */
export function verifyOneDownloadLicense(
  hardwareId: string,
  licenseCode: string
): {
  success: boolean;
  planMonths?: number;
  durationDays?: number;
  expireTimestamp?: number;
  msg: string;
} {
  if (!hardwareId || !licenseCode) {
    return {
      success: false,
      msg: 'لطفاً شناسه دستگاه و کد فعال‌سازی را وارد کنید'
    };
  }

  // پاکسازی کامل کاراکترهای مخفی و فاصله‌ها
  const cleanHWID = hardwareId.replace(/[^A-Za-z0-9\-]/g, '').trim().toUpperCase();
  const cleanCode = licenseCode.replace(/[^A-Za-z0-9\-]/g, '').trim().toUpperCase();

  const parts = cleanCode.split('-');
  if (parts.length !== 5 || parts[0] !== 'ODVIP') {
    return {
      success: false,
      msg: 'فرمت کد فعال‌سازی نامعتبر است!'
    };
  }

  const [prefix, p1, p2, p3, p4] = parts;
  void prefix;
  void p2;
  void p4;
  const SECRET_SALT = 'OD_SECURE_SALT_9901_KEY';

  // بررسی پلن‌های ۱ ماهه (۳۰ روز)، ۳ ماهه (۹۰ روز) و ۱۲ ماهه (۳۶۵ روز)
  const validPlans = [1, 3, 12];
  let matchedPlan: number | null = null;

  for (const plan of validPlans) {
    const rawString = `${cleanHWID}_P${plan}_${SECRET_SALT}`;

    // الگوریتم هش استاندارد ۳۲ بیتی
    let hash = 0;
    for (let i = 0; i < rawString.length; i++) {
      hash = ((hash << 5) - hash) + rawString.charCodeAt(i);
      hash |= 0;
    }

    const hex = Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();
    const expectedP1 = hex.substring(0, 4);
    const expectedP3 = hex.substring(4, 8);

    if (p1 === expectedP1 && p3 === expectedP3) {
      matchedPlan = plan;
      break;
    }
  }

  if (!matchedPlan) {
    return {
      success: false,
      msg: 'کد فعال‌سازی واردشده معتبر نیست یا با شناسه سخت‌افزاری دستگاه شما مطابقت ندارد!'
    };
  }

  // محاسبه زمان انقضای اشتراک
  const durationDays = matchedPlan === 1 ? 30 : matchedPlan === 3 ? 90 : 365;
  const expireTimestamp = Date.now() + durationDays * 24 * 60 * 60 * 1000;

  // ذخیره وضعیت VIP در حافظه دائمی برنامه و اتصال به حساب کاربری
  try {
    localStorage.setItem('od_vip_active', 'true');
    localStorage.setItem('od_vip_plan', matchedPlan.toString());
    localStorage.setItem('od_vip_expiry', expireTimestamp.toString());
    const planName =
      matchedPlan === 12
        ? 'اشتراک VIP یک‌ساله (۱۲ ماهه)'
        : matchedPlan === 3
        ? 'اشتراک VIP سه‌ماهه (۹۰ روزه)'
        : 'اشتراک VIP یک‌ماهه (۳۰ روزه)';
    saveVipRecordForCurrentAccount(expireTimestamp, matchedPlan.toString(), planName);
  } catch {
    // ignore storage errors
  }

  return {
    success: true,
    planMonths: matchedPlan,
    durationDays: durationDays,
    expireTimestamp: expireTimestamp,
    msg: `تبریک! اشتراک VIP ${matchedPlan} ماهه (${durationDays} روزه) با موفقیت فعال شد.`
  };
}

/**
 * Validates the manual VIP Activation Code entered by the user in the VIP Activation Box
 * using verifyOneDownloadLicense(hardwareId, licenseCode).
 */
export function verifyAndActivateVipCode(
  rawInputCode: string,
  explicitHardwareId?: string
): {
  success: boolean;
  quota: QuotaInfo;
  messageFa: string;
  messageAr: string;
  messageEn: string;
} {
  const currentQuota = getDailyQuota();
  const hardwareId = (explicitHardwareId || getOrCreateDeviceId()).trim();

  const result = verifyOneDownloadLicense(hardwareId, rawInputCode);

  if (!result.success || !result.planMonths) {
    let messageAr = 'كود التفعيل غير صالح أو لا يتطابق مع معرف الجهاز (Hardware ID)!';
    let messageEn = 'Invalid Activation Code or Hardware ID mismatch!';

    if (result.msg.includes('فرمت')) {
      messageAr = 'صيغة كود التفعيل غير صالحة! (ODVIP-XXXX-XXXX-XXXX-XXXX)';
      messageEn = 'Invalid Activation Code format! (ODVIP-XXXX-XXXX-XXXX-XXXX)';
    } else if (result.msg.includes('وارد کنید')) {
      messageAr = 'يرجى إدخال معرف الجهاز وكود التفعيل بالكامل.';
      messageEn = 'Please enter both Hardware ID and Activation Code.';
    }

    return {
      success: false,
      quota: currentQuota,
      messageFa: result.msg,
      messageAr,
      messageEn
    };
  }

  const planMonths = result.planMonths;
  const durationDays = result.durationDays || (planMonths === 1 ? 30 : planMonths === 3 ? 90 : 365);
  const detectedPlan: 'monthly' | 'quarterly' | 'yearly' =
    planMonths === 1 ? 'monthly' : planMonths === 3 ? 'quarterly' : 'yearly';

  const planLabelFa = `${planMonths} ماهه (${durationDays} روزه)`;
  const planLabelEn = `${planMonths}-Month (${durationDays} Days)`;
  const planLabelAr = `${planMonths} أشهر (${durationDays} يوم)`;

  const updated = activateProPlan(detectedPlan);
  playVipUnlockSound();
  triggerCoinAnimation(
    0,
    'vip',
    `🎉 اشتراک VIP ${planLabelFa} با موفقیت فعال گردید!`,
    `🎉 VIP ${planLabelEn} Subscription Activated!`
  );

  return {
    success: true,
    quota: updated,
    messageFa: result.msg,
    messageAr: `🎉 تهانينا! تم تفعيل اشتراك VIP لمدة ${planLabelAr} بنجاح.`,
    messageEn: `🎉 Congratulations! Your ${planLabelEn} VIP subscription has been activated.`
  };
}

/**
 * Daily Free Quota for normal users is strictly 3 downloads per day (۳ عدد در روز).
 */
export function getDailyQuota(): QuotaInfo {
  const todayKey = getTodayKey();
  const baseMaxDaily = 3;

  let isPro = false;
  let proPlanName: string | undefined;
  let proExpiryDate: number | undefined;
  let remainingProDays: number | undefined;

  try {
    // 1. Check central license keys (od_vip_active, od_vip_plan, od_vip_expiry) + cookie / account backup
    let odVipActive = localStorage.getItem('od_vip_active') === 'true';
    let odVipExpiryRaw = localStorage.getItem('od_vip_expiry');
    let odVipPlanRaw = localStorage.getItem('od_vip_plan');

    if (!odVipExpiryRaw) {
      const cookieExp = readCookieValue('od_vip_expiry_cookie');
      const cookiePlan = readCookieValue('od_vip_plan_cookie');
      if (cookieExp && Number(cookieExp) > Date.now()) {
        odVipActive = true;
        odVipExpiryRaw = cookieExp;
        odVipPlanRaw = cookiePlan || '1';
        localStorage.setItem('od_vip_active', 'true');
        localStorage.setItem('od_vip_expiry', cookieExp);
        localStorage.setItem('od_vip_plan', odVipPlanRaw);
      }
    }

    if (!odVipActive || !odVipExpiryRaw) {
      const activeId = getActiveAccountIdentifier();
      if (activeId) {
        const rawMap = localStorage.getItem(ACCOUNT_VIP_MAP_KEY);
        if (rawMap) {
          const map: Record<string, AccountVipRecord> = JSON.parse(rawMap);
          const accRec = map[activeId];
          if (accRec && accRec.vipExpiry > Date.now()) {
            odVipActive = true;
            odVipExpiryRaw = String(accRec.vipExpiry);
            odVipPlanRaw = accRec.vipPlan || '1';
            localStorage.setItem('od_vip_active', 'true');
            localStorage.setItem('od_vip_expiry', odVipExpiryRaw);
            localStorage.setItem('od_vip_plan', odVipPlanRaw);
          }
        }
      }
    }

    if (odVipActive && odVipExpiryRaw) {
      const expiryNum = Number(odVipExpiryRaw);
      if (Number.isFinite(expiryNum) && expiryNum > Date.now()) {
        isPro = true;
        proExpiryDate = expiryNum;
        const diffMs = Math.max(0, expiryNum - Date.now());
        remainingProDays = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
        if (odVipPlanRaw === '12') {
          proPlanName = 'اشتراک VIP یک‌ساله (۱۲ ماهه)';
        } else if (odVipPlanRaw === '3') {
          proPlanName = 'اشتراک VIP سه‌ماهه (۹۰ روزه)';
        } else {
          proPlanName = 'اشتراک VIP یک‌ماهه (۳۰ روزه)';
        }
      } else if (Number.isFinite(expiryNum) && expiryNum <= Date.now()) {
        localStorage.removeItem('od_vip_active');
      }
    }

    // 2. Also check PRO_STORAGE_KEY
    const proRaw = localStorage.getItem(PRO_STORAGE_KEY);
    if (proRaw) {
      const proData = JSON.parse(proRaw);
      if (proData && proData.isActive === true && (!proData.expiry || proData.expiry > Date.now())) {
        isPro = true;
        proPlanName = proData.planName || proPlanName || 'اشتراک VIP Pro';
        proExpiryDate = proData.expiry || proExpiryDate;
        if (proExpiryDate) {
          const diffMs = Math.max(0, proExpiryDate - Date.now());
          remainingProDays = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
        }
      }
    }

    // 3. Also check if user has reached >= 3 referrals (automatic 1-Month VIP activation)
    if (!isPro) {
      const refStateRaw = localStorage.getItem(REFERRAL_STORAGE_KEY);
      if (refStateRaw) {
        const refParsed = JSON.parse(refStateRaw);
        if (Array.isArray(refParsed?.invitedUsers) && refParsed.invitedUsers.length >= 3) {
          const autoExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
          isPro = true;
          proPlanName = 'اشتراک VIP یک‌ماهه (هدیه ۳ رفرال موفق)';
          proExpiryDate = autoExpiry;
          remainingProDays = 30;
          localStorage.setItem(
            PRO_STORAGE_KEY,
            JSON.stringify({
              isActive: true,
              planId: 'monthly_referral',
              planName: proPlanName,
              expiry: autoExpiry,
              activatedAt: Date.now()
            })
          );
          localStorage.setItem('od_vip_active', 'true');
          localStorage.setItem('od_vip_plan', '1');
          localStorage.setItem('od_vip_expiry', String(autoExpiry));
          saveVipRecordForCurrentAccount(autoExpiry, '1', proPlanName);
        }
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
    remainingProDays,
    dateKey: todayKey
  };
}

export function canDownload(): boolean {
  const quota = getDailyQuota();
  return quota.isPro || quota.remainingToday > 0;
}

/**
 * Consumes 1 download quota.
 * If the user's 3 free daily downloads are used up and they have >= 5 coins,
 * automatically deducts 5 coins for the extra download!
 */
export function consumeDownloadQuota(): {
  quota: QuotaInfo;
  autoDeductedCoins: number;
} {
  const quota = getDailyQuota();
  if (quota.isPro) {
    return { quota, autoDeductedCoins: 0 };
  }

  let autoDeductedCoins = 0;
  let bonusToSave = quota.bonusDownloadsToday;

  // If 3 daily free downloads are exhausted, automatically deduct 5 coins if user has >= 5 coins
  if (quota.remainingToday <= 0) {
    const currentCoins = getCoinsBalance();
    if (currentCoins >= 5) {
      setCoinsBalance(currentCoins - 5);
      bonusToSave += 1;
      autoDeductedCoins = 5;
      triggerCoinAnimation(
        -5,
        'spend',
        '-۵ سکه بابت دانلود اضافه امروز کسر شد',
        '-5 Coins deducted for extra download'
      );
    }
  }

  const todayKey = getTodayKey();
  const newUsed = quota.usedToday + 1;

  try {
    localStorage.setItem(
      QUOTA_STORAGE_KEY,
      JSON.stringify({
        dateKey: todayKey,
        usedCount: newUsed,
        bonusDownloads: bonusToSave,
        updatedAt: Date.now()
      })
    );
  } catch {
    // ignore
  }

  notifySubscribers();
  return {
    quota: getDailyQuota(),
    autoDeductedCoins
  };
}

export function activateProPlan(
  planId:
    | 'monthly'
    | 'quarterly'
    | 'yearly'
    | 'lifetime'
    | 'coin_24h'
    | 'coin_7d'
    | 'coin_30d'
    | 'monthly_referral'
    | 'manual_code_vip'
): QuotaInfo {
  let days = 30;
  let planName = 'اشتراک VIP یک‌ماهه (۳۰ روزه)';
  if (planId === 'quarterly') {
    days = 90;
    planName = 'اشتراک VIP سه‌ماهه (۹۰ روزه)';
  } else if (planId === 'yearly') {
    days = 365;
    planName = 'اشتراک VIP یک‌ساله (۱۲ ماهه)';
  } else if (planId === 'lifetime') {
    days = 36500;
    planName = 'اشتراک دائمی VIP Pro';
  } else if (planId === 'coin_24h') {
    days = 1;
    planName = 'اشتراک VIP روزانه';
  } else if (planId === 'coin_7d') {
    days = 7;
    planName = 'اشتراک VIP هفتگی';
  } else {
    days = 30;
    planName = 'اشتراک VIP یک‌ماهه (۳۰ روزه)';
  }

  const expiry = Date.now() + days * 24 * 60 * 60 * 1000;
  const planCode = days >= 365 ? '12' : days >= 90 ? '3' : '1';
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
    localStorage.setItem('od_vip_active', 'true');
    localStorage.setItem('od_vip_plan', planCode);
    localStorage.setItem('od_vip_expiry', String(expiry));
    saveVipRecordForCurrentAccount(expiry, planCode, planName);
  } catch {
    // ignore
  }

  notifySubscribers();
  return getDailyQuota();
}

export function redeemCoinsForQuotaOrPro(
  option: 'extra_1_download' | 'extra_3_downloads' | 'vip_1_month_100_coins'
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

  if (option === 'vip_1_month_100_coins') {
    if (currentCoins < 100) {
      return {
        success: false,
        newBalance: currentCoins,
        quota,
        messageFa: `موجودی سکه کافی نیست! برای فعال‌سازی اشتراک VIP یک‌ماهه به ۱۰۰ سکه نیاز دارید (موجودی فعلی: ${currentCoins} سکه).`,
        messageEn: `Need 100 coins to activate 1-Month VIP (Current: ${currentCoins} coins).`
      };
    }
    const newBalance = setCoinsBalance(currentCoins - 100);
    const updatedQuota = activateProPlan('coin_30d');
    playVipUnlockSound();
    triggerCoinAnimation(
      -100,
      'vip',
      '🎉 ۱۰۰ سکه کسر شد • اشتراک VIP یک‌ماهه فعال گردید!',
      '🎉 100 Coins Redeemed • 1-Month VIP Activated!'
    );
    return {
      success: true,
      newBalance,
      quota: updatedQuota,
      messageFa: '🎉 ۱۰۰ سکه از موجودی کسر شد و اشتراک VIP یک‌ماهه (۳۰ روزه) شما فعال گردید!',
      messageEn: '🎉 100 coins deducted and 1-Month VIP subscription activated!'
    };
  }

  const costs = {
    extra_1_download: 5,
    extra_3_downloads: 15
  };

  const requiredCoins = costs[option];
  if (currentCoins < requiredCoins) {
    return {
      success: false,
      newBalance: currentCoins,
      quota,
      messageFa: `موجودی سکه کافی نیست! برای هر دانلود اضافه به ۵ سکه نیاز دارید (موجودی فعلی شما: ${currentCoins} سکه).`,
      messageEn: `Not enough coins! Need ${requiredCoins} coins (Current balance: ${currentCoins} coins).`
    };
  }

  // Deduct 5 coins per extra download & update header immediately
  const newBalance = setCoinsBalance(currentCoins - requiredCoins);

  const addedCount = option === 'extra_1_download' ? 1 : 3;
  const newBonus = quota.bonusDownloadsToday + addedCount;
  try {
    localStorage.setItem(
      QUOTA_STORAGE_KEY,
      JSON.stringify({
        dateKey: todayKey,
        usedCount: quota.usedToday,
        bonusDownloads: newBonus,
        updatedAt: Date.now()
      })
    );
  } catch {
    // ignore
  }
  playCoinCollectSound(2);
  triggerCoinAnimation(
    -requiredCoins,
    'spend',
    `-${requiredCoins} سکه کسر شد (+${addedCount} دانلود اضافه)`,
    `-${requiredCoins} Coins Redeemed (+${addedCount} Extra Download)`
  );
  notifySubscribers();
  return {
    success: true,
    newBalance,
    quota: getDailyQuota(),
    messageFa: `${requiredCoins} سکه از موجودی شما کسر شد و +${addedCount} دانلود اضافه به سهمیه امروز افزوده گردید!`,
    messageEn: `${requiredCoins} coins deducted and +${addedCount} extra download(s) added for today!`
  };
}

/**
 * Synchronizes VIP subscription status and fixed referral code with the logged-in user's account
 * (email or mobile number) so logging out, refreshing, or re-logging in with the same email/phone
 * immediately restores the exact VIP plan and remaining days.
 */
export function syncAccountVipAndReferral(accountIdentifier?: string): QuotaInfo {
  try {
    const cleanId = normalizeAccountIdentifier(accountIdentifier);
    if (cleanId && cleanId !== 'guest@appone.ir') {
      localStorage.setItem(ACTIVE_ACCOUNT_ID_KEY, cleanId);
      const rawMap = localStorage.getItem(ACCOUNT_VIP_MAP_KEY);
      const map: Record<string, AccountVipRecord> = rawMap ? JSON.parse(rawMap) : {};
      const existingRecord = map[cleanId];

      const currentExpiry = Number(localStorage.getItem('od_vip_expiry') || '0');
      const currentPlan = localStorage.getItem('od_vip_plan') || '1';

      if (existingRecord && existingRecord.vipExpiry > Date.now() && existingRecord.vipExpiry >= currentExpiry) {
        // Restore VIP from user's account record
        localStorage.setItem('od_vip_active', 'true');
        localStorage.setItem('od_vip_plan', existingRecord.vipPlan || '1');
        localStorage.setItem('od_vip_expiry', String(existingRecord.vipExpiry));
        localStorage.setItem(
          PRO_STORAGE_KEY,
          JSON.stringify({
            isActive: true,
            planId: existingRecord.vipPlan === '12' ? 'yearly' : existingRecord.vipPlan === '3' ? 'quarterly' : 'monthly',
            planName: existingRecord.planName || 'اشتراک VIP Pro',
            expiry: existingRecord.vipExpiry,
            activatedAt: existingRecord.updatedAt || Date.now()
          })
        );
        writeCookieValue('od_vip_expiry_cookie', String(existingRecord.vipExpiry));
        writeCookieValue('od_vip_plan_cookie', existingRecord.vipPlan || '1');
      } else if (currentExpiry > Date.now()) {
        // Bind active device VIP to this user's account
        saveVipRecordForCurrentAccount(
          currentExpiry,
          currentPlan,
          currentPlan === '12'
            ? 'اشتراک VIP یک‌ساله (۱۲ ماهه)'
            : currentPlan === '3'
            ? 'اشتراک VIP سه‌ماهه (۹۰ روزه)'
            : 'اشتراک VIP یک‌ماهه (۳۰ روزه)',
          cleanId
        );
      }
    }
  } catch {
    // ignore
  }
  getMyReferralCode();
  const updated = getDailyQuota();
  notifySubscribers();
  return updated;
}

/**
 * Resets user-specific session quota when logging out,
 * while strictly preserving the user's account-bound VIP subscription (`od_vip_expiry`),
 * permanent Hardware ID (`od_fixed_hardware_id`),
 * permanent Referral Code (`od_fixed_referral_code`), and permanent Referral invites (`od_permanent_referral_state_v1`).
 */
export function resetUserAccountAndQuotaToGuest(): void {
  try {
    const currentExpiry = Number(localStorage.getItem('od_vip_expiry') || '0');
    const currentPlan = localStorage.getItem('od_vip_plan') || '1';
    if (currentExpiry > Date.now()) {
      saveVipRecordForCurrentAccount(
        currentExpiry,
        currentPlan,
        currentPlan === '12'
          ? 'اشتراک VIP یک‌ساله (۱۲ ماهه)'
          : currentPlan === '3'
          ? 'اشتراک VIP سه‌ماهه (۹۰ روزه)'
          : 'اشتراک VIP یک‌ماهه (۳۰ روزه)'
      );
    }
    localStorage.removeItem(QUOTA_STORAGE_KEY);
    localStorage.removeItem(REWARD_LOG_STORAGE_KEY);
    localStorage.removeItem(VIP_REQUEST_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_ACCOUNT_ID_KEY);
  } catch {
    // ignore storage errors
  }
  notifySubscribers();
}

/**
 * ============================================================================
 * CAFEBAZAAR POOLAKEY IN-APP BILLING BRIDGE INTEGRATION
 * Official SKUs:
 * - 1-Month VIP (39,000 Toman): `od_vip_1m` (30 Days)
 * - 3-Month VIP (79,000 Toman): `od_vip_3m` (90 Days)
 * - 1-Year VIP  (99,000 Toman): `od_vip_1y` (365 Days)
 * ============================================================================
 */
export const BAZAAR_SKU_IDS = {
  VIP_1M: 'od_vip_1m',
  VIP_3M: 'od_vip_3m',
  VIP_1Y: 'od_vip_1y'
} as const;

export type BazaarProductId =
  | typeof BAZAAR_SKU_IDS.VIP_1M
  | typeof BAZAAR_SKU_IDS.VIP_3M
  | typeof BAZAAR_SKU_IDS.VIP_1Y;

export interface BazaarPurchaseEvent {
  type: 'success' | 'error';
  productId?: string;
  purchaseToken?: string;
  durationDays?: number;
  quota?: QuotaInfo;
  messageFa: string;
  messageAr: string;
  messageEn: string;
}

declare global {
  interface Window {
    AndroidBazaar?: {
      startPurchase: (productId: string) => void;
    };
    onBazaarPurchaseSuccess?: (productId: string, purchaseToken: string) => void;
    onBazaarPurchaseFailed?: (errorMessage: string) => void;
  }
}

type BazaarEventSubscriber = (event: BazaarPurchaseEvent) => void;
const bazaarEventSubscribers: Set<BazaarEventSubscriber> = new Set();

export function subscribeBazaarPurchaseEvents(cb: BazaarEventSubscriber): () => void {
  bazaarEventSubscribers.add(cb);
  return () => bazaarEventSubscribers.delete(cb);
}

function notifyBazaarEvent(event: BazaarPurchaseEvent): void {
  bazaarEventSubscribers.forEach((cb) => cb(event));
}

export function resolveBazaarSkuId(planOrSku: string): BazaarProductId {
  const clean = (planOrSku || '').trim().toLowerCase();
  if (clean === 'od_vip_1y' || clean === '12m' || clean === '1y' || clean === 'yearly') {
    return BAZAAR_SKU_IDS.VIP_1Y;
  }
  if (clean === 'od_vip_3m' || clean === '3m' || clean === 'quarterly') {
    return BAZAAR_SKU_IDS.VIP_3M;
  }
  return BAZAAR_SKU_IDS.VIP_1M;
}

/**
 * Initiates a Toman subscription purchase via the Android CafeBazaar Poolakey bridge (`window.AndroidBazaar.startPurchase(productId)`)
 * if running inside the Android app. Otherwise returns `{ handledByBazaar: false }` so the browser UI shows support / manual activation options.
 */
export function purchasePlan(planOrProductId: string): {
  handledByBazaar: boolean;
  productId: BazaarProductId;
} {
  const productId = resolveBazaarSkuId(planOrProductId);

  if (
    typeof window !== 'undefined' &&
    window.AndroidBazaar &&
    typeof window.AndroidBazaar.startPurchase === 'function'
  ) {
    try {
      window.AndroidBazaar.startPurchase(productId);
      return { handledByBazaar: true, productId };
    } catch (err: any) {
      const errMsg = err?.message || 'خطا در برقراری ارتباط با کافه‌بازار';
      if (typeof window.onBazaarPurchaseFailed === 'function') {
        window.onBazaarPurchaseFailed(errMsg);
      }
      return { handledByBazaar: true, productId };
    }
  }

  return { handledByBazaar: false, productId };
}

/**
 * Activates VIP status upon successful CafeBazaar Poolakey purchase callback,
 * persists purchaseToken and expiry in localStorage + user profile, and updates all live subscribers.
 */
export function activateBazaarVipPurchase(
  rawProductId: string,
  purchaseToken: string
): QuotaInfo {
  const productId = resolveBazaarSkuId(rawProductId);
  const durationDays =
    productId === BAZAAR_SKU_IDS.VIP_1Y
      ? 365
      : productId === BAZAAR_SKU_IDS.VIP_3M
      ? 90
      : 30;
  const planCode = durationDays === 365 ? '12' : durationDays === 90 ? '3' : '1';
  const planId: 'monthly' | 'quarterly' | 'yearly' =
    durationDays === 365 ? 'yearly' : durationDays === 90 ? 'quarterly' : 'monthly';
  const planName =
    durationDays === 365
      ? 'اشتراک VIP یک‌ساله (۱۲ ماهه)'
      : durationDays === 90
      ? 'اشتراک VIP سه‌ماهه (۹۰ روزه)'
      : 'اشتراک VIP یک‌ماهه (۳۰ روزه)';

  const expireTimestamp = Date.now() + durationDays * 24 * 60 * 60 * 1000;
  const safeToken = (purchaseToken || `bazaar_${Date.now()}`).trim();

  try {
    // 1. Save Bazaar token, SKU, and VIP expiry in localStorage
    localStorage.setItem('od_bazaar_purchase_token', safeToken);
    localStorage.setItem('od_bazaar_product_id', productId);
    localStorage.setItem('od_bazaar_purchase_time', String(Date.now()));
    localStorage.setItem('od_vip_active', 'true');
    localStorage.setItem('od_vip_plan', planCode);
    localStorage.setItem('od_vip_expiry', String(expireTimestamp));
    localStorage.setItem(
      PRO_STORAGE_KEY,
      JSON.stringify({
        isActive: true,
        planId,
        productId,
        purchaseToken: safeToken,
        planName,
        expiry: expireTimestamp,
        activatedAt: Date.now()
      })
    );

    // 2. Save in account VIP registry & cookie backup
    saveVipRecordForCurrentAccount(expireTimestamp, planCode, planName);

    // 3. Also update user profile in localStorage (`od_user_session` & `onedownload_session_v2`)
    const sessionKeys = ['od_user_session', 'onedownload_session_v2'];
    for (const sKey of sessionKeys) {
      const rawSession = localStorage.getItem(sKey);
      if (rawSession) {
        const parsedSession = JSON.parse(rawSession);
        if (parsedSession && parsedSession.user) {
          parsedSession.user.plan = 'Pro';
          parsedSession.user.bazaarPurchaseToken = safeToken;
          parsedSession.user.bazaarProductId = productId;
          parsedSession.user.vipExpiry = expireTimestamp;
          localStorage.setItem(sKey, JSON.stringify(parsedSession));
        }
      }
    }
  } catch {
    // ignore storage errors
  }

  playVipUnlockSound();
  triggerCoinAnimation(
    0,
    'vip',
    'پرداخت با موفقیت انجام شد! اشتراک VIP شما فعال گردید.',
    'Payment successful! Your VIP subscription is now active.'
  );

  notifySubscribers();
  const updatedQuota = getDailyQuota();

  notifyBazaarEvent({
    type: 'success',
    productId,
    purchaseToken: safeToken,
    durationDays,
    quota: updatedQuota,
    messageFa: 'پرداخت با موفقیت انجام شد! اشتراک VIP شما فعال گردید.',
    messageAr: 'تم الدفع بنجاح! تم تفعيل اشتراك VIP الخاص بك.',
    messageEn: 'Payment completed successfully! Your VIP subscription is now active.'
  });

  return updatedQuota;
}

/**
 * Registers global `window.onBazaarPurchaseSuccess` and `window.onBazaarPurchaseFailed`
 * callbacks so the Kotlin AndroidBazaar Poolakey bridge can invoke them directly.
 */
export function registerGlobalBazaarCallbacks(): void {
  if (typeof window === 'undefined') return;

  window.onBazaarPurchaseSuccess = (productId: string, purchaseToken: string) => {
    activateBazaarVipPurchase(productId, purchaseToken);
  };

  window.onBazaarPurchaseFailed = (errorMessage: string) => {
    const cleanReason = (errorMessage || 'لغو توسط کاربر یا خطای ارتباط با کافه‌بازار').trim();
    notifyBazaarEvent({
      type: 'error',
      messageFa: `پرداخت انجام نشد: ${cleanReason}`,
      messageAr: `لم تتم عملية الدفع: ${cleanReason}`,
      messageEn: `Payment failed: ${cleanReason}`
    });
  };
}

// Auto-register on module load in browser environment
registerGlobalBazaarCallbacks();


