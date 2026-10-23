import React from 'react';

interface ODLogoProps {
  className?: string;
  showOnlineDot?: boolean;
  isOnline?: boolean;
}

/**
 * Custom 3D Eye-Catching "OD" (OneDownload) Monogram + Download Arrow Logo
 */
export const ODLogo: React.FC<ODLogoProps> = ({
  className = 'w-10 h-10',
  showOnlineDot = false,
  isOnline = true
}) => {
  return (
    <div
      className={`relative flex items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-950 via-indigo-700 to-violet-600 border-t border-white/35 shadow-[0_4px_0_rgb(49,46,129),0_8px_16px_rgba(99,102,241,0.4)] text-white font-black select-none shrink-0 ${className}`}
    >
      <svg
        viewBox="0 0 64 64"
        className="w-[82%] h-[82%] drop-shadow-[0_2px_3px_rgba(0,0,0,0.55)]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="odTextGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#e0e7ff" />
            <stop offset="100%" stopColor="#93c5fd" />
          </linearGradient>
          <linearGradient id="odArrowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fde047" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#ea580c" />
          </linearGradient>
        </defs>

        {/* Bold 3D "O" */}
        <rect
          x="7"
          y="11"
          width="21"
          height="27"
          rx="10.5"
          stroke="url(#odTextGrad)"
          strokeWidth="5.5"
        />

        {/* Bold 3D "D" */}
        <path
          d="M35 11 H44 C51.5 11 56 16.2 56 24.5 C56 32.8 51.5 38 44 38 H35 Z"
          stroke="url(#odTextGrad)"
          strokeWidth="5.5"
          strokeLinejoin="round"
        />

        {/* 3D Golden Download Arrow + Base */}
        <path
          d="M32 34 V51"
          stroke="url(#odArrowGrad)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M24 44 L32 52 L40 44"
          stroke="url(#odArrowGrad)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M16 57 H48"
          stroke="url(#odArrowGrad)"
          strokeWidth="4.2"
          strokeLinecap="round"
        />
      </svg>

      {showOnlineDot && (
        <span
          className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${
            isOnline ? 'dot-3d-green' : 'dot-3d-red'
          }`}
        />
      )}
    </div>
  );
};
