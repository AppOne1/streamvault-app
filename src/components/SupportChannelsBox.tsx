import React, { useState } from 'react';
import {
  Headphones,
  Copy,
  Check,
  ExternalLink,
  Mail,
  Send,
  MessageCircle
} from 'lucide-react';
import { Language } from '../types';

interface SupportChannelsBoxProps {
  language: Language;
  isTomanAccount?: boolean;
  darkVariant?: boolean;
}

interface ChannelItem {
  id: string;
  labelFa: string;
  labelAr: string;
  labelEn: string;
  handle: string;
  href?: string;
  badgeColor: string;
  persianOnly?: boolean;
}

const SUPPORT_CHANNELS: ChannelItem[] = [
  {
    id: 'eitaa',
    labelFa: 'کانال و پشتیبانی ایتا (Eitaa)',
    labelAr: 'إيتا (Eitaa)',
    labelEn: 'Eitaa',
    handle: '@alavi_2025',
    href: 'https://eitaa.com/alavi_2025',
    badgeColor: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
    persianOnly: true
  },
  {
    id: 'rubika',
    labelFa: 'پشتیبانی روبیکا (Rubika)',
    labelAr: 'روبيكا (Rubika)',
    labelEn: 'Rubika',
    handle: '@alavi_by',
    href: 'https://rubika.ir/alavi_by',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    persianOnly: true
  },
  {
    id: 'telegram',
    labelFa: 'پشتیبانی تلگرام (Telegram)',
    labelAr: 'الدعم عبر تيليجرام (Telegram)',
    labelEn: 'Telegram Support',
    handle: '@shalavinia',
    href: 'https://t.me/shalavinia',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    persianOnly: false
  },
  {
    id: 'whatsapp',
    labelFa: 'پشتیبانی واتساپ (WhatsApp)',
    labelAr: 'الدعم عبر واتساب (WhatsApp)',
    labelEn: 'WhatsApp Support',
    handle: '@alavipoco',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    persianOnly: false
  },
  {
    id: 'email',
    labelFa: 'ایمیل رسمی پشتیبانی',
    labelAr: 'البريد الإلكتروني الرسمي للدعم',
    labelEn: 'Official Support Email',
    handle: 'alavipoco@gmail.com',
    href: 'mailto:alavipoco@gmail.com',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    persianOnly: false
  }
];

export const SupportChannelsBox: React.FC<SupportChannelsBoxProps> = ({
  language,
  isTomanAccount = false,
  darkVariant = true
}) => {
  const isFa = language === 'fa';
  const isAr = language === 'ar';
  // Show Eitaa & Rubika for Persian language OR Iranian/Toman account; hide them completely for non-Persian international users
  const showIranianPlatforms = isFa || isTomanAccount;

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const visibleChannels = SUPPORT_CHANNELS.filter((ch) =>
    ch.persianOnly ? showIranianPlatforms : true
  );

  const handleCopy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        // ignore
      }
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2200);
  };

  return (
    <div
      className={`p-4 rounded-2xl border space-y-3 ${
        darkVariant
          ? 'bg-slate-900 border-indigo-500/35 text-white'
          : 'bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 border-indigo-500/30 text-white card-3d'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
          <Headphones className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-black text-xs sm:text-sm text-white">
            {isFa
              ? 'پشتیبانی و ارتباط با مدیریت'
              : isAr
              ? 'الدعم الفني والتواصل مع الإدارة'
              : 'Official Support & Contact Management'}
          </h4>
          <p className="text-[11px] text-slate-400">
            {isFa
              ? 'دریافت کد فعال‌سازی VIP، راهنمایی خرید و ارتباط مستقیم با تیم پشتیبانی'
              : isAr
              ? 'للحصول على كود تفعيل VIP والدعم المباشر عبر القنوات الرسمية'
              : 'Get VIP activation codes, billing assistance & direct official support'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {visibleChannels.map((ch) => {
          const isCopied = copiedId === ch.id;
          const label = isFa ? ch.labelFa : isAr ? ch.labelAr : ch.labelEn;

          return (
            <div
              key={ch.id}
              className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`p-1.5 rounded-lg border text-xs shrink-0 ${ch.badgeColor}`}
                >
                  {ch.id === 'email' ? (
                    <Mail className="w-3.5 h-3.5" />
                  ) : ch.id === 'whatsapp' ? (
                    <MessageCircle className="w-3.5 h-3.5" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-black text-slate-200 truncate">
                    {label}
                  </div>
                  <div
                    dir="ltr"
                    className="text-xs font-mono font-black text-amber-400 select-all truncate"
                  >
                    {ch.handle}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 ms-auto">
                {ch.href && (
                  <a
                    href={ch.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-600/25 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40 text-[11px] font-black flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>
                      {isFa ? 'باز کردن' : isAr ? 'فتح' : 'Open'}
                    </span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => handleCopy(ch.id, ch.handle)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-black flex items-center gap-1 transition-colors cursor-pointer"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">
                        {isFa ? 'کپی شد ✓' : isAr ? 'تم النسخ ✓' : 'Copied ✓'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {isFa ? 'کپی شناسه' : isAr ? 'نسخ المعرف' : 'Copy ID'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
