import React, { useState } from 'react';
import {
  X,
  Crown,
  Check,
  Sparkles,
  ShieldCheck,
  Zap,
  ArrowRight,
  CreditCard,
  CheckCircle2,
  Coins,
  Gift
} from 'lucide-react';
import { Language } from '../types';
import {
  activateProPlan,
  getCoinsBalance,
  getDailyQuota,
  QuotaInfo,
  redeemCoinsForQuotaOrPro
} from '../services/quotaService';
import { getOrCreateDeviceId } from '../services/deviceService';

interface ProUpgradeModalProps {
  language: Language;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedQuota: QuotaInfo, customMessage?: string) => void;
}

export const ProUpgradeModal: React.FC<ProUpgradeModalProps> = ({
  language,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'coins' | 'payment'>('coins');
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'quarterly' | 'lifetime'>('quarterly');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const quota = getDailyQuota();
  const coins = getCoinsBalance();
  const deviceId = getOrCreateDeviceId();
  const isFa = language === 'fa';

  if (!isOpen) return null;

  const plans = [
    {
      id: 'monthly' as const,
      title: isFa ? 'طرح ۱ ماهه VIP Pro' : '1 Month VIP Pro',
      price: isFa ? '۴۹,۰۰۰ تومان' : '$4.99 / mo',
      badge: isFa ? 'پایه' : 'Basic',
      description: isFa ? 'دانلود نامحدود روزانه به مدت ۳۰ روز' : 'Unlimited daily downloads for 30 days',
      popular: false
    },
    {
      id: 'quarterly' as const,
      title: isFa ? 'طرح ۳ ماهه اقتصادی' : '3 Months (Best Value)',
      price: isFa ? '۱۱۹,۰۰۰ تومان' : '$9.99 / 3 mo',
      badge: isFa ? '🔥 پرطرفدارترین' : '🔥 Most Popular',
      description: isFa ? 'تخفیف ویژه + اولویت پهنای باند توربو' : 'Special discount + Turbo priority',
      popular: true
    },
    {
      id: 'lifetime' as const,
      title: isFa ? 'مادام‌العمر Lifetime' : 'Lifetime Access',
      price: isFa ? '۲۹۹,۰۰۰ تومان' : '$24.99 once',
      badge: isFa ? '✨ دائمی' : '✨ Permanent',
      description: isFa ? 'یک‌بار پرداخت، برای همیشه نامحدود' : 'One-time payment, unlimited forever',
      popular: false
    }
  ];

  const coinPackages = [
    {
      id: 'extra_3_downloads' as const,
      cost: 30,
      title: isFa ? '+۳ سهمیه دانلود اضافه برای امروز' : '+3 Extra Downloads Today',
      desc: isFa ? 'افزایش فوری سقف دانلود رایگان امروز بدون نیاز به پرداخت' : 'Instantly add 3 extra downloads to your daily free limit',
      badge: isFa ? 'فوری' : 'Instant'
    },
    {
      id: 'pro_24h' as const,
      cost: 80,
      title: isFa ? 'اشتراک ۲۴ ساعته نامحدود VIP Pro' : '24-Hour Unlimited VIP Pro Pass',
      desc: isFa ? 'حذف کامل محدودیت دانلود به مدت ۱ شبانه‌روز کامل' : 'Unlock unlimited 4K downloads for 24 hours',
      badge: isFa ? 'محبوب' : 'Popular'
    },
    {
      id: 'pro_7d' as const,
      cost: 180,
      title: isFa ? 'اشتراک ۷ روزه نامحدود VIP Pro' : '7-Day Unlimited VIP Pro Pass',
      desc: isFa ? 'یک هفته کامل دانلود نامحدود با سکه‌های جمع‌آوری‌شده' : 'Full week of unlimited VIP Pro access using coins',
      badge: isFa ? 'ویژه' : 'Special'
    },
    {
      id: 'pro_30d' as const,
      cost: 350,
      title: isFa ? 'طرح ۱ ماهه کامل VIP Pro (با سکه)' : '1-Month Full VIP Pro Plan (Coins)',
      desc: isFa ? '۳۰ روز دانلود نامحدود ۴K و بدون واترمارک به صورت کاملاً رایگان با سکه' : '30 days of unlimited 4K downloads redeemed via Jet Coins',
      badge: isFa ? '🔥 ۱ ماهه طلایی' : '🔥 1-Month Gold'
    }
  ];

  const handleCheckout = () => {
    setErrorNotice(null);
    setIsProcessing(true);
    setTimeout(() => {
      const updated = activateProPlan(selectedPlan);
      setIsProcessing(false);
      setIsCompleted(true);
      setTimeout(() => {
        onSuccess(updated);
        setIsCompleted(false);
        onClose();
      }, 1500);
    }, 1200);
  };

  const handleRedeemCoins = (option: 'extra_3_downloads' | 'pro_24h' | 'pro_7d' | 'pro_30d') => {
    setErrorNotice(null);
    const result = redeemCoinsForQuotaOrPro(option);
    if (!result.success) {
      setErrorNotice(isFa ? result.messageFa : result.messageEn);
      return;
    }
    setIsCompleted(true);
    setTimeout(() => {
      onSuccess(result.quota, isFa ? result.messageFa : result.messageEn);
      setIsCompleted(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-lg rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-indigo-500/30 shadow-[0_25px_60px_-15px_rgba(79,70,229,0.35)] overflow-hidden my-6">
        {/* Glow header overlay */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-indigo-600/20 via-purple-600/10 to-transparent pointer-events-none" />

        {/* Modal Top Bar */}
        <div className="relative flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 shadow-lg shadow-amber-500/20 shrink-0">
              <Crown className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base text-white flex items-center gap-2 truncate">
                <span>{isFa ? 'مدیریت سهمیه و ارتقا به نسخه PRO' : 'Quota & VIP Pro Upgrade'}</span>
              </h3>
              <p className="text-[11px] text-slate-400 truncate">
                {quota.isPro
                  ? (isFa ? `وضعیت فعلی: ${quota.proPlanName || 'اشتراک VIP فعال'}` : `Current Status: ${quota.proPlanName || 'VIP Pro Active'}`)
                  : (isFa ? `وضعیت فعلی: کاربر عادی (${quota.remainingToday} از ${quota.maxDaily} دانلود باقی‌مانده)` : `Free Tier (${quota.remainingToday}/${quota.maxDaily} downloads left today)`)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-4 max-h-[78vh] overflow-y-auto">
          {/* Current Coin Wallet Summary */}
          <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-black text-white">
                  {isFa ? `موجودی کیف پول شما: ${coins} سکه` : `Your Wallet: ${coins} Jet Coins`}
                </div>
                <div className="text-[11px] text-slate-400">
                  {isFa ? 'امکان تبدیل مستقیم سکه به سهمیه دانلود یا اشتراک PRO' : 'Redeem coins for extra downloads or VIP Pro pass'}
                </div>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-xl text-[11px] font-black bg-amber-400 text-slate-950 shrink-0">
              {coins} 🪙
            </span>
          </div>

          {/* Mode Switcher Tabs: Redeem with Coins vs Direct Payment */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setActiveTab('coins');
                setErrorNotice(null);
              }}
              className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'coins'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>{isFa ? 'فعال‌سازی با سکه رایگان' : 'Redeem with Coins'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('payment');
                setErrorNotice(null);
              }}
              className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'payment'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>{isFa ? 'خرید اشتراک VIP' : 'Direct Subscription'}</span>
            </button>
          </div>

          {errorNotice && (
            <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-xs font-bold text-rose-200 text-center">
              {errorNotice}
            </div>
          )}

          {activeTab === 'coins' ? (
            /* Tab 1: Spend Collected Coins */
            <div className="space-y-2.5">
              {coinPackages.map((pkg) => {
                const canAfford = coins >= pkg.cost;
                return (
                  <div
                    key={pkg.id}
                    className="p-3.5 rounded-2xl bg-slate-800/50 border border-slate-700/70 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-xs sm:text-sm text-white truncate">{pkg.title}</h4>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {pkg.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">{pkg.desc}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRedeemCoins(pkg.id)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black shrink-0 flex items-center gap-1.5 transition-all active:translate-y-[2px] ${
                        canAfford
                          ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 btn-3d-amber'
                          : 'bg-slate-700/70 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      <Gift className="w-3.5 h-3.5" />
                      <span>{isFa ? `${pkg.cost} سکه` : `${pkg.cost} Coins`}</span>
                    </button>
                  </div>
                );
              })}

              <p className="text-[11px] text-slate-400 text-center pt-1">
                {isFa
                  ? 'نکته: از بخش «دریافت سکه رایگان» در صفحه اصلی می‌توانید با ورود روزانه، تماشای ویدیوی پیشنهادی یا دعوت از دوستان سکه رایگان جمع کنید.'
                  : 'Tip: Earn free coins on the home screen via Daily Check-in, watching a promo clip, or sharing the app.'}
              </p>
            </div>
          ) : (
            /* Tab 2: Direct In-App Payment Plans */
            <div className="space-y-3">
              <div className="space-y-2.5">
                {plans.map((p) => {
                  const isSelected = selectedPlan === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPlan(p.id)}
                      className={`relative p-3.5 rounded-2xl cursor-pointer transition-all border ${
                        isSelected
                          ? 'bg-indigo-950/40 border-indigo-500 shadow-lg shadow-indigo-500/20'
                          : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                              isSelected ? 'border-indigo-400 bg-indigo-600' : 'border-slate-500'
                            }`}
                          >
                            {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-extrabold text-xs sm:text-sm text-white">{p.title}</h4>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                                  p.popular
                                    ? 'bg-amber-400 text-slate-950 shadow-xs'
                                    : 'bg-slate-700 text-slate-300'
                                }`}
                              >
                                {p.badge}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">{p.description}</p>
                          </div>
                        </div>

                        <div className="text-left rtl:text-right shrink-0">
                          <span className="text-xs sm:text-sm font-black text-amber-300 font-mono">
                            {p.price}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleCheckout}
                disabled={isProcessing}
                className="w-full py-3.5 rounded-2xl text-xs sm:text-sm font-black text-white bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 btn-3d-primary flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>{isFa ? 'در حال اتصال به درگاه پرداخت و فعال‌سازی...' : 'Processing Payment & Activation...'}</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    <span>{isFa ? 'پرداخت درون‌برنامه‌ای و فعال‌سازی آنی' : 'In-App Checkout & Instant Activation'}</span>
                    <ArrowRight className={`w-4 h-4 ${isFa ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>
            </div>
          )}

          {isCompleted && (
            <div className="p-3.5 rounded-2xl bg-emerald-600 text-white flex items-center justify-center gap-2 font-bold text-xs sm:text-sm shadow-xl">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>
                {isFa ? 'عملیات با موفقیت انجام شد و سهمیه شما ارتقا یافت!' : 'Upgraded successfully!'}
              </span>
            </div>
          )}

          {/* Device ID binding guarantee */}
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>{isFa ? 'شناسه دستگاه:' : 'Device ID:'}</span>
            <span className="font-bold text-indigo-400">{deviceId}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
