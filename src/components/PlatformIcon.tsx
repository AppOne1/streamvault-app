import React from 'react';
import { PlatformId } from '../types';

interface PlatformIconProps {
  platform: PlatformId;
  className?: string;
  size?: number;
}

export const PlatformIcon: React.FC<PlatformIconProps> = ({ platform, className = '', size = 20 }) => {
  switch (platform) {
    case 'youtube':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`text-red-500 ${className}`}>
          <path
            d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"
            fill="currentColor"
          />
          <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="#ffffff" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={`text-rose-500 ${className}`}>
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.86.12V9.42a6.35 6.35 0 0 0-.86-.06 6.34 6.34 0 1 0 6.34 6.34V8.4a8.27 8.27 0 0 0 4.77 1.48v-3.19z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`text-pink-500 ${className}`}>
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke="currentColor" strokeWidth="2" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" stroke="currentColor" strokeWidth="2" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    case 'twitter':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={`text-sky-400 ${className}`}>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case 'facebook':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={`text-blue-600 ${className}`}>
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
      );
    case 'soundcloud':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={`text-amber-500 ${className}`}>
          <path d="M11 7v10h1V7h-1zm2 1.5v7h1v-7h-1zm2 1.5v4h1v-4h-1zm-6-2.5v9h1V7.5H9zm-2 2v5h1v-5H7zm-2 1v3h1v-3H5zm-2 1v1h1v-1H3zm15-2.5a4.5 4.5 0 0 1 4.5 4.5 4.5 4.5 0 0 1-4.5 4.5h-1v-9h1z" />
        </svg>
      );
    case 'vimeo':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={`text-cyan-500 ${className}`}>
          <path d="M22.84 6.78c-.13 3.01-2.27 7.13-6.42 12.36-4.3 5.41-7.94 8.12-10.92 8.12-1.84 0-3.39-1.7-4.65-5.11-.84-3.08-1.68-6.17-2.52-9.25C-2.4 9.85-2.9 8.27-4.04 8.16L0 6.64c2.8 0 4.8 2.05 6.01 6.16 1.43 4.96 2.38 7.44 2.86 7.44.38 0 1.25-1.07 2.62-3.21 1.36-2.14 2.09-3.79 2.19-4.94.17-1.83-.91-2.75-3.24-2.75-.85 0-1.75.18-2.7.53 1.74-5.71 5.09-8.49 10.05-8.34 3.73.12 5.42 2.37 5.05 5.25z" transform="scale(0.8) translate(5, 0)" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-indigo-500 ${className}`}>
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      );
  }
};
