import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Crown,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Wallet,
  ShieldCheck,
  AlertTriangle,
  Check,
  Copy,
  Cpu,
  KeyRound,
  Coins,
  Gift,
  Clock,
  Sparkles,
  Users
} from 'lucide-react';
import { Language, UserCountryCode } from '../types';
import { getDeviceProfile } from '../services/deviceService';
import {
  getCoinsBalance,
  getDailyQuota,
  getReferralInfo,
  getVipEligibilityState,
  QuotaInfo,
  redeemCoinsForQuotaOrPro,
  submitOneMonthVipRequest,
  subscribeQuotaAndCoins,
  verifyAndActivateVipCode
} from '../services/quotaService';

interface ProUpgradeModalProps {
  language: Language;
  userCountry?: UserCountryCode;
  isOpen: boolean;
  onClose: () => void;
  onOpenAuthReferral?: () => void;
  onSuccess: (updatedQuota: QuotaInfo, customMessage?: string) => void;
}

const USDT_BEP20_ADDRESS = '0x4bc774279E0a326cCe8664EF90b2B0f9805Be86D';

const toLocalDigits = (val: string | number, lang: Language): string => {
  if (lang === 'fa') {
    return String(val).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
  }
  if (lang === 'ar') {
    return String(val).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
  }
  return String(val);
};

