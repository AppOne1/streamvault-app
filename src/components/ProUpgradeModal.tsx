import React, { useState } from 'react';
import { X, Crown, Check, Sparkles, ShieldCheck, Zap, ArrowRight, CreditCard, CheckCircle2 } from 'lucide-react';
import { Language } from '../types';
import { activateProPlan, getDailyQuota, QuotaInfo } from '../services/quotaService';
import { getOrCreateDeviceId } from '../services/deviceService';

interface ProUpgradeModalProps {
  language: Language;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedQuota: QuotaInfo) => void;
}

export const ProUpgradeModal: React.FC<ProUpgradeModalProps> = ({
  language,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'quarterly' | 'lifetime'>('quarterly');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const quota = getDailyQuota();
  const deviceId = getOrCreateDeviceId();

  if (!isOpen) return null;

  const plans = [
    {
      id: 'monthly' as const,
      title: language === 'fa' ? 'طرح ۱ ماهه' : '1 Month Plan',
      price: language === 'fa' ? '۴۹,۰۰۰ تومان' : '$4.99 / mo',
      badge: language === 'fa' ? 'پایه' : 'Basic',
      description: language === 'fa' ? 'دانلود نامحدود روزانه به مدت ۳۰ روز' : 'Unlimited daily downloads for 30 days',
      popular: false
    },
    {
      id: 'quarterly' as const,
      title: language === 'fa' ? 'طرح ۳ ماهه اقتصادی' : '3 Months (Best Value)',
      price: language === 'fa' ? '۱۱۹,۰۰۰ تومان' : '$9.99 / 3 mo',
      badge: language === 'fa' ? '🔥 پرطرفدارترین' : '🔥 Most Popular',
      description: language === 'fa' ? 'تخفیف ویژه + اولویت پهنای باند توربو' : 'Special discount + Turbo priority',
      popular: true
    },
    {
      id: 'lifetime' as const,
      title: language === 'fa' ? 'مادام‌العمر Lifetime' : 'Lifetime Access',
      price: language === 'fa' ? '۲۹۹,۰۰۰ تومان' : '$24.99 once',
      badge: language === 'fa' ? '✨ دائمی' : '✨ Permanent',
      description: language === 'fa' ? 'یک‌بار پرداخت، برای همیشه نامحدود' : 'One-time payment, unlimited forever',
      popular: false
    }
  ];

  const handleCheckout = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const updated = activateProPlan(selectedPlan);
      setIsProcessing(false);
      setIsCompleted(true);
      setTimeout(() => {
        onSuccess(updated);
        setIsCompleted(false);
        onClose();
      }, 1800);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-lg rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-indigo-500/30 shadow-[0_25px_60px_-15px_rgba(79,70,229,0.35)] overflow-hidden my-6">
        
        {/* Glow header overlay */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-indigo-600/20 via-purple-600/10 to-transparent pointer-events-none" />

        {/* Modal Top Bar */}
        <div className="relative flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 shadow-lg shadow-amber-500/20">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-white flex items-center gap-2">
                <span>{language === 'fa' ? 'ارتقا به اشتراک نامحدود VIP Pro' : 'Upgrade to VIP Pro'}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 uppercase tracking-wider">
                  PRO 4K
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {language === 'fa'
                  ? 'رفع سقف دانلود ۳ فیلم در روز و دسترسی به سرعت حداکثری'
                  : 'Bypass 3 daily download limit with unlimited high-speed streams'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5">
          {/* Daily Quota Exhausted Notice */}
          {!quota.isPro && quota.remainingToday <= 0 && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-xs text-amber-200">
              <Zap className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <span className="font-bold">
                  {language === 'fa' ? 'سقف ۳ دانلود رایگان امروز به پایان رسید!' : 'Daily 3 free downloads reached!'}
                </span>
                <p className="text-[11px] text-amber-300/80 mt-0.5">
                  {language === 'fa'
                    ? 'برای ادامه دانلود بی‌وقفه فیلم‌ها و صوت‌ها، یکی از طرح‌های زیر را انتخاب نمایید.'
                    : 'Choose a plan below to continue downloading immediately.'}
                </p>
              </div>
            </div>
          )}

          {/* VIP Benefits 3D Pill Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-2.5 text-slate-200">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-[11px]">{language === 'fa' ? 'دانلود نامحدود روزانه' : 'Unlimited Downloads'}</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-2.5 text-slate-200">
              <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-[11px]">{language === 'fa' ? 'کیفیت 4K و صوت 320k' : '4K Streams & 320k'}</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-2.5 text-slate-200">
              <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <Zap className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-[11px]">{language === 'fa' ? 'سرورهای بدون فیلتر و تحریم' : 'No-Block Fast Servers'}</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-2.5 text-slate-200">
              <div className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-[11px]">{language === 'fa' ? 'ثبت روی شناسه دستگاه' : 'Locked to Device ID'}</span>
            </div>
          </div>

          {/* Plans Selection List */}
          <div className="space-y-2.5">
            {plans.map((p) => {
              const isSelected = selectedPlan === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPlan(p.id)}
                  className={`relative p-4 rounded-2xl cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-indigo-950/40 border-indigo-500 shadow-lg shadow-indigo-500/20 translate-y-[-1px]'
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
                          <h4 className="font-extrabold text-sm text-white">{p.title}</h4>
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
                        <p className="text-xs text-slate-400 mt-0.5">{p.description}</p>
                      </div>
                    </div>

                    <div className="text-left rtl:text-right shrink-0">
                      <span className="text-sm sm:text-base font-black text-amber-300 font-mono">
                        {p.price}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Device ID binding guarantee */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>{language === 'fa' ? 'شناسه دستگاه شما:' : 'Your Device ID:'}</span>
            <span className="font-bold text-indigo-400">{deviceId}</span>
          </div>

          {/* Action Checkout Button */}
          {isCompleted ? (
            <div className="p-4 rounded-2xl bg-emerald-600 text-white flex items-center justify-center gap-2 font-bold text-sm shadow-xl shadow-emerald-600/30 animate-pulse">
              <CheckCircle2 className="w-5 h-5" />
              <span>
                {language === 'fa'
                  ? 'اشتراک VIP Pro با موفقیت فعال شد! سقف دانلود نامحدود شد.'
                  : 'VIP Pro activated successfully! Unlimited downloads unlocked.'}
              </span>
            </div>
          ) : (
            <button
              onClick={handleCheckout}
              disabled={isProcessing}
              className="w-full py-3.5 rounded-2xl text-sm font-extrabold text-white bg-gradient-to-r from-indigo-600 via-indigo-500 to-amber-500 hover:from-indigo-500 hover:to-amber-400 shadow-xl shadow-indigo-600/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{language === 'fa' ? 'در حال اتصال به درگاه پرداخت و فعال‌سازی...' : 'Processing Payment & Activation...'}</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  <span>{language === 'fa' ? 'پرداخت امن و فعال‌سازی آنی' : 'Secure Checkout & Instant Activation'}</span>
                  <ArrowRight className={`w-4 h-4 ${language === 'fa' ? 'rotate-180' : ''}`} />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
