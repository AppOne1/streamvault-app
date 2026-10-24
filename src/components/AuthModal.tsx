import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  User,
  Mail,
  Lock,
  Camera,
  CheckCircle2,
  Coins,
  Crown,
  Users,
  RefreshCw,
  KeyRound,
  ShieldCheck,
  LogOut,
  ArrowRight,
  Globe,
  UserCheck
} from 'lucide-react';
import { Language, UserCountryCode, UserSession } from '../types';
import {
  getCoinsBalance,
  getDailyQuota,
  getReferralInfo,
  ReferralInfo,
  submitReferralCodeOrInvite,
  subscribeQuotaAndCoins,
  syncReferralFromCloud
} from '../services/quotaService';
import {
  getLocalizedGuestName,
  isDefaultGuestName,
  setLockedAccountCurrency
} from '../services/storageService';
import { ODLogo } from './ODLogo';

interface AuthModalProps {
  language: Language;
  isOpen: boolean;
  session: UserSession;
  onClose: () => void;
  onUpdateSession: (session: UserSession) => void;
  onOpenUpgrade: () => void;
  onSelectLanguage?: (lang: Language) => void;
  onAuthSuccess?: () => void;
  onLogout?: (keepModalOpen?: boolean) => void;
}

interface MathChallenge {
  questionFa: string;
  questionAr: string;
  questionEn: string;
  answer: number;
}

const toFaDigits = (val: string | number): string =>
  String(val).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

const toArDigits = (val: string | number): string =>
  String(val).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

const toLocalDigits = (val: string | number, lang: Language): string => {
  if (lang === 'fa') return toFaDigits(val);
  if (lang === 'ar') return toArDigits(val);
  return String(val);
};

function createMathChallenge(): MathChallenge {
  const isMultiply = Math.random() > 0.5;
  if (isMultiply) {
    const a = Math.floor(Math.random() * 5) + 2;
    const b = Math.floor(Math.random() * 4) + 2;
    return {
      questionFa: `${toFaDigits(a)} × ${toFaDigits(b)} = ؟`,
      questionAr: `${toArDigits(a)} × ${toArDigits(b)} = ؟`,
      questionEn: `${a} × ${b} = ?`,
      answer: a * b
    };
  }
  const a = Math.floor(Math.random() * 9) + 2;
  const b = Math.floor(Math.random() * 8) + 2;
  return {
    questionFa: `${toFaDigits(a)} + ${toFaDigits(b)} = ؟`,
    questionAr: `${toArDigits(a)} + ${toArDigits(b)} = ؟`,
    questionEn: `${a} + ${b} = ?`,
    answer: a + b
  };
}