const UsdtQrBox: React.FC<{ address: string }> = ({ address }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(
    address
  )}`;

  const fallbackMatrix = useMemo(() => {
    const grid = Array.from({ length: 21 }, () => Array(21).fill(false));
    const drawFinder = (r0: number, c0: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const border = r === 0 || r === 6 || c === 0 || c === 6;
          const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          grid[r0 + r][c0 + c] = border || inner;
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, 14);
    drawFinder(14, 0);
    for (let r = 0; r < 21; r++) {
      for (let c = 0; c < 21; c++) {
        if (!((r < 8 && c < 8) || (r < 8 && c >= 13) || (r >= 13 && c < 8))) {
          const code = address.charCodeAt((r * 21 + c) % address.length);
          grid[r][c] = (code + r * 7 + c * 13) % 3 === 0;
        }
      }
    }
    return grid;
  }, [address]);

  return (
    <div className="w-36 h-36 sm:w-40 sm:h-40 rounded-2xl bg-white p-2.5 shadow-lg border-2 border-emerald-400/60 flex items-center justify-center shrink-0 mx-auto">
      {imgFailed ? (
        <svg viewBox="0 0 21 21" className="w-full h-full" shapeRendering="crispEdges">
          {fallbackMatrix.map((row, rIdx) =>
            row.map((cell, cIdx) =>
              cell ? (
                <rect key={`${rIdx}-${cIdx}`} x={cIdx} y={rIdx} width={1} height={1} fill="#0f172a" />
              ) : null
            )
          )}
        </svg>
      ) : (
        <img
          src={qrUrl}
          alt="USDT BEP20 QR Code"
          className="w-full h-full object-contain rounded-lg"
          onError={() => setImgFailed(true)}
        />
      )}
    </div>
  );
};

export const ProUpgradeModal: React.FC<ProUpgradeModalProps> = ({
  language,
  userCountry,
  isOpen,
  onClose,
  onSuccess
}) => {
  const isFa = language === 'fa';
  const isAr = language === 'ar';
  const isRtl = isFa || isAr;

  // STRICT REQUIREMENT: Toman is ONLY available when language === 'fa'!
  // In Arabic ('ar') and English ('en'), Toman is 100% hidden/removed and ONLY USDT (BEP20) is shown.
  const showTomanOption = isFa;

  const deviceProfile = getDeviceProfile();
  const [quota, setQuota] = useState(() => getDailyQuota());
  const [coinsBalance, setCoinsBalance] = useState(() => getCoinsBalance());
  const [referralInfo, setReferralInfo] = useState(() => getReferralInfo());
  const [, setVipEligibility] = useState(() => getVipEligibilityState());

  const [currencyMode, setCurrencyMode] = useState<'toman' | 'usdt'>(() =>
    isFa && (!userCountry || userCountry === 'IR') ? 'toman' : 'usdt'
  );
  const [selectedPlanKey, setSelectedPlanKey] = useState<'1m' | '3m' | '12m'>('3m');
  const [copiedDeviceId, setCopiedDeviceId] = useState(false);
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!showTomanOption) {
      setCurrencyMode('usdt');
    } else if (!userCountry || userCountry === 'IR') {
      setCurrencyMode('toman');
    } else {
      setCurrencyMode('usdt');
    }
  }, [showTomanOption, userCountry, isOpen]);

  useEffect(() => {
    const unsub = subscribeQuotaAndCoins(() => {
      setQuota(getDailyQuota());
      setCoinsBalance(getCoinsBalance());
      setReferralInfo(getReferralInfo());
      setVipEligibility(getVipEligibilityState());
    });
    return () => unsub();
  }, []);

  if (!isOpen) return null;

  const activeCurrency: 'toman' | 'usdt' = showTomanOption ? currencyMode : 'usdt';

  const handleCopyDeviceId = async () => {
    try {
      await navigator.clipboard.writeText(deviceProfile.deviceId);
      setCopiedDeviceId(true);
      setTimeout(() => setCopiedDeviceId(false), 2200);
    } catch {
      // ignore
    }
  };

  const handleCopyWalletAddress = async () => {
    try {
      await navigator.clipboard.writeText(USDT_BEP20_ADDRESS);
      setCopiedWallet(true);
      setTimeout(() => setCopiedWallet(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleClaimFreeVipByCoinsOrReferrals = () => {
    setFeedback(null);
    const res = submitOneMonthVipRequest();
    setVipEligibility(res.state);
    const msg = isFa
      ? res.messageFa
      : isAr
      ? res.success
        ? '🎉 تهانينا! تم تفعيل اشتراك VIP لمدة شهر بنجاح!'
        : `تحتاج إلى ١٠٠ عملة (الرصيد: ${toLocalDigits(coinsBalance, 'ar')}) أو ٣ دعوات (${toLocalDigits(referralInfo.invitedCount, 'ar')}/٣) لتفعيل اشتراك VIP لمدة شهر.`
      : res.messageEn;

    setFeedback({
      type: res.success ? 'success' : 'error',
      text: msg
    });
    if (res.success && res.quota) {
      setTimeout(() => {
        onSuccess(res.quota!, msg);
      }, 1200);
    }
  };

  const handleRedeemExtraDownload = (option: 'extra_1_download' | 'extra_3_downloads') => {
    setFeedback(null);
    const res = redeemCoinsForQuotaOrPro(option);
    const msg = isFa
      ? res.messageFa
      : isAr
      ? res.success
        ? 'تم خصم ٥ عملات وإضافة +١ تحميل إضافي لحصة اليوم!'
        : `رصيد العملات غير كافٍ! تحتاج إلى ٥ عملات لكل تحميل إضافي (رصيدك: ${toLocalDigits(coinsBalance, 'ar')} عملة).`
      : res.messageEn;

    if (!res.success) {
      setFeedback({ type: 'error', text: msg });
      return;
    }
    setFeedback({ type: 'success', text: msg });
    setTimeout(() => {
      onSuccess(res.quota, msg);
    }, 1000);
  };

  const handleVerifyActivationCode = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = verifyAndActivateVipCode(activationCode, deviceProfile.deviceId);
    const msg = isFa
      ? res.messageFa
      : isAr
      ? res.messageAr
      : res.messageEn;

    if (!res.success) {
      setFeedback({ type: 'error', text: msg });
      return;
    }
    setActivationCode('');
    setFeedback({ type: 'success', text: msg });
    setTimeout(() => {
      onSuccess(res.quota, msg);
      onClose();
    }, 1400);
  };

  const coinPercent = Math.min(100, Math.round((coinsBalance / 100) * 100));
  const invitedProgress = Math.min(3, referralInfo.invitedCount);
  const canActivateFreeVip = coinsBalance >= 100 || referralInfo.invitedCount >= 3;

  const plans = [
    {
      key: '1m' as const,
      titleFa: 'اشتراک ۱ ماهه (۳۰ روزه)',
      titleAr: 'اشتراك شهر واحد (٣٠ يوم)',
      titleEn: '1-Month VIP (30 Days)',
      priceToman: '۴۹,۰۰۰ تومان',
      priceUsdt: '2 USDT ($2)',
      badgeFa: 'اقتصادی',
      badgeAr: 'أساسي',
      badgeEn: 'Starter'
    },
    {
      key: '3m' as const,
      titleFa: 'اشتراک ۳ ماهه (۹۰ روزه)',
      titleAr: 'اشتراك ٣ أشهر (٩٠ يوم)',
      titleEn: '3-Month VIP (90 Days)',
      priceToman: '۱۱۹,۰۰۰ تومان',
      priceUsdt: '4 USDT ($4)',
      badgeFa: 'پرفروش‌ترین 🔥',
      badgeAr: 'الأكثر طلباً 🔥',
      badgeEn: 'Most Popular 🔥',
      popular: true
    },
    {
      key: '12m' as const,
      titleFa: 'اشتراک ۱ ساله (۱۲ ماهه)',
      titleAr: 'اشتراك سنة كاملة (١٢ شهر)',
      titleEn: '1-Year VIP (12 Months)',
      priceToman: '۳۴۹,۰۰۰ تومان',
      priceUsdt: '10 USDT ($10)',
      badgeFa: 'بالاترین صرفه‌جویی 💎',
      badgeAr: 'أفضل توفير 💎',
      badgeEn: 'Best Value 💎'
    }
  ];

  const selectedPlan = plans.find((p) => p.key === selectedPlanKey) || plans[1];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-lg rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-indigo-500/30 shadow-[0_25px_60px_-15px_rgba(79,70,229,0.35)] overflow-hidden my-auto">
        {/* Top Header */}
        <div className="relative flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white transition-colors shrink-0 flex items-center gap-1.5 text-xs font-black cursor-pointer"
              title={isFa ? 'بازگشت' : isAr ? 'رجوع' : 'Back'}
            >
              <ArrowRight className={`w-4 h-4 ${isRtl ? '' : 'rotate-180'}`} />
              <span>{isFa ? 'بازگشت' : isAr ? 'رجوع' : 'Back'}</span>
            </button>
            <div className="p-2 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 shadow-lg shadow-amber-500/20 shrink-0">
              <Crown className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-sm sm:text-base text-white truncate">
                {isFa
                  ? 'خرید و فعال‌سازی اشتراک VIP'
                  : isAr
                  ? 'شراء وتفعيل اشتراك VIP'
                  : 'VIP Subscription & Activation'}
              </h3>
              <p className="text-[11px] text-slate-400 truncate">
                {quota.isPro
                  ? isFa
                    ? `${quota.proPlanName || 'اشتراک VIP'} • ${toLocalDigits(quota.remainingProDays || 30, 'fa')} روز باقی‌مانده`
                    : isAr
                    ? `اشتراك VIP مفعل • ${toLocalDigits(quota.remainingProDays || 30, 'ar')} يوم متبقي`
                    : `VIP Active • ${quota.remainingProDays || 30} days remaining`
                  : isFa
                  ? `کاربر عادی • سهمیه رایگان امروز: ${toLocalDigits(quota.remainingToday, 'fa')} از ${toLocalDigits(quota.maxDaily, 'fa')} دانلود`
                  : isAr
                  ? `الباقة المجانية • المتبقي اليوم: ${toLocalDigits(quota.remainingToday, 'ar')} من ${toLocalDigits(quota.maxDaily, 'ar')}`
                  : `Free Tier • ${quota.remainingToday}/${quota.maxDaily} left today`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
            title={isFa ? 'بستن' : isAr ? 'إغلاق' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-3.5 max-h-[83vh] overflow-y-auto">
          {feedback && (
            <div
              className={`p-3 rounded-2xl border text-xs font-extrabold flex items-center gap-2 animate-fade-in ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                  : feedback.type === 'info'
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                  : 'bg-rose-500/20 border-rose-500/40 text-rose-200'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{feedback.text}</span>
            </div>
          )}

          {/* VIP Plans & Payment Gateway Box */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-indigo-500/40 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-black text-xs sm:text-sm text-white">
                    {isFa
                      ? 'تعرفه اشتراک‌های VIP (دانلود نامحدود 4K)'
                      : isAr
                      ? 'باقات اشتراك VIP (تحميل 4K غير محدود)'
                      : 'VIP Subscription Plans (Unlimited 4K)'}
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    {activeCurrency === 'toman'
                      ? 'پرداخت ریالی/تومانی ویژه کاربران ایران'
                      : isFa
                      ? 'درگاه تتر (USDT - BEP20) ویژه کاربران غیرایرانی و بین‌المللی'
                      : isAr
                      ? 'الدفع بالعملة الرقمية USDT (شبكة BNB Smart Chain - BEP20)'
                      : 'Crypto Payment via USDT (BNB Smart Chain - BEP20)'}
                  </p>
                </div>
              </div>

              {/* Currency Switcher: Toman button is ONLY rendered when language === 'fa' */}
              {showTomanOption ? (
                <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-black">
                  <button
                    type="button"
                    onClick={() => setCurrencyMode('toman')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      activeCurrency === 'toman'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    🇮🇷 تومان
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrencyMode('usdt')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      activeCurrency === 'usdt'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    dir="ltr"
                  >
                    💎 USDT (BEP20)
                  </button>
                </div>
              ) : (
                <div
                  className="px-3 py-1 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-black"
                  dir="ltr"
                >
                  💎 USDT (BEP20)
                </div>
              )}
            </div>

            {/* 3 Pricing Cards */}
            <div className="grid grid-cols-3 gap-2">
              {plans.map((plan) => {
                const isSelected = selectedPlanKey === plan.key;
                return (
                  <button
                    key={plan.key}
                    type="button"
                    onClick={() => setSelectedPlanKey(plan.key)}
                    className={`relative p-2.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-between gap-1 cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600/25 border-amber-400 ring-2 ring-amber-400/30 shadow-lg'
                        : 'bg-slate-950/90 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${
                        plan.popular
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {isFa ? plan.badgeFa : isAr ? plan.badgeAr : plan.badgeEn}
                    </span>
                    <div className="text-[11px] font-black text-white mt-1">
                      {isFa ? plan.titleFa : isAr ? plan.titleAr : plan.titleEn}
                    </div>
                    <div
                      dir={activeCurrency === 'usdt' ? 'ltr' : 'rtl'}
                      className={`text-xs sm:text-sm font-black mt-0.5 ${
                        activeCurrency === 'usdt'
                          ? 'text-emerald-400 font-mono'
                          : 'text-amber-400'
                      }`}
                    >
                      {activeCurrency === 'toman' ? plan.priceToman : plan.priceUsdt}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* USDT Gateway vs Toman Gateway */}
            {activeCurrency === 'usdt' ? (
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/40 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <div>
                      <h5 className="text-xs font-black text-emerald-300">
                        {isFa ? (
                          <>
                            درگاه واریز تتر (USDT) — مبلغ:{' '}
                            <span dir="ltr" className="inline-block font-mono">
                              {selectedPlan.priceUsdt}
                            </span>
                          </>
                        ) : isAr ? (
                          <>
                            بوابة دفع USDT (BEP20) — المبلغ:{' '}
                            <span dir="ltr" className="inline-block font-mono">
                              {selectedPlan.priceUsdt}
                            </span>
                          </>
                        ) : (
                          `USDT (BEP20) Payment Gateway — Amount: ${selectedPlan.priceUsdt}`
                        )}
                      </h5>
                      <p className="text-[10px] text-slate-400">
                        {isFa ? 'شبکه: ' : isAr ? 'الشبكة: ' : 'Network: '}
                        <strong className="text-amber-400" dir="ltr">
                          BNB Smart Chain (BEP20)
                        </strong>
                      </p>
                    </div>
                  </div>
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                </div>

                <UsdtQrBox address={USDT_BEP20_ADDRESS} />

                <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-start gap-2 text-[11px] font-bold text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    {isFa
                      ? 'هشدار بسیار مهم: واریز تتر (USDT) را فقط و فقط بر بستر شبکه BNB Smart Chain (BEP20) به آدرس زیر انجام دهید.'
                      : isAr
                      ? 'تنبيه هام جداً: يرجى إرسال عملة USDT حصرياً عبر شبكة BNB Smart Chain (BEP20) إلى العنوان أدناه.'
                      : 'IMPORTANT: Send USDT strictly via the BNB Smart Chain (BEP20) network to the address below.'}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-400 text-center">
                    {isFa
                      ? 'آدرس کیف پول تتر (USDT - BEP20):'
                      : isAr
                      ? 'عنوان محفظة USDT (شبكة BEP20):'
                      : 'USDT Wallet Address (BNB Smart Chain - BEP20):'}
                  </div>
                  <div
                    dir="ltr"
                    className="p-2.5 rounded-xl bg-slate-900 border border-emerald-500/30 text-[11px] font-mono font-black text-emerald-300 text-center break-all select-all"
                  >
                    {USDT_BEP20_ADDRESS}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyWalletAddress}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-2 btn-3d-emerald cursor-pointer"
                  >
                    {copiedWallet ? (
                      <Check className="w-4 h-4 text-white shrink-0" />
                    ) : (
                      <Copy className="w-4 h-4 text-white shrink-0" />
                    )}
                    <span>
                      {copiedWallet
                        ? isFa
                          ? 'آدرس کیف پول BEP20 کپی شد ✓'
                          : isAr
                          ? 'تم نسخ عنوان المحفظة بنجاح ✓'
                          : 'Wallet Address Copied ✓'
                        : isFa
                        ? 'کپی آدرس کیف پول (USDT - BEP20)'
                        : isAr
                        ? 'نسخ عنوان المحفظة (USDT - BEP20)'
                        : 'Copy Wallet Address (BEP20)'}
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-2">
                <div className="flex items-center justify-between font-black text-amber-300">
                  <span>{`طرح انتخابی: ${selectedPlan.titleFa}`}</span>
                  <span>{selectedPlan.priceToman}</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  شناسه سخت‌افزاری دستگاه خود را کپی کرده و پس از دریافت کد اختصاصی، آن را در کادر «کد فعال‌سازی اشتراک VIP» در پایین وارد نمایید تا اشتراک شما به صورت خودکار فعال شود.
                </p>
              </div>
            )}
          </div>

          {/* Hardware ID & Algorithmic VIP Activation Code Box */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-amber-500/40 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                  <Cpu className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h4 className="font-black text-xs sm:text-sm text-white">
                      {isFa
                        ? 'شناسه اختصاصی سخت‌افزاری دستگاه (Hardware ID)'
                        : isAr
                        ? 'المعرف الفريد للجهاز (Hardware ID)'
                        : 'Device Hardware ID'}
                    </h4>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                        quota.isPro
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {quota.isPro
                        ? isFa
                          ? `${toLocalDigits(quota.remainingProDays || 30, 'fa')} روز اشتراک باقی‌مانده`
                          : isAr
                          ? `${toLocalDigits(quota.remainingProDays || 30, 'ar')} يوم متبقي`
                          : `${quota.remainingProDays || 30} Days Left`
                        : isFa
                        ? 'اشتراک غیرفعال'
                        : isAr
                        ? 'غير مفعل'
                        : 'No Active VIP'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {isFa
                      ? 'پشتیبانی هوشمند از کدهای اشتراک ۱ ماهه، ۳ ماهه و ۱۲ ماهه بر اساس الگوریتم شناسه دستگاه'
                      : isAr
                      ? 'يدعم أكواد التفعيل لباقات شهر، ٣ أشهر، وسنة كاملة تلقائياً'
                      : 'Algorithmic detection of 1-Month, 3-Month, and 12-Month VIP plans'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCopyDeviceId}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-black btn-3d-secondary flex items-center gap-1 shrink-0 cursor-pointer"
              >
                {copiedDeviceId ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>
                  {copiedDeviceId
                    ? isFa
                      ? 'کپی شد'
                      : isAr
                      ? 'تم النسخ'
                      : 'Copied'
                    : isFa
                    ? 'کپی شناسه'
                    : isAr
                    ? 'نسخ المعرف'
                    : 'Copy ID'}
                </span>
              </button>
            </div>

            <div
              dir="ltr"
              className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center font-black text-xs text-indigo-400 tracking-wider select-all"
            >
              {deviceProfile.deviceId}
            </div>

            <form
              onSubmit={handleVerifyActivationCode}
              className="space-y-2.5 pt-2 border-t border-slate-800"
            >
              <label className="block text-xs font-black text-amber-300 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 shrink-0" />
                <span>
                  {isFa
                    ? 'کد فعال‌سازی اشتراک VIP'
                    : isAr
                    ? 'كود تفعيل اشتراك VIP'
                    : 'VIP Subscription Activation Code'}
                </span>
              </label>
              <input
                type="text"
                dir="ltr"
                value={activationCode}
                onChange={(e) => setActivationCode(e.target.value)}
                placeholder={
                  isFa
                    ? 'کد فعال‌سازی اشتراک VIP را وارد کنید...'
                    : isAr
                    ? 'أدخل كود تفعيل اشتراك VIP هنا...'
                    : 'Enter VIP Activation Code...'
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-amber-500/40 text-center text-sm font-black tracking-widest text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 input-3d"
              />
              <button
                type="submit"
                className="w-full py-3 px-4 rounded-2xl text-xs sm:text-sm font-black text-slate-950 bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-400 btn-3d-amber flex items-center justify-center gap-2 cursor-pointer"
              >
                <Crown className="w-4 h-4 fill-slate-950 shrink-0" />
                <span>
                  {isFa
                    ? 'بررسی الگوریتم کد و فعال‌سازی اشتراک VIP'
                    : isAr
                    ? 'التحقق من الكود وتفعيل اشتراك VIP'
                    : 'Verify Code & Activate VIP Subscription'}
                </span>
              </button>
            </form>
          </div>

          {/* Coin Wallet & Extra Download Box */}
          <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/80 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-black text-white">
                    {isFa
                      ? `موجودی کیف پول شما: ${toLocalDigits(coinsBalance, 'fa')} سکه`
                      : isAr
                      ? `رصيد محفظتك: ${toLocalDigits(coinsBalance, 'ar')} عملة`
                      : `Your Coin Balance: ${coinsBalance} Coins`}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {isFa
                      ? '۳ دانلود رایگان در روز • هر دانلود اضافه = کسر ۵ سکه • ورود روزانه = +۲ سکه'
                      : isAr
                      ? '٣ تنزيلات مجانية يومياً • كل تنزيل إضافي = ٥ عملات • الدخول اليومي = +٢ عملة'
                      : '3 Free Downloads/Day • Extra Download = 5 Coins • Daily Check-in = +2 Coins'}
                  </div>
                </div>
              </div>
              <span className="px-3 py-1 rounded-xl text-xs font-black bg-amber-400 text-slate-950 shrink-0">
                {`${toLocalDigits(coinsBalance, language)} 🪙`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleRedeemExtraDownload('extra_1_download')}
                className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs btn-3d-primary flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Gift className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isFa
                    ? '+۱ دانلود اضافه (کسر ۵ سکه)'
                    : isAr
                    ? '+١ تحميل إضافي (٥ عملات)'
                    : '+1 Extra Download (5 Coins)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setFeedback({
                    type: 'info',
                    text: isFa
                      ? 'در حال به‌روزرسانی — بخش تماشای تبلیغ (+۵ سکه) در حال به‌روزرسانی است.'
                      : isAr
                      ? 'قيد التحديث — ميزة مشاهدة الإعلان (+٥ عملات) قيد التحديث حالياً.'
                      : 'Updating — Watch Ad (+5 Coins) is currently being updated.'
                  })
                }
                className="py-2.5 px-3 rounded-xl bg-slate-900/90 border border-slate-700 text-slate-400 font-black text-xs flex items-center justify-center gap-1.5 opacity-80 cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  {isFa
                    ? 'تماشای تبلیغ (در حال به‌روزرسانی)'
                    : isAr
                    ? 'مشاهدة إعلان (قيد التحديث)'
                    : 'Watch Ad (Updating)'}
                </span>
              </button>
            </div>
          </div>

          {/* 100 Coins or 3 Referrals Free VIP Activation Box */}
          <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/35 space-y-2.5">
            <h4 className="text-xs font-black text-indigo-200 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {isFa
                  ? 'فعال‌سازی اشتراک VIP با ۱۰۰ سکه یا ۳ دعوت موفق:'
                  : isAr
                  ? 'تفعيل اشتراك VIP مجاناً عبر ١٠٠ عملة أو ٣ دعوات:'
                  : 'VIP Activation via 100 Coins or 3 Referrals:'}
              </span>
            </h4>

            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <div className="text-[10px] text-slate-400 font-bold mb-0.5">
                  {isFa
                    ? 'موجودی سکه (هدف: ۱۰۰ سکه)'
                    : isAr
                    ? 'العملات (الهدف: ١٠٠ عملة)'
                    : 'Coins (Target: 100)'}
                </div>
                <div className="font-black text-amber-400">
                  {isFa
                    ? `${toLocalDigits(coinsBalance, 'fa')} / ۱۰۰ (${toLocalDigits(coinPercent, 'fa')}٪)`
                    : isAr
                    ? `${toLocalDigits(coinsBalance, 'ar')} / ١٠٠ (${toLocalDigits(coinPercent, 'ar')}٪)`
                    : `${coinsBalance} / 100 Coins`}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <div className="text-[10px] text-slate-400 font-bold mb-0.5">
                  {isFa
                    ? 'دعوت دوستان (هدف: ۳ نفر)'
                    : isAr
                    ? 'دعوة الأصدقاء (الهدف: ٣)'
                    : 'Referrals (Target: 3)'}
                </div>
                <div className="font-black text-indigo-400 flex items-center justify-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>
                    {isFa
                      ? `${toLocalDigits(invitedProgress, 'fa')} / ۳`
                      : isAr
                      ? `${toLocalDigits(invitedProgress, 'ar')} / ٣`
                      : `${invitedProgress} / 3 Invites`}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClaimFreeVipByCoinsOrReferrals}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                canActivateFreeVip
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white btn-3d-emerald'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              <Crown className="w-4 h-4 shrink-0" />
              <span>
                {canActivateFreeVip
                  ? isFa
                    ? 'فعال‌سازی فوری اشتراک VIP (کسر ۱۰۰ سکه / ۳ دعوت)'
                    : isAr
                    ? 'تفعيل اشتراك VIP الآن (١٠٠ عملة / ٣ دعوات)'
                    : 'Activate VIP Now (100 Coins / 3 Referrals)'
                  : isFa
                  ? 'با رسیدن موجودی به ۱۰۰ سکه یا ۳ دعوت موفق، اشتراک VIP فعال می‌شود'
                  : isAr
                  ? 'عند الوصول إلى ١٠٠ عملة أو ٣ دعوات يتم تفعيل VIP فوراً'
                  : 'Reach 100 Coins or 3 Referrals to activate VIP'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
