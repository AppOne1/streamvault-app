import React, { useState, useEffect } from 'react';
import { X, User, Mail, Lock, Phone, ShieldCheck, Crown, LogOut, RefreshCw, KeyRound, CheckCircle2, ArrowRight } from 'lucide-react';
import { Language, UserSession } from '../types';
import { getTranslation } from '../i18n/translations';

interface AuthModalProps {
  language: Language;
  isOpen: boolean;
  userSession: UserSession;
  onClose: () => void;
  onUpdateSession: (newSession: UserSession) => void;
}

interface StoredAccount {
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  registeredAt: number;
}

const ACCOUNTS_KEY = 'appone_registered_users_db';

export const AuthModal: React.FC<AuthModalProps> = ({
  language,
  isOpen,
  userSession,
  onClose,
  onUpdateSession
}) => {
  const t = getTranslation(language);
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');

  // Form Fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [isResetCodeSent, setIsResetCodeSent] = useState(false);

  // Multiplication Math CAPTCHA
  const [captchaNum1, setCaptchaNum1] = useState(4);
  const [captchaNum2, setCaptchaNum2] = useState(7);
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaError, setCaptchaError] = useState(false);
  const [formFeedback, setFormFeedback] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  // Generate new multiplication CAPTCHA
  const refreshCaptcha = () => {
    const n1 = Math.floor(Math.random() * 8) + 2; // 2..9
    const n2 = Math.floor(Math.random() * 8) + 2; // 2..9
    setCaptchaNum1(n1);
    setCaptchaNum2(n2);
    setCaptchaInput('');
    setCaptchaError(false);
  };

  useEffect(() => {
    if (isOpen) {
      refreshCaptcha();
      setFormFeedback(null);
    }
  }, [isOpen, mode]);

  if (!isOpen) return null;

  // Convert digits to Persian if language is FA
  const toFaDigits = (n: number | string) => {
    if (language !== 'fa') return String(n);
    const f = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return String(n).replace(/[0-9]/g, (w) => f[+w]);
  };

  const getStoredAccounts = (): StoredAccount[] => {
    try {
      const raw = localStorage.getItem(ACCOUNTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const saveStoredAccount = (account: StoredAccount) => {
    const list = getStoredAccounts();
    list.push(account);
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  };

  // 1. Submit Sign Up
  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);

    // Verify Multiplication CAPTCHA
    if (parseInt(captchaInput, 10) !== captchaNum1 * captchaNum2) {
      setCaptchaError(true);
      setFormFeedback(language === 'fa' ? 'پاسخ کلمه امنیتی (ضرب اعداد) نادرست است!' : 'Incorrect Math CAPTCHA answer!');
      refreshCaptcha();
      return;
    }

    if (password.length < 6) {
      setFormFeedback(language === 'fa' ? 'رمز عبور باید حداقل ۶ کاراکتر باشد' : 'Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setFormFeedback(language === 'fa' ? 'تکرار رمز عبور با رمز واردشده مطابقت ندارد' : 'Passwords do not match');
      return;
    }

    // Save account
    saveStoredAccount({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      passwordHash: password,
      registeredAt: Date.now()
    });

    const newSession: UserSession = {
      isLoggedIn: true,
      user: {
        id: `user-${Date.now()}`,
        name: name.trim() || 'کاربر ویژه وان دانلود (گروه AppOne علوی)',
        email: email.trim() || 'vip@appone.ir',
        plan: 'VIP Pro',
        quotaUsedMb: 0,
        quotaMaxMb: 50000
      }
    };

    onUpdateSession(newSession);
    setFeedbackSuccess(true);
    setFormFeedback(language === 'fa' ? 'ثبت‌نام با موفقیت انجام شد! خوش آمدید.' : 'Registration successful! Welcome.');
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  // 2. Submit Sign In
  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);

    // Verify Multiplication CAPTCHA
    if (parseInt(captchaInput, 10) !== captchaNum1 * captchaNum2) {
      setCaptchaError(true);
      setFormFeedback(language === 'fa' ? 'پاسخ کلمه امنیتی (ضرب اعداد) نادرست است!' : 'Incorrect Math CAPTCHA answer!');
      refreshCaptcha();
      return;
    }

    const accounts = getStoredAccounts();
    const identifier = (email || phone).trim().toLowerCase();
    const matched = accounts.find(
      (a) => (a.email.toLowerCase() === identifier || a.phone === identifier) && a.passwordHash === password
    );

    // Create session (either matched account or instant login)
    const displayName = matched ? matched.name : (identifier.split('@')[0] || 'کاربر ویژه وان دانلود (گروه AppOne علوی)');
    const displayEmail = matched ? matched.email : (identifier.includes('@') ? identifier : 'vip@appone.ir');

    const newSession: UserSession = {
      isLoggedIn: true,
      user: {
        id: `user-${Date.now()}`,
        name: displayName,
        email: displayEmail,
        plan: 'VIP Pro',
        quotaUsedMb: 120,
        quotaMaxMb: 50000
      }
    };

    onUpdateSession(newSession);
    setFeedbackSuccess(true);
    setFormFeedback(language === 'fa' ? 'ورود موفقیت‌آمیز بود! در حال بارگذاری...' : 'Sign in successful! Loading...');
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  // 3. Submit Forgot Password
  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);

    if (parseInt(captchaInput, 10) !== captchaNum1 * captchaNum2) {
      setCaptchaError(true);
      setFormFeedback(language === 'fa' ? 'پاسخ ضرب اعداد نادرست است!' : 'Incorrect Math CAPTCHA answer!');
      refreshCaptcha();
      return;
    }

    if (!isResetCodeSent) {
      setIsResetCodeSent(true);
      setFeedbackSuccess(true);
      setFormFeedback(
        language === 'fa'
          ? 'کد تایید ۶ رقمی به شماره همراه / ایمیل شما ارسال شد (کد تایید تستی: 123456)'
          : 'Verification code sent to your phone/email (Demo Code: 123456)'
      );
      refreshCaptcha();
      return;
    }

    // Process new password
    if (resetCode !== '123456' && resetCode.length < 4) {
      setFormFeedback(language === 'fa' ? 'کد تایید واردشده نامعتبر است' : 'Invalid verification code');
      return;
    }

    if (newPassword.length < 6) {
      setFormFeedback(language === 'fa' ? 'رمز عبور جدید باید حداقل ۶ رقم باشد' : 'New password must be at least 6 characters');
      return;
    }

    setFeedbackSuccess(true);
    setFormFeedback(language === 'fa' ? 'رمز عبور با موفقیت تغییر کرد! اکنون وارد شوید.' : 'Password reset successfully! Please sign in.');
    setTimeout(() => {
      setMode('signin');
      setIsResetCodeSent(false);
      setPassword(newPassword);
    }, 1500);
  };

  const handleSignOut = () => {
    onUpdateSession({
      isLoggedIn: false,
      user: {
        id: 'guest',
        name: t.guestUser,
        email: '',
        plan: 'Free',
        quotaUsedMb: 0,
        quotaMaxMb: 5000
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 card-3d overflow-hidden my-8">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 card-3d">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white text-3d">
                {mode === 'signin' && (language === 'fa' ? 'ورود به حساب کاربری' : 'Sign In')}
                {mode === 'signup' && (language === 'fa' ? 'ثبت‌نام کاربر جدید' : 'Create Account')}
                {mode === 'forgot' && (language === 'fa' ? 'بازیابی و فراموشی رمز عبور' : 'Reset Password')}
              </h3>
              <p className="text-[11px] text-slate-400">
                {language === 'fa' ? 'کاربر ویژه وان دانلود (گروه AppOne علوی)' : 'OneDownload VIP (AppOne Alavi Group)'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6">
          {/* User Already Signed In View */}
          {userSession.isLoggedIn && userSession.user && userSession.user.id !== 'guest' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white font-extrabold text-lg flex items-center justify-center shadow-md">
                  {userSession.user.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-white truncate">
                      {userSession.user.name}
                    </h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-amber-400 text-slate-950">
                      {userSession.user.plan}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5 font-mono">
                    {userSession.user.email}
                  </p>
                </div>
              </div>

              <button
                onClick={handleSignOut}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-rose-300 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/40 flex items-center justify-center gap-2 transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span>{language === 'fa' ? 'خروج از حساب کاربری' : 'Sign Out'}</span>
              </button>
            </div>
          ) : (
            <>
              {/* Mode Switcher Tabs */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-800/80 mb-5 border border-slate-700/50 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setMode('signin')}
                  className={`py-2 rounded-xl transition-all ${
                    mode === 'signin' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {language === 'fa' ? 'ورود' : 'Sign In'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className={`py-2 rounded-xl transition-all ${
                    mode === 'signup' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {language === 'fa' ? 'ثبت‌نام' : 'Sign Up'}
                </button>
              </div>

              {/* Status Toast Alert */}
              {formFeedback && (
                <div
                  className={`mb-4 p-3 rounded-2xl text-xs font-semibold flex items-center gap-2 border ${
                    feedbackSuccess
                      ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                      : 'bg-rose-950/60 border-rose-500/50 text-rose-300'
                  }`}
                >
                  {feedbackSuccess ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
                  <span>{formFeedback}</span>
                </div>
              )}

              {/* ── Mode 1: Sign In Form ── */}
              {mode === 'signin' && (
                <form onSubmit={handleSignIn} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">
                      {language === 'fa' ? 'ایمیل یا شماره همراه' : 'Email or Mobile Phone'}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        dir="ltr"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="user@example.com / 0912..."
                        className="w-full ps-10 pe-3 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-300">
                        {language === 'fa' ? 'رمز عبور' : 'Password'}
                      </label>
                      <button
                        type="button"
                        onClick={() => setMode('forgot')}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 hover:underline"
                      >
                        {language === 'fa' ? 'فراموشی رمز عبور؟' : 'Forgot Password?'}
                      </button>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type="password"
                        required
                        dir="ltr"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full ps-10 pe-3 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                      />
                    </div>
                  </div>

                  {/* Math Multiplication CAPTCHA Box */}
                  <div className="p-3.5 rounded-2xl bg-slate-800/50 border border-slate-700/80 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-amber-300 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        {language === 'fa' ? 'کلمه امنیتی (ضرب اعداد):' : 'Math CAPTCHA:'}
                      </span>
                      <button
                        type="button"
                        onClick={refreshCaptcha}
                        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
                        title="تغییر کپچا"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>{language === 'fa' ? 'سوال جدید' : 'New'}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-amber-400 font-black text-sm font-mono tracking-wider shadow-inner">
                        {toFaDigits(captchaNum1)} × {toFaDigits(captchaNum2)} = ؟
                      </div>
                      <input
                        type="number"
                        required
                        dir="ltr"
                        value={captchaInput}
                        onChange={(e) => {
                          setCaptchaInput(e.target.value);
                          setCaptchaError(false);
                        }}
                        placeholder={language === 'fa' ? 'حاصل‌ضرب...' : 'Result...'}
                        className={`flex-1 px-3 py-1.5 rounded-xl bg-slate-900 border text-white text-xs text-center font-mono font-bold focus:outline-none ${
                          captchaError ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700 focus:border-indigo-500'
                        }`}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl text-xs font-extrabold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 btn-3d-primary active:scale-95 transition-all"
                  >
                    {language === 'fa' ? 'ورود به حساب کاربری' : 'Sign In'}
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>{language === 'fa' ? 'ادامه به عنوان مهمان (ورود مستقیم به برنامه)' : 'Continue as Guest (Direct Access)'}</span>
                  </button>
                </form>
              )}

              {/* ── Mode 2: Sign Up Form ── */}
              {mode === 'signup' && (
                <form onSubmit={handleSignUp} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      {language === 'fa' ? 'نام و نام خانوادگی' : 'Full Name'}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-slate-400">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={language === 'fa' ? 'علیرضا حسینی' : 'John Doe'}
                        className="w-full ps-10 pe-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      {language === 'fa' ? 'شماره همراه' : 'Mobile Phone'}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-slate-400">
                        <Phone className="w-4 h-4" />
                      </div>
                      <input
                        type="tel"
                        required
                        dir="ltr"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="09123456789"
                        className="w-full ps-10 pe-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      {language === 'fa' ? 'ایمیل معتبر' : 'Email Address'}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        dir="ltr"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full ps-10 pe-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        {language === 'fa' ? 'رمز عبور' : 'Password'}
                      </label>
                      <input
                        type="password"
                        required
                        dir="ltr"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        {language === 'fa' ? 'تکرار رمز' : 'Confirm'}
                      </label>
                      <input
                        type="password"
                        required
                        dir="ltr"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                  </div>

                  {/* Math Multiplication CAPTCHA Box */}
                  <div className="p-3 rounded-2xl bg-slate-800/50 border border-slate-700/80 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-amber-300 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        {language === 'fa' ? 'کلمه امنیتی (ضرب اعداد):' : 'Math CAPTCHA:'}
                      </span>
                      <button
                        type="button"
                        onClick={refreshCaptcha}
                        className="text-[11px] text-slate-400 hover:text-white"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-amber-400 font-black text-sm font-mono">
                        {toFaDigits(captchaNum1)} × {toFaDigits(captchaNum2)} = ؟
                      </div>
                      <input
                        type="number"
                        required
                        dir="ltr"
                        value={captchaInput}
                        onChange={(e) => {
                          setCaptchaInput(e.target.value);
                          setCaptchaError(false);
                        }}
                        placeholder={language === 'fa' ? 'حاصل‌ضرب' : 'Result'}
                        className="flex-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs text-center font-mono font-bold focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl text-xs font-extrabold text-white bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 btn-3d-emerald active:scale-95 transition-all"
                  >
                    {language === 'fa' ? 'تکمیل و ایجاد حساب کاربری' : 'Complete Registration'}
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>{language === 'fa' ? 'ادامه به عنوان مهمان (ورود مستقیم به برنامه)' : 'Continue as Guest (Direct Access)'}</span>
                  </button>
                </form>
              )}

              {/* ── Mode 3: Forgot Password Form ── */}
              {mode === 'forgot' && (
                <form onSubmit={handleForgotPassword} className="space-y-3.5">
                  <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-800/40 text-xs text-indigo-300 flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>
                      {language === 'fa'
                        ? 'برای بازیابی رمز، شماره همراه یا ایمیل و کلمه امنیتی را وارد نمایید.'
                        : 'Enter your phone/email and solve the math challenge to reset password.'}
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      {language === 'fa' ? 'شماره همراه یا ایمیل ثبت‌شده' : 'Registered Mobile or Email'}
                    </label>
                    <input
                      type="text"
                      required
                      dir="ltr"
                      value={email || phone}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setPhone(e.target.value);
                      }}
                      placeholder="0912... / user@domain.com"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  {isResetCodeSent && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          {language === 'fa' ? 'کد تایید پیامک‌شده / ایمیل‌شده' : 'Verification Code'}
                        </label>
                        <input
                          type="text"
                          required
                          dir="ltr"
                          value={resetCode}
                          onChange={(e) => setResetCode(e.target.value)}
                          placeholder="کد ۶ رقمی (تستی: 123456)"
                          className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-xs text-center tracking-widest font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          {language === 'fa' ? 'رمز عبور جدید' : 'New Password'}
                        </label>
                        <input
                          type="password"
                          required
                          dir="ltr"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-xs font-mono"
                        />
                      </div>
                    </>
                  )}

                  {/* Math Multiplication CAPTCHA */}
                  <div className="p-3 rounded-2xl bg-slate-800/50 border border-slate-700/80 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-amber-300">
                        {language === 'fa' ? 'کلمه امنیتی (ضرب اعداد):' : 'Math CAPTCHA:'}
                      </span>
                      <button type="button" onClick={refreshCaptcha} className="text-slate-400 hover:text-white">
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-amber-400 font-black text-sm font-mono">
                        {toFaDigits(captchaNum1)} × {toFaDigits(captchaNum2)} = ؟
                      </div>
                      <input
                        type="number"
                        required
                        dir="ltr"
                        value={captchaInput}
                        onChange={(e) => setCaptchaInput(e.target.value)}
                        placeholder={language === 'fa' ? 'پاسخ' : 'Result'}
                        className="flex-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs text-center font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMode('signin')}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800"
                    >
                      {language === 'fa' ? 'بازگشت' : 'Back'}
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2.5 rounded-xl text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md"
                    >
                      {isResetCodeSent
                        ? (language === 'fa' ? 'تایید و ذخیره رمز جدید' : 'Confirm New Password')
                        : (language === 'fa' ? 'ارسال کد تایید' : 'Send Reset Code')}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