export const AuthModal: React.FC<AuthModalProps> = ({
  language,
  isOpen,
  session,
  onClose,
  onUpdateSession,
  onOpenUpgrade,
  onSelectLanguage,
  onAuthSuccess,
  onLogout
}) => {
  const isFa = language === 'fa';
  const isAr = language === 'ar';
  const isRtl = isFa || isAr;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Guest / Unauthenticated mode: 'register' | 'login' | 'forgot'
  const [guestMode, setGuestMode] = useState<'register' | 'login' | 'forgot'>('register');

  // Logged-in Personal Profile sub-tab: 'info' | 'password'
  // (Referral input box is strictly removed from Personal Profile and only shown on Registration page)
  const [profileTab, setProfileTab] = useState<'info' | 'password'>('info');

  const [name, setName] = useState(() =>
    isDefaultGuestName(session.user.name)
      ? getLocalizedGuestName(language)
      : session.user.name
  );
  const [email, setEmail] = useState(
    session.user.email === 'guest@appone.ir' ? '' : (session.user.email || '')
  );
  const [country, setCountry] = useState<UserCountryCode>(
    session.user.country || (language === 'fa' ? 'IR' : language === 'ar' ? 'IQ' : 'INT')
  );
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(session.user.avatarUrl);

  // Referral code input ONLY on the Registration screen
  const [registerReferralCode, setRegisterReferralCode] = useState('');
  const [referralInfo, setReferralInfo] = useState<ReferralInfo>(() => getReferralInfo());

  // Live Coins & Quota state
  const [coinsBalance, setCoinsBalance] = useState<number>(() => getCoinsBalance());
  const [quota, setQuota] = useState(() => getDailyQuota());

  // Math Security Captcha (Strictly ONLY on Registration / Login screen)
  const [captcha, setCaptcha] = useState<MathChallenge>(() => createMathChallenge());
  const [captchaInput, setCaptchaInput] = useState('');

  // Status feedback
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName((prevName) => {
        if (isDefaultGuestName(prevName) && isDefaultGuestName(session.user.name)) {
          return getLocalizedGuestName(language);
        }
        return isDefaultGuestName(session.user.name)
          ? getLocalizedGuestName(language)
          : session.user.name;
      });
      const cleanEmail =
        session.user.email === 'guest@appone.ir' ? '' : (session.user.email || '');
      setEmail(cleanEmail);
      setCountry(
        session.user.country || (language === 'fa' ? 'IR' : language === 'ar' ? 'IQ' : 'INT')
      );
      setAvatarUrl(session.user.avatarUrl);
      setReferralInfo(getReferralInfo());
      setCoinsBalance(getCoinsBalance());
      setQuota(getDailyQuota());
      setCaptcha(createMathChallenge());
      setCaptchaInput('');
      setStatusMessage(null);
      syncReferralFromCloud().then(() => {
        setReferralInfo(getReferralInfo());
        setQuota(getDailyQuota());
      });
    }
  }, [isOpen, session, language]);

  useEffect(() => {
    const unsub = subscribeQuotaAndCoins(() => {
      setReferralInfo(getReferralInfo());
      setCoinsBalance(getCoinsBalance());
      setQuota(getDailyQuota());
    });
    return () => unsub();
  }, []);

  if (!isOpen) return null;

  const handleLanguageSwitch = (newLang: Language) => {
    if (onSelectLanguage) {
      onSelectLanguage(newLang);
    }
    if (isDefaultGuestName(name)) {
      setName(getLocalizedGuestName(newLang));
    }
    if (!session.isLoggedIn) {
      setCountry(newLang === 'fa' ? 'IR' : newLang === 'ar' ? 'IQ' : 'INT');
    }
  };

  const handleContinueAsGuest = () => {
    const defaultCountry: UserCountryCode =
      country || (language === 'fa' ? 'IR' : language === 'ar' ? 'IQ' : 'INT');

    onLogout?.(false);
    onUpdateSession({
      isLoggedIn: false,
      user: {
        id: `guest-${Date.now().toString(36)}`,
        name: getLocalizedGuestName(language),
        email: '',
        passwordHash: undefined,
        avatarUrl: '',
        country: defaultCountry,
        plan: 'Free',
        quotaUsedMb: 0,
        quotaMaxMb: 1024
      }
    });
    onClose();
  };

  const normalizeDigits = (str: string): string =>
    str
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .trim();

  const verifyMathCaptcha = (): boolean => {
    const parsed = parseInt(normalizeDigits(captchaInput), 10);
    if (isNaN(parsed) || parsed !== captcha.answer) {
      setStatusMessage({
        type: 'error',
        text: isFa
          ? 'پاسخ کلمه امنیتی ریاضی نادرست است! لطفاً حاصل صحیح را وارد کنید.'
          : isAr
          ? 'إجابة السؤال الرياضي غير صحيحة! يرجى إدخال الناتج الصحيح.'
          : 'Incorrect security math answer! Please solve the math question.'
      });
      setCaptcha(createMathChallenge());
      setCaptchaInput('');
      return false;
    }
    return true;
  };

  // Compress uploaded profile picture onto a 160x160 canvas for fast local storage
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 160;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setAvatarUrl(dataUrl);
          onUpdateSession({
            ...session,
            user: {
              ...session.user,
              avatarUrl: dataUrl
            }
          });
          setStatusMessage({
            type: 'success',
            text: isFa
              ? 'عکس پروفایل شما با موفقیت تنظیم و ذخیره شد!'
              : isAr
              ? 'تم تحديث صورة الملف الشخصي بنجاح!'
              : 'Profile photo updated!'
          });
        }
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const isValidEmailOrPhone = (raw: string): boolean => {
    const cleaned = normalizeDigits(raw).replace(/[\s-]/g, '');
    if (!cleaned) return false;
    if (cleaned.includes('@') && cleaned.includes('.')) return true;
    return /^(\+?\d{8,15}|09\d{9})$/.test(cleaned);
  };

  // 1. Simple Mandatory Registration / Login Handler (Supports Email OR Mobile Phone Number)
  const handleGuestAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const cleanIdentifier = normalizeDigits(email.trim());
    const cleanPass = password.trim();

    if (!isValidEmailOrPhone(cleanIdentifier)) {
      setStatusMessage({
        type: 'error',
        text: isFa
          ? 'لطفاً یک آدرس ایمیل یا شماره موبایل معتبر وارد نمایید.'
          : isAr
          ? 'يرجى إدخال بريد إلكتروني أو رقم هاتف صحيح.'
          : 'Please enter a valid email address or mobile phone number.'
      });
      return;
    }

    if (cleanPass.length < 4) {
      setStatusMessage({
        type: 'error',
        text: isFa
          ? 'رمز عبور باید حداقل ۴ کاراکتر باشد.'
          : isAr
          ? 'يجب أن تتكون كلمة المرور من ٤ أحرف على الأقل.'
          : 'Password must be at least 4 characters.'
      });
      return;
    }

    if (!verifyMathCaptcha()) return;

    if (guestMode === 'login') {
      if (
        session.user.email &&
        session.user.passwordHash &&
        session.user.email.toLowerCase() === cleanIdentifier.toLowerCase() &&
        session.user.passwordHash !== cleanPass
      ) {
        setStatusMessage({
          type: 'error',
          text: isFa
            ? 'رمز عبور واردشده نادرست است! در صورت فراموشی، گزینه «فراموشی رمز عبور» را بزنید.'
            : isAr
            ? 'كلمة المرور غير صحيحة! استخدم خيار استعادة كلمة المرور إذا لزم الأمر.'
            : 'Incorrect password! Use Forgot Password if needed.'
        });
        return;
      }
    }

    // Lock account currency type permanently at registration/login based on selected country / initial language
    const effectiveCountry: UserCountryCode =
      guestMode === 'register'
        ? country
        : session.user.country || (language === 'fa' ? 'IR' : country);
    setLockedAccountCurrency(effectiveCountry === 'IR' || language === 'fa' ? 'toman' : 'usdt');

    // If registering and user entered a referral code, process it now (syncs to cloud)
    if (guestMode === 'register' && registerReferralCode.trim().length >= 3) {
      submitReferralCodeOrInvite(registerReferralCode.trim(), cleanIdentifier);
    }

    const fallbackName = cleanIdentifier.includes('@')
      ? cleanIdentifier.split('@')[0]
      : cleanIdentifier;
    const displayName =
      (!isDefaultGuestName(name) && name.trim()) ||
      fallbackName ||
      getLocalizedGuestName(language);

    onUpdateSession({
      isLoggedIn: true,
      user: {
        ...session.user,
        id: `user-${Date.now()}`,
        name: displayName,
        email: cleanIdentifier,
        country: effectiveCountry,
        passwordHash: cleanPass,
        avatarUrl,
        plan: quota.isPro ? 'VIP Pro' : 'Free'
      }
    });

    setPassword('');
    setRegisterReferralCode('');
    setCaptcha(createMathChallenge());
    setCaptchaInput('');
    setStatusMessage(null);

    // Immediately enter the main app dashboard and trigger localized Welcome Toast
    onAuthSuccess?.();
    onClose();
  };

  // 2. Simple Forgot Password Handler
  const handleForgotPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const cleanIdentifier = normalizeDigits(email.trim());
    const cleanNewPass = newPassword.trim();

    if (!isValidEmailOrPhone(cleanIdentifier)) {
      setStatusMessage({
        type: 'error',
        text: isFa
          ? 'لطفاً ایمیل یا شماره موبایل حساب خود را وارد نمایید.'
          : isAr
          ? 'يرجى إدخال البريد الإلكتروني أو رقم الهاتف الخاص بحسابك.'
          : 'Please enter your account email or mobile number.'
      });
      return;
    }

    if (cleanNewPass.length < 4) {
      setStatusMessage({
        type: 'error',
        text: isFa
          ? 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد.'
          : isAr
          ? 'يجب أن تتكون كلمة المرور الجديدة من ٤ أحرف على الأقل.'
          : 'New password must be at least 4 characters.'
      });
      return;
    }

    onUpdateSession({
      ...session,
      isLoggedIn: true,
      user: {
        ...session.user,
        email: cleanIdentifier,
        name:
          (!isDefaultGuestName(name) && name.trim()) ||
          (cleanIdentifier.includes('@') ? cleanIdentifier.split('@')[0] : cleanIdentifier),
        passwordHash: cleanNewPass
      }
    });

    setNewPassword('');
    setGuestMode('login');
    setStatusMessage(null);

    // Immediately enter the main app dashboard and trigger localized Welcome Toast
    onAuthSuccess?.();
    onClose();
  };

  // 3. Logged-in Personal Profile Save Info (No Math Captcha here — only in Registration/Login!)
  const handleSaveProfileInfo = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const cleanName =
      name.trim() || getLocalizedGuestName(language);
    const cleanIdentifier = normalizeDigits(email.trim());

    if (!isValidEmailOrPhone(cleanIdentifier)) {
      setStatusMessage({
        type: 'error',
        text: isFa
          ? 'لطفاً یک آدرس ایمیل یا شماره موبایل معتبر وارد کنید.'
          : isAr
          ? 'يرجى إدخال بريد إلكتروني أو رقم هاتف صحيح.'
          : 'Please enter a valid email address or mobile number.'
      });
      return;
    }

    onUpdateSession({
      ...session,
      isLoggedIn: true,
      user: {
        ...session.user,
        name: cleanName,
        email: cleanIdentifier,
        country,
        avatarUrl,
        plan: quota.isPro ? 'VIP Pro' : 'Free'
      }
    });

    setStatusMessage({
      type: 'success',
      text: isFa
        ? 'اطلاعات پروفایل شخصی شما با موفقیت ذخیره و به‌روزرسانی شد!'
        : isAr
        ? 'تم حفظ وتحديث بيانات الملف الشخصي بنجاح!'
        : 'Personal profile details saved successfully!'
    });
  };

  // 4. Logged-in Personal Profile Change Password
  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (session.user.passwordHash && currentPassword && currentPassword !== session.user.passwordHash) {
      setStatusMessage({
        type: 'error',
        text: isFa
          ? 'رمز عبور فعلی نادرست است!'
          : isAr
          ? 'كلمة المرور الحالية غير صحيحة!'
          : 'Current password is incorrect!'
      });
      return;
    }

    if (newPassword.trim().length < 4) {
      setStatusMessage({
        type: 'error',
        text: isFa
          ? 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد.'
          : isAr
          ? 'يجب أن تتكون كلمة المرور الجديدة من ٤ أحرف على الأقل.'
          : 'New password must be at least 4 characters.'
      });
      return;
    }

    onUpdateSession({
      ...session,
      isLoggedIn: true,
      user: {
        ...session.user,
        passwordHash: newPassword.trim()
      }
    });

    setCurrentPassword('');
    setNewPassword('');
    setStatusMessage({
      type: 'success',
      text: isFa
        ? 'رمز عبور جدید شما با موفقیت ثبت شد!'
        : isAr
        ? 'تم تحديث كلمة المرور الجديدة بنجاح!'
        : 'Password updated successfully!'
    });
  };

  const handleSignOut = () => {
    const defaultCountry: UserCountryCode =
      language === 'fa' ? 'IR' : language === 'ar' ? 'IQ' : 'INT';
    const guestName = getLocalizedGuestName(language);

    setName(guestName);
    setEmail('');
    setPassword('');
    setCurrentPassword('');
    setNewPassword('');
    setAvatarUrl(undefined);
    setRegisterReferralCode('');
    setCaptcha(createMathChallenge());
    setCaptchaInput('');
    setCountry(defaultCountry);
    setCoinsBalance(0);

    onLogout?.(true);

    onUpdateSession({
      isLoggedIn: false,
      user: {
        id: `guest-${Date.now().toString(36)}`,
        name: guestName,
        email: '',
        passwordHash: undefined,
        avatarUrl: '',
        country: defaultCountry,
        plan: 'Free',
        quotaUsedMb: 0,
        quotaMaxMb: 1024
      }
    });
    setGuestMode('login');
    setStatusMessage({
      type: 'success',
      text: isFa
        ? 'از حساب کاربری خارج شدید. تمام اطلاعات نشست قبلی پاکسازی شد.'
        : isAr
        ? 'تم تسجيل الخروج بنجاح ومسح بيانات الجلسة السابقة.'
        : 'Signed out successfully. Previous session data cleared.'
    });
  };

  const invitedProgress = Math.min(3, referralInfo.invitedCount);

  const renderCountryOptions = () => {
    if (isAr) {
      return (
        <>
          <option value="IR">🇮🇷 إيران (الدفع بالتومان الإيراني)</option>
          <option value="IQ">🇮🇶 العراق (الدفع بـ USDT BEP20)</option>
          <option value="AE">🇦🇪 الإمارات (الدفع بـ USDT BEP20)</option>
          <option value="SA">🇸🇦 السعودية (الدفع بـ USDT BEP20)</option>
          <option value="GCC">🇰🇼 دول الخليج (الدفع بـ USDT BEP20)</option>
          <option value="INT">🌐 دولي / خارج إيران (الدفع بـ USDT BEP20)</option>
        </>
      );
    }
    if (isFa) {
      return (
        <>
          <option value="IR">🇮🇷 ایران (تعرفه تومانی داخل کشور)</option>
          <option value="IQ">🇮🇶 عراق (کاربران خارج از کشور)</option>
          <option value="AE">🇦🇪 امارات (کاربران خارج از کشور)</option>
          <option value="SA">🇸🇦 عربستان (کاربران خارج از کشور)</option>
          <option value="GCC">🇰🇼 کشورهای خلیج فارس</option>
          <option value="INT">🌐 بین‌المللی / خارج از ایران</option>
        </>
      );
    }
    return (
      <>
        <option value="IR">🇮🇷 Iran (Iranian Toman)</option>
        <option value="IQ">🇮🇶 Iraq (USDT BEP20)</option>
        <option value="AE">🇦🇪 UAE (USDT BEP20)</option>
        <option value="SA">🇸🇦 Saudi Arabia (USDT BEP20)</option>
        <option value="GCC">🇰🇼 GCC Countries (USDT BEP20)</option>
        <option value="INT">🌐 International (USDT BEP20)</option>
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 card-3d overflow-hidden my-auto">
        {/* Prominent Language Switcher Bar at Top of Auth Screen: English 🇬🇧 | العربية 🇮🇶 | فارسی 🇮🇷 */}
        <div className="px-4 py-2.5 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-black text-indigo-300 shrink-0">
            <Globe className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              {isFa ? 'انتخاب زبان:' : isAr ? 'اختر اللغة:' : 'Language:'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 flex-1 max-w-[270px]" dir="ltr">
            <button
              type="button"
              onClick={() => handleLanguageSwitch('en')}
              className={`py-1.5 px-2 rounded-xl text-[11px] font-black transition-all cursor-pointer ${
                language === 'en'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30 ring-1 ring-indigo-400'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              English 🇬🇧
            </button>
            <button
              type="button"
              onClick={() => handleLanguageSwitch('ar')}
              className={`py-1.5 px-2 rounded-xl text-[11px] font-black transition-all cursor-pointer ${
                language === 'ar'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30 ring-1 ring-indigo-400'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              العربية 🇮🇶
            </button>
            <button
              type="button"
              onClick={() => handleLanguageSwitch('fa')}
              className={`py-1.5 px-2 rounded-xl text-[11px] font-black transition-all cursor-pointer ${
                language === 'fa'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30 ring-1 ring-indigo-400'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              فارسی 🇮🇷
            </button>
          </div>
        </div>

        {/* Top Header with 3D "OD" Logo & Active Back Button */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-indigo-600 hover:text-white transition-colors shrink-0 cursor-pointer"
              title={isFa ? 'بازگشت' : isAr ? 'رجوع' : 'Back'}
            >
              <ArrowRight className={`w-4 h-4 ${isRtl ? '' : 'rotate-180'}`} />
            </button>
            <ODLogo className="w-9 h-9" />
            <div className="min-w-0">
              <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white text-3d truncate">
                {session.isLoggedIn
                  ? isFa
                    ? 'پروفایل شخصی من'
                    : isAr
                    ? 'ملفي الشخصي'
                    : 'My Personal Profile'
                  : guestMode === 'register'
                  ? isFa
                    ? 'ثبت‌نام سریع در وان دانلود'
                    : isAr
                    ? 'إنشاء حساب سريع في وان داونلود'
                    : 'Quick Registration'
                  : guestMode === 'login'
                  ? isFa
                    ? 'ورود به حساب کاربری'
                    : isAr
                    ? 'تسجيل الدخول'
                    : 'Sign In to Account'
                  : isFa
                  ? 'بازیابی رمز عبور'
                  : isAr
                  ? 'استعادة كلمة المرور'
                  : 'Password Recovery'}
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {session.isLoggedIn
                  ? isFa
                    ? 'مشاهده و ویرایش مشخصات، عکس پروفایل، سکه و وضعیت VIP'
                    : isAr
                    ? 'إدارة الحساب والصورة والعملات وحالة VIP'
                    : 'Manage profile, photo, coins & VIP status'
                  : isFa
                  ? 'ثبت‌نام و ورود آنی با ایمیل یا شماره موبایل (بدون نیاز به سرویس گوگل)'
                  : isAr
                  ? 'سجّل الدخول بالبريد الإلكتروني أو رقم الهاتف فوراً'
                  : 'Fast sign in with Email or Mobile Number'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3.5 max-h-[80vh] overflow-y-auto">
          {statusMessage && (
            <div
              className={`p-2.5 rounded-xl border text-xs font-extrabold flex items-center gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-300'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* =========================================================================
              VIEW A: SIMPLE MANDATORY REGISTRATION / LOGIN / FORGOT PASSWORD (!isLoggedIn)
             ========================================================================= */}
          {!session.isLoggedIn ? (
            <div className="space-y-3">
              {/* Mode Switcher Tabs: Register / Login / Forgot Password */}
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setGuestMode('register');
                    setStatusMessage(null);
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] font-black transition-all cursor-pointer ${
                    guestMode === 'register'
                      ? 'bg-indigo-600 text-white btn-3d-primary'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {isFa ? 'ثبت‌نام جدید' : isAr ? 'حساب جديد' : 'Sign Up'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGuestMode('login');
                    setStatusMessage(null);
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] font-black transition-all cursor-pointer ${
                    guestMode === 'login'
                      ? 'bg-indigo-600 text-white btn-3d-primary'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {isFa ? 'ورود به حساب' : isAr ? 'تسجيل الدخول' : 'Sign In'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGuestMode('forgot');
                    setStatusMessage(null);
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] font-black transition-all cursor-pointer ${
                    guestMode === 'forgot'
                      ? 'bg-indigo-600 text-white btn-3d-primary'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {isFa ? 'فراموشی رمز' : isAr ? 'نسيت الرمز' : 'Forgot Pass'}
                </button>
              </div>

              {guestMode === 'forgot' ? (
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-black text-slate-600 dark:text-slate-300 mb-1">
                      {isFa
                        ? 'ایمیل یا شماره موبایل ثبت‌شده:'
                        : isAr
                        ? 'البريد الإلكتروني أو رقم الهاتف المسجل:'
                        : 'Registered Email or Mobile Number:'}
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        dir="ltr"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={isFa ? '0912... / email@example.com' : 'email@example.com / +98...'}
                        className="w-full pr-9 pl-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 input-3d"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-600 dark:text-slate-300 mb-1">
                      {isFa ? 'رمز عبور جدید:' : isAr ? 'كلمة المرور الجديدة:' : 'New Password:'}
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="password"
                        dir="ltr"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full pr-9 pl-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 input-3d"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 btn-3d-primary cursor-pointer"
                  >
                    {isFa
                      ? 'بازنشانی رمز عبور و ورود به برنامه'
                      : isAr
                      ? 'إعادة تعيين كلمة المرور والدخول'
                      : 'Reset Password & Sign In'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleGuestAuthSubmit} className="space-y-2.5">
                  {guestMode === 'register' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-black text-slate-600 dark:text-slate-300 mb-1">
                          {isFa
                            ? 'نام نمایشی (اختیاری):'
                            : isAr
                            ? 'الاسم (اختياري):'
                            : 'Display Name:'}
                        </label>
                        <div className="relative">
                          <User className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={getLocalizedGuestName(language)}
                            className="w-full pr-9 pl-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 input-3d"
                          />
                        </div>
                      </div>

                      {/* Country / Nationality Selector for Smart Payment Gateway */}
                      <div>
                        <label className="block text-[11px] font-black text-indigo-600 dark:text-indigo-300 mb-1 flex items-center gap-1">
                          <Globe className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {isFa
                              ? 'کشور / منطقه کاربری:'
                              : isAr
                              ? 'البلد / الجنسية (طريقة الدفع):'
                              : 'Country / Region:'}
                          </span>
                        </label>
                        <select
                          value={country}
                          onChange={(e) => setCountry(e.target.value as UserCountryCode)}
                          className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-indigo-400/50 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 input-3d"
                        >
                          {renderCountryOptions()}
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-black text-slate-600 dark:text-slate-300 mb-1">
                      {isFa
                        ? 'ایمیل یا شماره موبایل (برای فعال‌سازی دانلود):'
                        : isAr
                        ? 'البريد الإلكتروني أو رقم الهاتف (مطلوب للتحميل):'
                        : 'Email or Mobile Number (Required):'}
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        dir="ltr"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={isFa ? '09123456789 یا email@example.com' : 'email@example.com or +98912...'}
                        className="w-full pr-9 pl-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 input-3d"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-600 dark:text-slate-300 mb-1">
                      {isFa ? 'رمز عبور:' : isAr ? 'كلمة المرور:' : 'Password:'}
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="password"
                        dir="ltr"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full pr-9 pl-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 input-3d"
                      />
                    </div>
                  </div>

                  {/* Referral Code Input Box — STRICTLY ONLY IN REGISTRATION SCREEN */}
                  {guestMode === 'register' && (
                    <div>
                      <label className="block text-[11px] font-black text-indigo-600 dark:text-indigo-300 mb-1">
                        {isFa
                          ? 'کد معرف دوستان (فقط در زمان ثبت‌نام - اختیاری):'
                          : isAr
                          ? 'كود الدعوة (عند التسجيل فقط - اختياري):'
                          : 'Friend Referral Code (Registration Only - Optional):'}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={registerReferralCode}
                        onChange={(e) => setRegisterReferralCode(e.target.value.toUpperCase())}
                        placeholder="OD-XXXXXXXX"
                        className="w-full px-3 py-2 rounded-xl bg-indigo-50/50 dark:bg-slate-950 border border-indigo-300 dark:border-indigo-800 text-xs font-black text-center tracking-wider text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 input-3d"
                      />
                    </div>
                  )}

                  {/* Math Security Captcha — STRICTLY ONLY IN REGISTRATION / LOGIN SCREEN */}
                  <div className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-black text-slate-700 dark:text-slate-200">
                      <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span>
                        {isFa
                          ? 'کلمه امنیتی ریاضی:'
                          : isAr
                          ? 'سؤال الأمان الرياضي:'
                          : 'Security Math:'}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-indigo-600/15 text-indigo-600 dark:text-indigo-300 font-black">
                        {isFa
                          ? captcha.questionFa
                          : isAr
                          ? captcha.questionAr
                          : captcha.questionEn}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        required
                        value={captchaInput}
                        onChange={(e) => setCaptchaInput(e.target.value)}
                        placeholder={isFa ? 'پاسخ' : isAr ? 'الناتج' : 'Ans'}
                        className="w-16 px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-center text-xs font-black text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCaptcha(createMathChallenge());
                          setCaptchaInput('');
                        }}
                        className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                        title={isFa ? 'سوال جدید' : isAr ? 'سؤال جديد' : 'Refresh'}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 btn-3d-primary cursor-pointer"
                  >
                    {guestMode === 'register'
                      ? isFa
                        ? 'ثبت‌نام و فعال‌سازی دسترسی دانلود'
                        : isAr
                        ? 'إنشاء الحساب وتفعيل التحميل'
                        : 'Register & Unlock Downloads'
                      : isFa
                      ? 'ورود به حساب کاربری'
                      : isAr
                      ? 'تسجيل الدخول'
                      : 'Sign In'}
                  </button>
                </form>
              )}

              {/* Prominent Guest Entry Button (ورود به عنوان مهمان / الدخول كزائر / Continue as Guest) */}
              <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleContinueAsGuest}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-black bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4 shrink-0" />
                  <span>
                    {isFa
                      ? 'ورود به عنوان مهمان'
                      : isAr
                      ? 'الدخول كزائر'
                      : 'Continue as Guest'}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            /* =========================================================================
               VIEW B: LOGGED-IN PERSONAL PROFILE (No Referral/Activation Input Box, No Math Captcha)
               ========================================================================= */
            <div className="space-y-3.5">
              {/* Avatar + 3 Live Status Badges (Coins, Referrals, VIP Status) */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 flex items-center gap-3">
                <div className="relative shrink-0">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={name}
                      className="w-14 h-14 rounded-2xl object-cover border-2 border-indigo-500 shadow-md"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-black text-lg flex items-center justify-center shadow-md">
                      {(name || email || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 p-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-md btn-3d-amber cursor-pointer"
                    title={isFa ? 'آپلود عکس پروفایل' : isAr ? 'تحديث الصورة' : 'Upload Profile Photo'}
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </div>

                {/* 3 Live Status Metrics: Coins, Successful Referrals, VIP Status */}
                <div className="flex-1 min-w-0 grid grid-cols-3 gap-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenUpgrade();
                    }}
                    className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 flex flex-col items-center justify-center active:scale-95 transition-transform cursor-pointer"
                  >
                    <Coins className="w-3.5 h-3.5 text-amber-500 mb-0.5" />
                    <span className="text-xs font-black text-amber-600 dark:text-amber-300">
                      {toLocalDigits(coinsBalance, language)}
                    </span>
                    <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">
                      {isFa ? 'موجودی سکه' : isAr ? 'العملات' : 'Coins'}
                    </span>
                  </button>

                  <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex flex-col items-center justify-center">
                    <Users className="w-3.5 h-3.5 text-indigo-500 mb-0.5" />
                    <span className="text-xs font-black text-indigo-600 dark:text-indigo-300">
                      {isFa
                        ? `${toFaDigits(invitedProgress)}/۳`
                        : isAr
                        ? `${toArDigits(invitedProgress)}/٣`
                        : `${invitedProgress}/3`}
                    </span>
                    <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">
                      {isFa ? 'رفرال موفق' : isAr ? 'الدعوات' : 'Referrals'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenUpgrade();
                    }}
                    className={`p-2 rounded-xl border flex flex-col items-center justify-center active:scale-95 transition-transform cursor-pointer ${
                      quota.isPro
                        ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-600 dark:text-emerald-300'
                        : 'bg-slate-200/70 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Crown
                      className={`w-3.5 h-3.5 mb-0.5 ${
                        quota.isPro ? 'text-amber-400 fill-amber-400' : 'text-slate-400'
                      }`}
                    />
                    <span className="text-[10px] font-black truncate max-w-full">
                      {quota.isPro
                        ? quota.remainingProDays
                          ? isFa
                            ? `VIP (${toFaDigits(quota.remainingProDays)} روز)`
                            : isAr
                            ? `VIP (${toArDigits(quota.remainingProDays)} يوم)`
                            : `VIP (${quota.remainingProDays}d)`
                          : 'VIP Pro'
                        : isFa
                        ? 'کاربر عادی'
                        : isAr
                        ? 'مجاني'
                        : 'Free Tier'}
                    </span>
                    <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">
                      {isFa ? 'وضعیت اشتراک' : isAr ? 'الباقة' : 'Plan'}
                    </span>
                  </button>
                </div>
              </div>

              {/* 2 Compact Profile Sub-Tabs: Edit Info / Change Password */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setProfileTab('info');
                    setStatusMessage(null);
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] font-black flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    profileTab === 'info'
                      ? 'bg-indigo-600 text-white btn-3d-primary'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isFa
                      ? 'ویرایش مشخصات و کشور'
                      : isAr
                      ? 'تعديل البيانات والبلد'
                      : 'Edit Info & Country'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setProfileTab('password');
                    setStatusMessage(null);
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] font-black flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    profileTab === 'password'
                      ? 'bg-indigo-600 text-white btn-3d-primary'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isFa ? 'تغییر رمز عبور' : isAr ? 'تغيير كلمة المرور' : 'Change Password'}
                  </span>
                </button>
              </div>

              {profileTab === 'info' ? (
                <form onSubmit={handleSaveProfileInfo} className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-black text-slate-600 dark:text-slate-300 mb-1">
                      {isFa ? 'نام و نام خانوادگی:' : isAr ? 'الاسم الكامل:' : 'Full Name:'}
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={isFa ? 'نام خود را وارد کنید' : isAr ? 'أدخل اسمك' : 'Enter your name'}
                        className="w-full pr-9 pl-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 input-3d"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-600 dark:text-slate-300 mb-1">
                      {isFa ? 'ایمیل یا شماره موبایل:' : isAr ? 'البريد الإلكتروني أو الهاتف:' : 'Email or Mobile Number:'}
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        dir="ltr"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="0912... / email@example.com"
                        className="w-full pr-9 pl-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 input-3d"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-indigo-600 dark:text-indigo-300 mb-1">
                      {isFa
                        ? 'کشور / منطقه کاربری:'
                        : isAr
                        ? 'البلد / الجنسية (طريقة الدفع):'
                        : 'Country / Payment Region:'}
                    </label>
                    <select
                      value={country}
                      onChange={(e) => setCountry(e.target.value as UserCountryCode)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 input-3d"
                    >
                      {renderCountryOptions()}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-2.5 rounded-xl text-xs font-black bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 btn-3d-secondary flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{isFa ? 'آپلود عکس' : isAr ? 'الصورة' : 'Photo'}</span>
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2.5 px-4 rounded-xl text-xs font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 btn-3d-primary cursor-pointer"
                    >
                      {isFa
                        ? 'ذخیره تغییرات پروفایل'
                        : isAr
                        ? 'حفظ التغييرات'
                        : 'Save Profile'}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleChangePassword} className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                      {isFa
                        ? 'رمز عبور فعلی:'
                        : isAr
                        ? 'كلمة المرور الحالية:'
                        : 'Current Password:'}
                    </label>
                    <input
                      type="password"
                      dir="ltr"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 input-3d"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                      {isFa
                        ? 'رمز عبور جدید (حداقل ۴ کاراکتر):'
                        : isAr
                        ? 'كلمة المرور الجديدة (٤ أحرف على الأقل):'
                        : 'New Password (min 4 chars):'}
                    </label>
                    <input
                      type="password"
                      dir="ltr"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 input-3d"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 btn-3d-primary cursor-pointer"
                  >
                    {isFa
                      ? 'ثبت و تغییر رمز عبور'
                      : isAr
                      ? 'تحديث كلمة المرور'
                      : 'Update Password'}
                  </button>
                </form>
              )}

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>
                    {isFa ? 'خروج از حساب کاربری' : isAr ? 'تسجيل الخروج' : 'Sign Out'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
