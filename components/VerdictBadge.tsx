/**
 * Pill showing a product's verdict.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { verdictStyle } from '../lib/colors';
import { typography } from '../lib/typography';
import type { Verdict } from '../lib/types';

const SIZES = {
  small: { iconSize: 14, fontSize: 12, padding: 6 },
  medium: { iconSize: 18, fontSize: 14, padding: 8 },
  large: { iconSize: 24, fontSize: 18, padding: 12 },
};

export default function VerdictBadge({ verdict, size = 'medium' }: { verdict: Verdict; size?: keyof typeof SIZES }) {
  const config = verdictStyle[verdict];
  const s = SIZES[size];
  return (
    <View
      accessibilityLabel={`Verdict: ${config.label}`}
      style={[styles.container, { borderColor: config.color, paddingHorizontal: s.padding, paddingVertical: s.padding / 2 }]}
    >
      <Ionicons name={config.icon} size={s.iconSize} color={config.color} style={styles.icon} />
      <Text style={[styles.label, { color: config.color, fontSize: s.fontSize }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
  },
  icon: { marginRight: 4 },
  label: { fontWeight: typography.fontWeight.semiBold },
});
