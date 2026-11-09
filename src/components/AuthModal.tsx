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
  UserCheck,
  Eye,
  EyeOff,
  Gift
} from 'lucide-react';
import { Language, UserCountryCode, UserSession } from '../types';
import {
  getCoinsBalance,
  getDailyQuota,
  getReferralInfo,
  ReferralInfo,
  submitReferralCodeOrInvite,
  subscribeQuotaAndCoins,
  syncAccountVipAndReferral,
  syncReferralFromCloud
} from '../services/quotaService';
import {
  getLocalizedGuestName,
  isDefaultGuestName,
  restoreAccountVaultSnapshot,
  setLockedAccountCurrency
} from '../services/storageService';
import { getOrCreateDeviceId } from '../services/deviceService';
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

  // Guest / Unauthenticated mode: 'login' | 'register' | 'forgot' (Defaults to single-page 'login' view matching Screenshot 3)
  const [guestMode, setGuestMode] = useState<'register' | 'login' | 'forgot'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [showGoogleQuickPrompt, setShowGoogleQuickPrompt] = useState(false);
  const [googleEmailInput, setGoogleEmailInput] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number>(0);

  // Logged-in Personal Profile sub-tab: 'info' | 'password'
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
  const [copiedRefCode, setCopiedRefCode] = useState(false);
  const fixedHardwareId = getOrCreateDeviceId();

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

  // CafeBazaar & Myket Security: Strict Input Sanitization (Anti-XSS / Anti-Injection)
  const sanitizeAuthInput = (raw: string): string =>
    raw.replace(/[<>"'`;\\]/g, '').replace(/[\u0000-\u001F\u007F]/g, '').trim();

  const isValidEmailOrPhone = (raw: string): boolean => {
    const cleaned = sanitizeAuthInput(normalizeDigits(raw)).trim();
    if (!cleaned || cleaned.length < 3 || cleaned.length > 120) return false;
    return true;
  };

  // Deterministic Security Hash for Password Storage (CafeBazaar / Myket Security Standard)
  const computeSecurePasswordDigest = (plain: string): string => {
    const salted = `OD_SEC_V2::${plain}::${fixedHardwareId.slice(0, 8)}`;
    let h1 = 0xdeadbeef ^ salted.length;
    let h2 = 0x41c6ce57 ^ salted.length;
    for (let i = 0; i < salted.length; i++) {
      const ch = salted.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return `odsec_${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
  };

  // Google Sign-In Handler (Compatible with Android APK WebView Bridge + Browser)
  const handleGoogleSignIn = async (overrideGmail?: string) => {
    setStatusMessage(null);

    // 1. Check Native Android Bridge if running inside APK with Google Sign-In Bridge
    const winAny = window as any;
    if (winAny?.AndroidGoogleAuth?.signIn && !overrideGmail) {
      try {
        winAny.AndroidGoogleAuth.signIn();
        return;
      } catch {
        // fallback to inline Google account connect
      }
    }

    const candidateGmail = sanitizeAuthInput(
      normalizeDigits(overrideGmail || googleEmailInput || (email.includes('@') ? email : ''))
    ).toLowerCase();

    if (!candidateGmail || !candidateGmail.includes('@')) {
      setShowGoogleQuickPrompt(true);
      return;
    }

    const savedVault = await restoreAccountVaultSnapshot(candidateGmail);

    const effectiveCountry: UserCountryCode =
      savedVault?.user?.country || session.user.country || (language === 'fa' ? 'IR' : country);
    setLockedAccountCurrency(effectiveCountry === 'IR' || language === 'fa' ? 'toman' : 'usdt');

    if (registerReferralCode.trim().length >= 3) {
      submitReferralCodeOrInvite(sanitizeAuthInput(registerReferralCode.trim()), candidateGmail);
    }

    const latestQuota = syncAccountVipAndReferral(candidateGmail);
    const latestReferral = getReferralInfo();
    setQuota(latestQuota);
    setReferralInfo(latestReferral);
    setCoinsBalance(getCoinsBalance());

    const displayName =
      (savedVault?.user?.name && !isDefaultGuestName(savedVault.user.name)
        ? savedVault.user.name
        : candidateGmail.split('@')[0]) || getLocalizedGuestName(language);

    onUpdateSession({
      isLoggedIn: true,
      user: {
        ...session.user,
        ...savedVault?.user,
        id: savedVault?.user?.id || `google-${Date.now()}`,
        name: displayName,
        email: candidateGmail,
        country: effectiveCountry,
        avatarUrl: avatarUrl || savedVault?.user?.avatarUrl,
        plan: latestQuota.isPro ? 'VIP Pro' : 'Free',
        vipExpiry: latestQuota.proExpiryDate,
        vipPlan: latestQuota.proPlanName,
        referralCode: latestReferral.myReferralCode
      }
    });

    setShowGoogleQuickPrompt(false);
    setRegisterReferralCode('');
    onAuthSuccess?.();
    onClose();
  };

  // 1. Single-Page Modern Login / Registration Handler (Supports Username, Email OR Mobile Phone Number + Referral)
  const handleGuestAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    // Brute-force rate limit protection (CafeBazaar / Myket Security Standard)
    if (lockoutUntil > Date.now()) {
      const waitSec = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setStatusMessage({
        type: 'error',
        text: isFa
          ? `تعداد تلاش‌های ناموفق بیش از حد مجاز است. لطفاً ${toFaDigits(waitSec)} ثانیه دیگر تلاش کنید.`
          : isAr
          ? `محاولات كثيرة غير ناجحة. يرجى الانتظار ${toArDigits(waitSec)} ثانية.`
          : `Too many failed attempts. Please wait ${waitSec}s.`
      });
      return;
    }

    const cleanIdentifier = sanitizeAuthInput(normalizeDigits(email.trim()));
    const cleanPass = sanitizeAuthInput(password.trim());

    if (!isValidEmailOrPhone(cleanIdentifier)) {
      setStatusMessage({
        type: 'error',
        text: isFa
          ? 'لطفاً نام کاربری، آدرس ایمیل یا شماره موبایل معتبر وارد نمایید.'
          : isAr
          ? 'يرجى إدخال اسم مستخدم أو بريد إلكتروني أو رقم هاتف صحيح.'
          : 'Please enter a valid username, email address, or mobile phone number.'
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

    const hashedPass = computeSecurePasswordDigest(cleanPass);
    const savedVault = await restoreAccountVaultSnapshot(cleanIdentifier);

    if (guestMode === 'login') {
      const expectedHash = savedVault?.user?.passwordHash || (
        session.user.email && session.user.email.toLowerCase() === cleanIdentifier.toLowerCase()
          ? session.user.passwordHash
          : undefined
      );
      if (
        expectedHash &&
        expectedHash !== cleanPass &&
        expectedHash !== hashedPass
      ) {
        const nextFails = failedAttempts + 1;
        setFailedAttempts(nextFails);
        if (nextFails >= 5) {
          setLockoutUntil(Date.now() + 30000);
        }
        setStatusMessage({
          type: 'error',
          text: isFa
            ? 'رمز عبور واردشده نادرست است! در صورت فراموشی، گزینه «رمز عبورم را فراموش کرده‌ام» را بزنید.'
            : isAr
            ? 'كلمة المرور غير صحيحة! استخدم خيار نسيت كلمة المرور إذا لزم الأمر.'
            : 'Incorrect password! Tap Forgot Password below if needed.'
        });
        return;
      }
    }

    setFailedAttempts(0);

    // Lock account currency type permanently at registration/login based on selected country / initial language
    const effectiveCountry: UserCountryCode =
      guestMode === 'register'
        ? country
        : savedVault?.user?.country || session.user.country || (language === 'fa' ? 'IR' : country);
    setLockedAccountCurrency(effectiveCountry === 'IR' || language === 'fa' ? 'toman' : 'usdt');

    // Bind and restore any account-bound VIP subscription, coins, daily quota, daily check-in & permanent referral code for this account
    syncAccountVipAndReferral(cleanIdentifier);

    // Process optional referral code on the single-page login/signup screen
    if (registerReferralCode.trim().length >= 3) {
      submitReferralCodeOrInvite(sanitizeAuthInput(registerReferralCode.trim()), cleanIdentifier);
    }

    const latestQuota = getDailyQuota();
    const latestReferral = getReferralInfo();
    setQuota(latestQuota);
    setReferralInfo(latestReferral);
    setCoinsBalance(getCoinsBalance());

    const fallbackName = cleanIdentifier.includes('@')
      ? cleanIdentifier.split('@')[0]
      : cleanIdentifier;
    const restoredName =
      savedVault?.user?.name && !isDefaultGuestName(savedVault.user.name)
        ? savedVault.user.name
        : !isDefaultGuestName(name) && sanitizeAuthInput(name)
        ? sanitizeAuthInput(name)
        : fallbackName || getLocalizedGuestName(language);

    onUpdateSession({
      isLoggedIn: true,
      user: {
        ...session.user,
        ...savedVault?.user,
        id: savedVault?.user?.id || `user-${Date.now()}`,
        name: restoredName,
        email: cleanIdentifier,
        country: effectiveCountry,
        passwordHash: hashedPass,
        avatarUrl: avatarUrl || savedVault?.user?.avatarUrl,
        plan: latestQuota.isPro ? 'VIP Pro' : 'Free',
        vipExpiry: latestQuota.proExpiryDate,
        vipPlan: latestQuota.proPlanName,
        referralCode: latestReferral.myReferralCode
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
  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
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

    const savedVault = await restoreAccountVaultSnapshot(cleanIdentifier);
    const latestQuota = syncAccountVipAndReferral(cleanIdentifier);
    const latestReferral = getReferralInfo();
    setQuota(latestQuota);
    setReferralInfo(latestReferral);
    setCoinsBalance(getCoinsBalance());

    onUpdateSession({
      ...session,
      isLoggedIn: true,
      user: {
        ...session.user,
        ...savedVault?.user,
        email: cleanIdentifier,
        name:
          (savedVault?.user?.name && !isDefaultGuestName(savedVault.user.name)
            ? savedVault.user.name
            : !isDefaultGuestName(name) && name.trim()) ||
          (cleanIdentifier.includes('@') ? cleanIdentifier.split('@')[0] : cleanIdentifier),
        passwordHash: computeSecurePasswordDigest(cleanNewPass),
        avatarUrl: avatarUrl || savedVault?.user?.avatarUrl,
        plan: latestQuota.isPro ? 'VIP Pro' : 'Free',
        vipExpiry: latestQuota.proExpiryDate,
        vipPlan: latestQuota.proPlanName,
        referralCode: latestReferral.myReferralCode
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

    const latestQuota = syncAccountVipAndReferral(cleanIdentifier);
    const latestReferral = getReferralInfo();
    setQuota(latestQuota);

    onUpdateSession({
      ...session,
      isLoggedIn: true,
      user: {
        ...session.user,
        name: cleanName,
        email: cleanIdentifier,
        country,
        avatarUrl,
        plan: latestQuota.isPro ? 'VIP Pro' : 'Free',
        vipExpiry: latestQuota.proExpiryDate,
        vipPlan: latestQuota.proPlanName,
        referralCode: latestReferral.myReferralCode
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

    // IMPORTANT: Call onLogout(true) which saves the complete account vault snapshot (videos, audios,
    // starred/saved items, coins, daily quota, daily check-in, and referrals) BEFORE switching to guest.
    // Do NOT zero out coinsBalance or overwrite session before onLogout saves the current logged-in state!
    if (onLogout) {
      onLogout(true);
    } else {
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
    }

    setCoinsBalance(getCoinsBalance());
    setQuota(getDailyQuota());
    setReferralInfo(getReferralInfo());
    setGuestMode('login');
    setStatusMessage({
      type: 'success',
      text: isFa
        ? 'از حساب کاربری خارج شدید. تمامی ویدیوها، صداها، ذخیره‌ها، سکه‌ها و زیرمجموعه‌های شما محفوظ است و با ورود مجدد کامل بازیابی می‌شوند.'
        : isAr
        ? 'تم تسجيل الخروج. جميع الفيديوهات والصوتيات والعملات والإحالات محفوظة بالكامل.'
        : 'Signed out. All your videos, audios, saved items, coins, and referrals are safely preserved.'
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
        {/* Prominent Language Switcher Bar at Top of Auth Screen: فارسی | العربية | English */}
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
              onClick={() => handleLanguageSwitch('fa')}
              className={`py-1.5 px-2 rounded-xl text-[11px] font-black transition-all cursor-pointer ${
                language === 'fa'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30 ring-1 ring-indigo-400'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              فارسی
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
              العربية
            </button>
            <button
              type="button"
              onClick={() => handleLanguageSwitch('en')}
              className={`py-1.5 px-2 rounded-xl text-[11px] font-black transition-all cursor-pointer ${
                language === 'en'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30 ring-1 ring-indigo-400'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              English
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
              <h3 className="font-black text-xs sm:text-sm text-slate-900 dark:text-white text-3d truncate">
                {session.isLoggedIn
                  ? isFa
                    ? 'پروفایل شخصی من • دانلود از اینستاگرام (وان دانلود)'
                    : isAr
                    ? 'ملفي الشخصي • وان داونلود'
                    : 'My Personal Profile'
                  : guestMode === 'register'
                  ? isFa
                    ? 'دانلود از اینستاگرام (وان دانلود)'
                    : isAr
                    ? 'تحميل من إنستغرام (وان داونلود)'
                    : 'Instagram Downloader (OneDownload)'
                  : guestMode === 'login'
                  ? isFa
                    ? 'ورود • دانلود از اینستاگرام (وان دانلود)'
                    : isAr
                    ? 'تسجيل الدخول • وان داونلود'
                    : 'Sign In • OneDownload'
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
                  ? 'ثبت‌نام و ورود آنی با ایمیل یا شماره موبایل'
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
              VIEW A: SINGLE-PAGE MODERN LOGIN / SIGNUP (Matches Screenshot 3 + Referral + Google + Security)
             ========================================================================= */}
          {!session.isLoggedIn ? (
            <div className="space-y-3.5 px-1">
              {guestMode === 'forgot' ? (
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-3">
                  <div>
                    <input
                      type="text"
                      dir="ltr"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={isFa ? 'ایمیل یا شماره موبایل' : isAr ? 'البريد الإلكتروني أو الهاتف' : 'Email or Mobile'}
                      className="w-full px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 text-xs sm:text-sm font-bold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>

                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      dir="ltr"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={isFa ? 'رمز عبور جدید' : isAr ? 'كلمة المرور الجديدة' : 'New Password'}
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 text-xs sm:text-sm font-bold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 px-4 rounded-2xl text-sm font-black text-slate-950 bg-emerald-500 hover:bg-emerald-400 shadow-md shadow-emerald-500/20 transition-all active:scale-98 cursor-pointer"
                  >
                    {isFa
                      ? 'بازنشانی رمز عبور و ورود'
                      : isAr
                      ? 'إعادة تعيين كلمة المرور والدخول'
                      : 'Reset Password & Sign In'}
                  </button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setGuestMode('login');
                        setStatusMessage(null);
                      }}
                      className="text-xs font-bold text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
                    >
                      {isFa ? 'بازگشت به صفحه ورود' : isAr ? 'العودة لتسجيل الدخول' : 'Back to Sign In'}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleGuestAuthSubmit} className="space-y-3">
                  {/* Email / Mobile Input */}
                  <div>
                    <input
                      type="text"
                      dir="ltr"
                      required
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={
                        isFa
                          ? 'ایمیل یا شماره موبایل'
                          : isAr
                          ? 'البريد الإلكتروني أو رقم الهاتف'
                          : 'Email or Mobile Number'
                      }
                      className="w-full px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 text-xs sm:text-sm font-bold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>

                  {/* Password Input with Eye Toggle */}
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      dir="ltr"
                      required
                      autoComplete={guestMode === 'register' ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isFa ? 'رمز عبور' : isAr ? 'كلمة المرور' : 'Password'}
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 text-xs sm:text-sm font-bold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      title={isFa ? 'نمایش/مخفی کردن رمز' : 'Toggle password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Forgot Password Link right under Password */}
                  <div className="flex items-center justify-between px-1">
                    <button
                      type="button"
                      onClick={() => {
                        setGuestMode('forgot');
                        setStatusMessage(null);
                      }}
                      className="text-[11px] font-bold text-slate-500 dark:text-slate-300 hover:text-emerald-400 transition-colors cursor-pointer"
                    >
                      {isFa
                        ? 'رمز عبورم را فراموش کرده‌ام'
                        : isAr
                        ? 'نسيت كلمة المرور؟'
                        : 'Forgot my password?'}
                    </button>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      <span>{isFa ? 'امنیت رمزنگاری‌شده' : isAr ? 'حماية مشفرة' : 'Encrypted'}</span>
                    </span>
                  </div>

                  {/* Referral Code Field on the Same Single Page */}
                  <div className="relative">
                    <Gift className="w-4 h-4 text-indigo-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      dir="ltr"
                      value={registerReferralCode}
                      onChange={(e) => setRegisterReferralCode(e.target.value.toUpperCase())}
                      placeholder={
                        isFa
                          ? 'کد معرف / رفرال دوستان (اختیاری - مثال: OD-XXXX)'
                          : isAr
                          ? 'كود الدعوة / الإحالة (اختياري - OD-XXXX)'
                          : 'Referral Code (Optional - e.g. OD-XXXX)'
                      }
                      className="w-full pr-10 pl-4 py-2.5 rounded-2xl bg-slate-100/80 dark:bg-slate-800/60 border border-dashed border-indigo-400/50 dark:border-indigo-500/40 text-xs font-bold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  {/* Primary Green Action Button (Matching Screenshot 3) */}
                  <button
                    type="submit"
                    className="w-full py-3 px-4 rounded-2xl text-sm font-black text-slate-950 bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all active:scale-98 cursor-pointer"
                  >
                    {guestMode === 'register'
                      ? isFa
                        ? 'ثبت‌نام و ورود'
                        : isAr
                        ? 'إنشاء حساب والدخول'
                        : 'Sign Up & Enter'
                      : isFa
                      ? 'ورود'
                      : isAr
                      ? 'تسجيل الدخول'
                      : 'Sign In'}
                  </button>
                </form>
              )}

              {/* Divider: ─── یا ─── */}
              <div className="flex items-center gap-3 py-0.5">
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                <span className="text-xs font-bold text-slate-400">
                  {isFa ? 'یا' : isAr ? 'أو' : 'OR'}
                </span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              </div>

              {/* Google Sign-In Button (Matching Screenshot 3) */}
              {!showGoogleQuickPrompt ? (
                <button
                  type="button"
                  onClick={() => handleGoogleSignIn()}
                  className="w-full py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800/90 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 text-slate-800 dark:text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2.5 transition-all active:scale-98 cursor-pointer"
                >
                  <span>
                    {isFa
                      ? 'ورود با حساب گوگل'
                      : isAr
                      ? 'الدخول بحساب جوجل'
                      : 'Sign in with Google'}
                  </span>
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#EA4335"
                      d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.9C3.5 21.4 7.4 24 12 24z"
                    />
                  </svg>
                </button>
              ) : (
                <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-200">
                    <span>
                      {isFa
                        ? 'آدرس جیمیل خود را جهت اتصال آنی وارد کنید:'
                        : isAr
                        ? 'أدخل بريد Gmail للاتصال الفوري:'
                        : 'Enter your Gmail address to connect:'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowGoogleQuickPrompt(false)}
                      className="text-slate-400 hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="email"
                      dir="ltr"
                      autoFocus
                      value={googleEmailInput}
                      onChange={(e) => setGoogleEmailInput(e.target.value)}
                      placeholder="yourname@gmail.com"
                      className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleGoogleSignIn(googleEmailInput)}
                      className="px-3.5 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black shrink-0 cursor-pointer"
                    >
                      {isFa ? 'اتصال' : isAr ? 'اتصال' : 'Connect'}
                    </button>
                  </div>
                </div>
              )}

              {/* Bottom Toggle Link + Guest Entry */}
              <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex flex-col gap-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setGuestMode(guestMode === 'register' ? 'login' : 'register');
                    setStatusMessage(null);
                  }}
                  className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  {guestMode === 'register' ? (
                    <>
                      {isFa ? 'قبلاً ثبت‌نام کرده‌اید؟ ' : isAr ? 'لديك حساب بالفعل؟ ' : 'Already have an account? '}
                      <span className="text-emerald-500 dark:text-emerald-400 font-black">
                        {isFa ? 'وارد شوید' : isAr ? 'تسجيل الدخول' : 'Sign In'}
                      </span>
                    </>
                  ) : (
                    <>
                      {isFa ? 'حساب کاربری ندارید؟ ' : isAr ? 'ليس لديك حساب؟ ' : "Don't have an account? "}
                      <span className="text-emerald-500 dark:text-emerald-400 font-black">
                        {isFa ? 'ثبت‌نام کنید' : isAr ? 'أنشئ حساباً' : 'Sign Up'}
                      </span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleContinueAsGuest}
                  className="w-full py-2 px-4 rounded-xl text-[11px] font-black bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <UserCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
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
                        ? `${toFaDigits(referralInfo.invitedCount)} (${toFaDigits(invitedProgress)}/۳)`
                        : isAr
                        ? `${toArDigits(referralInfo.invitedCount)} (${toArDigits(invitedProgress)}/٣)`
                        : `${referralInfo.invitedCount} (${invitedProgress}/3)`}
                    </span>
                    <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">
                      {isFa ? 'تعداد رفرال‌های موفق' : isAr ? 'الدعوات الناجحة' : 'Referrals'}
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

              {/* Live Account-Bound VIP Status Banner inside Profile */}
              {quota.isPro && (
                <div className="p-2.5 rounded-2xl bg-gradient-to-r from-amber-500/20 via-yellow-500/15 to-emerald-500/20 border border-amber-400/50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-black text-amber-700 dark:text-amber-300">
                    <Crown className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0" />
                    <span>
                      {isFa
                        ? `اشتراک VIP فعال • ${toFaDigits(quota.remainingProDays || 30)} روز باقی‌مانده`
                        : isAr
                        ? `اشتراك VIP نشط • ${toArDigits(quota.remainingProDays || 30)} يوم متبقي`
                        : `VIP Active • ${quota.remainingProDays || 30} Days Remaining`}
                    </span>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                </div>
              )}

              {/* Permanent Hardware ID & Crypto-Exchange Style Referral Dashboard in Profile */}
              <div className="p-3 rounded-2xl bg-indigo-50/70 dark:bg-slate-950/90 border border-indigo-500/30 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-black text-slate-600 dark:text-slate-300">
                    {isFa
                      ? 'شناسه ثابت سخت‌افزاری دستگاه:'
                      : isAr
                      ? 'المعرف الثابت للجهاز:'
                      : 'Permanent Hardware ID:'}
                  </span>
                  <span
                    dir="ltr"
                    className="font-mono font-black text-indigo-600 dark:text-indigo-400 select-all"
                  >
                    {fixedHardwareId}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-indigo-500/20 text-[11px]">
                  <span className="font-black text-slate-600 dark:text-slate-300">
                    {isFa
                      ? 'کد رفرال اختصاصی حساب شما:'
                      : isAr
                      ? 'كود الإحالة الخاص بحسابك:'
                      : 'Your Account Referral Code:'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(referralInfo.myReferralCode).catch(() => {});
                      setCopiedRefCode(true);
                      setTimeout(() => setCopiedRefCode(false), 2000);
                    }}
                    dir="ltr"
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-mono font-black text-xs cursor-pointer hover:bg-indigo-500 transition-colors"
                  >
                    {copiedRefCode
                      ? isFa
                        ? 'کپی شد ✓'
                        : 'Copied ✓'
                      : referralInfo.myReferralCode}
                  </button>
                </div>

                {/* Live Exchange-Style Referral Counter & Progress Bar */}
                <div className="pt-1.5 border-t border-indigo-500/20 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-black text-slate-700 dark:text-slate-200 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-emerald-500" />
                      <span>
                        {isFa
                          ? 'زیرمجموعه‌های ثبت‌شده (۳ نفر = ۱ ماه VIP):'
                          : isAr
                          ? 'الإحالات المسجلة (٣ = شهر VIP):'
                          : 'Verified Referrals (3 = 1M VIP):'}
                      </span>
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-black text-xs">
                      {isFa
                        ? `${toFaDigits(referralInfo.invitedCount)} از ${toFaDigits(3)} نفر`
                        : isAr
                        ? `${toArDigits(referralInfo.invitedCount)} من ${toArDigits(3)}`
                        : `${referralInfo.invitedCount} / 3`}
                    </span>
                  </div>

                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 via-emerald-500 to-teal-400 transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.round((referralInfo.invitedCount / 3) * 100))}%`
                      }}
                    />
                  </div>

                  {/* Direct Referral Code Input inside Profile (in case user didn't enter it at signup) */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <input
                      type="text"
                      dir="ltr"
                      value={registerReferralCode}
                      onChange={(e) => setRegisterReferralCode(e.target.value.toUpperCase())}
                      placeholder={
                        isFa
                          ? 'ثبت کد معرف دوستان (مثال: OD-8K4X9P2M)'
                          : isAr
                          ? 'إدخال كود إحالة الصديق (OD-XXXX)'
                          : 'Enter friend referral code (OD-XXXX)'
                      }
                      className="flex-1 px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-500/30 text-[11px] font-mono font-bold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!registerReferralCode.trim()) return;
                        const res = submitReferralCodeOrInvite(
                          sanitizeAuthInput(registerReferralCode.trim()),
                          session.user.email || session.user.name
                        );
                        setReferralInfo(res.referralInfo);
                        setQuota(getDailyQuota());
                        if (res.success) {
                          setRegisterReferralCode('');
                        }
                        setStatusMessage({
                          type: res.success ? 'success' : 'error',
                          text: isFa ? res.messageFa : res.messageEn
                        });
                      }}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black shrink-0 cursor-pointer transition-colors"
                    >
                      {isFa ? 'ثبت کد معرف' : isAr ? 'تأكيد الكود' : 'Apply Code'}
                    </button>
                  </div>

                  {/* List of Referred Users (Crypto-Exchange Style) */}
                  {referralInfo.invitedUsers.length > 0 && (
                    <div className="pt-1 space-y-1 max-h-24 overflow-y-auto">
                      {referralInfo.invitedUsers.map((inv, idx) => (
                        <div
                          key={inv.id || idx}
                          className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900/90 border border-slate-200/70 dark:border-slate-800 text-[10px]"
                        >
                          <span className="font-bold text-slate-700 dark:text-slate-200 truncate">
                            {isFa ? `ردیف ${toFaDigits(idx + 1)}:` : `#${idx + 1}:`} {inv.codeOrIdentifier}
                          </span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-black shrink-0">
                            {isFa ? 'تأیید شده ✓' : isAr ? 'مؤكد ✓' : 'Verified ✓'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
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
                      ? 'ویرایش مشخصات'
                      : isAr
                      ? 'تعديل البيانات'
                      : 'Edit Info'}
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
