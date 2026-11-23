/**
 * Colour palette.
 */
import type { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import type { Status, Verdict } from './types';

export const colors = {
  primaryGreen: '#2FA67C', // safe
  warnYellow: '#D99A00', // caution (dark enough for text on white)
  alertRed: '#E04848', // avoid
  neutralBG: '#F7F7FA',
  accentBlue: '#4C7DF0',
  unknownGrey: '#7A8699',

  text: {
    primary: '#2D3748',
    secondary: '#5F6B7D',
    inverse: '#FFFFFF',
  },

  surface: '#FFFFFF',
  border: '#E6E8EF',
} as const;

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const verdictStyle: Record<Verdict, { color: string; label: string; icon: IconName }> = {
  good: { color: colors.primaryGreen, label: 'Good', icon: 'checkmark-circle' },
  caution: { color: colors.warnYellow, label: 'Caution', icon: 'warning' },
  avoid: { color: colors.alertRed, label: 'Avoid', icon: 'close-circle' },
  unknown: { color: colors.unknownGrey, label: 'Not sure', icon: 'help-circle' },
};

export const statusStyle: Record<Status, { color: string; label: string; icon: IconName }> = {
  ok: verdictStyle.good,
  caution: verdictStyle.caution,
  avoid: verdictStyle.avoid,
  unknown: verdictStyle.unknown,
};
