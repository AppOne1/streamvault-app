import React, { useEffect } from 'react';
import { Language } from '../types';
import { shareAppToFriends } from '../services/deviceService';
import { getMyReferralCode } from '../services/quotaService';

interface ShareAppModalProps {
  language: Language;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Directly triggers Native OS Share Sheet (Bluetooth, Telegram, WhatsApp, Eitaa, etc.)
 * with the user's Referral Invite Message & APK without any intermediate store links modal.
 */
export const ShareAppModal: React.FC<ShareAppModalProps> = ({
  isOpen,
  onClose
}) => {
  useEffect(() => {
    if (isOpen) {
      const code = getMyReferralCode();
      shareAppToFriends(code).finally(() => {
        onClose();
      });
    }
  }, [isOpen, onClose]);

  return null;
};
