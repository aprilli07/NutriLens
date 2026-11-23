/**
 * One row in a list of scans or search results.
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../lib/colors';
import type { Verdict } from '../lib/types';
import VerdictBadge from './VerdictBadge';

interface Props {
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  verdict?: Verdict;
  onPress(): void;
  onLongPress?(): void;
}

export function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export default function ScanRow({ title, subtitle, imageUrl, verdict, onPress, onLongPress }: Props) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={title}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.image} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.image, styles.placeholder]}>
          <Ionicons name="fast-food-outline" size={22} color={colors.text.secondary} />
        </View>
      )}
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {verdict ? <VerdictBadge verdict={verdict} size="small" /> : <Ionicons name="chevron-forward" size={18} color={colors.text.secondary} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  image: { width: 52, height: 52, borderRadius: 10, backgroundColor: colors.neutralBG },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  subtitle: { fontSize: 13, color: colors.text.secondary, marginTop: 2 },
});
