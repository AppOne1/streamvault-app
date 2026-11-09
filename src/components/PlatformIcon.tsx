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
    case 'tiktok':
    case 'instagram':
    case 'twitter':
    case 'facebook':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`text-pink-500 ${className}`}>
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke="currentColor" strokeWidth="2" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" stroke="currentColor" strokeWidth="2" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
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
    case 'aparat':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={`text-rose-600 ${className}`}>
          <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="2" />
          <circle cx="9" cy="9" r="2" fill="currentColor" />
          <circle cx="15" cy="9" r="2" fill="currentColor" />
          <circle cx="9" cy="15" r="2" fill="currentColor" />
          <circle cx="15" cy="15" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
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
