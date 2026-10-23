import React, { useEffect, useState } from 'react';
import { Coins, Crown, Sparkles } from 'lucide-react';
import { CoinAnimationEvent, subscribeCoinAnimation } from '../services/quotaService';
import { Language } from '../types';

interface CoinRewardAnimationProps {
  language: Language;
}

interface Particle {
  id: number;
  offsetX: number;
  delayMs: number;
  durationMs: number;
  scale: number;
}

export const CoinRewardAnimation: React.FC<CoinRewardAnimationProps> = ({ language }) => {
  const [activeEvent, setActiveEvent] = useState<CoinAnimationEvent | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const isFa = language === 'fa';

  useEffect(() => {
    const unsub = subscribeCoinAnimation((evt) => {
      setActiveEvent(evt);
      // Generate 10 golden 3D flying coin particles leaping upward toward the top header
      const count = evt.type === 'vip' ? 14 : 9;
      const generated: Particle[] = Array.from({ length: count }).map((_, idx) => ({
        id: idx,
        offsetX: (idx - count / 2) * 28 + (Math.random() * 18 - 9),
        delayMs: idx * 55,
        durationMs: 950 + Math.round(Math.random() * 350),
        scale: 0.85 + Math.random() * 0.45
      }));
      setParticles(generated);

      const timer = setTimeout(() => {
        setActiveEvent(null);
        setParticles([]);
      }, 2400);

      return () => clearTimeout(timer);
    });

    return () => unsub();
  }, []);

  if (!activeEvent) return null;

  return (
    <div className="fixed inset-0 z-[70] pointer-events-none overflow-hidden flex items-center justify-center">
      <style>{`
        @keyframes coinFlyUpToHeader {
          0% {
            opacity: 0;
            transform: translate3d(0, 140px, 0) scale(0.4) rotateY(0deg);
          }
          20% {
            opacity: 1;
            transform: translate3d(var(--tx, 0px), 20px, 0) scale(var(--sc, 1)) rotateY(180deg);
          }
          65% {
            opacity: 1;
            transform: translate3d(calc(var(--tx, 0px) * 0.5), -160px, 0) scale(calc(var(--sc, 1) * 1.1)) rotateY(540deg);
          }
          100% {
            opacity: 0;
            transform: translate3d(0px, -360px, 0) scale(0.35) rotateY(720deg);
          }
        }
        @keyframes coinBannerPop {
          0% {
            opacity: 0;
            transform: translateY(35px) scale(0.82);
          }
          20% {
            opacity: 1;
            transform: translateY(0px) scale(1.05);
          }
          35% {
            transform: translateY(0px) scale(1);
          }
          85% {
            opacity: 1;
            transform: translateY(-10px) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-35px) scale(0.92);
          }
        }
      `}</style>

      {/* Flying 3D Golden Coins Leaping Upward */}
      <div className="relative w-full h-full flex items-center justify-center">
        {particles.map((p) => (
          <div
            key={`${activeEvent.id}-${p.id}`}
            style={
              {
                '--tx': `${p.offsetX}px`,
                '--sc': p.scale,
                animation: `coinFlyUpToHeader ${p.durationMs}ms cubic-bezier(0.22, 1, 0.36, 1) ${p.delayMs}ms forwards`
              } as React.CSSProperties
            }
            className="absolute w-10 h-10 rounded-full bg-gradient-to-tr from-amber-600 via-yellow-400 to-amber-200 border-2 border-white shadow-[0_6px_20px_rgba(245,158,11,0.75)] flex items-center justify-center text-slate-950 font-black text-xs"
          >
            <Coins className="w-5 h-5 text-slate-950 drop-shadow" />
          </div>
        ))}

        {/* Center Floating 3D Reward Badge */}
        <div
          style={{
            animation: 'coinBannerPop 2.2s cubic-bezier(0.22, 1, 0.36, 1) forwards'
          }}
          className={`px-6 py-3.5 rounded-3xl border-2 shadow-2xl flex items-center gap-3 ${
            activeEvent.type === 'vip'
              ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 border-white text-slate-950 shadow-amber-500/50'
              : activeEvent.type === 'earn'
              ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 border-amber-300 text-white shadow-indigo-600/50'
              : 'bg-slate-900/95 border-amber-400/70 text-amber-300 shadow-black/60'
          }`}
        >
          <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center shadow-md shrink-0">
            {activeEvent.type === 'vip' ? (
              <Crown className="w-6 h-6 fill-slate-950" />
            ) : (
              <Coins className="w-6 h-6" />
            )}
          </div>
          <div>
            <div className="text-xs sm:text-sm font-black tracking-tight flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>
                {isFa
                  ? activeEvent.labelFa
                  : language === 'ar'
                  ? activeEvent.coinsDelta > 0
                    ? `+${activeEvent.coinsDelta} عملة تمت إضافتها!`
                    : activeEvent.type === 'vip'
                    ? '🎉 تم تفعيل اشتراك VIP بنجاح!'
                    : activeEvent.labelEn
                  : activeEvent.labelEn}
              </span>
            </div>
            <div className="text-[11px] font-bold opacity-90">
              {isFa
                ? 'موجودی سکه در هدر برنامه به‌روزرسانی شد'
                : language === 'ar'
                ? 'تم تحديث رصيد العملات في أعلى التطبيق'
                : 'Header coin balance updated'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
