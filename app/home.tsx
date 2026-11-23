/**
 * Home: shortcuts plus a real summary of the household's scans.
 */
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import GlobalHeader from '../components/GlobalHeader';
import ScanRow, { timeAgo } from '../components/ScanRow';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors } from '../lib/colors';
import { getRestriction } from '../lib/restrictions';
import type { ScanRecord } from '../lib/types';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [scans, setScans] = useState<ScanRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setScans(await api.scans(200));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const total = scans?.length ?? 0;
  const avoided = scans?.filter((s) => s.verdict === 'avoid').length ?? 0;
  const good = scans?.filter((s) => s.verdict === 'good').length ?? 0;
  const restrictions = user?.restrictions ?? [];

  return (
    <View style={styles.container}>
      <GlobalHeader title="NutriLens" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Text style={styles.lead}>Scan any packaged food to see if it fits your family&apos;s food rules.</Text>

        <TouchableOpacity style={styles.restrictions} onPress={() => router.push('/settings')} accessibilityRole="button">
          <Ionicons name="shield-checkmark" size={18} color={colors.accentBlue} />
          <Text style={styles.restrictionsText} numberOfLines={2}>
            {restrictions.length
              ? `Checking for: ${restrictions.map((id) => getRestriction(id)?.label).join(', ')}`
              : 'No food rules set yet. Tap to choose them.'}
          </Text>
        </TouchableOpacity>

        <View style={styles.cardRow}>
          <TouchableOpacity style={styles.card} onPress={() => router.push('/scanner')} accessibilityRole="button">
            <Ionicons name="barcode-outline" size={34} color={colors.accentBlue} />
            <Text style={styles.cardTitle}>Scan food</Text>
            <Text style={styles.cardSubtitle}>Use the camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.card} onPress={() => router.push('/search')} accessibilityRole="button">
            <Ionicons name="search" size={34} color={colors.accentBlue} />
            <Text style={styles.cardTitle}>Search</Text>
            <Text style={styles.cardSubtitle}>4.9M+ foods</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Family scans</Text>
          <View style={styles.statsRow}>
            <Stat icon="scan" value={String(total)} label="Scanned" />
            <Stat icon="hand-left" value={String(avoided)} label="Stopped" color={colors.alertRed} />
            <Stat icon="happy" value={total ? `${Math.round((good / total) * 100)}%` : '–'} label="Good picks" color={colors.primaryGreen} />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent scans</Text>
            <TouchableOpacity onPress={() => router.push('/history')} accessibilityRole="link">
              <Text style={styles.link}>See all</Text>
            </TouchableOpacity>
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          {scans && scans.length === 0 && <Text style={styles.empty}>No scans yet. Try scanning a snack!</Text>}
          {scans?.slice(0, 3).map((s) => (
            <ScanRow
              key={s.id}
              title={s.name}
              subtitle={timeAgo(s.scannedAt)}
              imageUrl={s.imageUrl}
              verdict={s.verdict}
              onPress={() => router.push({ pathname: '/product/[code]', params: { code: s.code } })}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ icon, value, label, color = colors.accentBlue }: { icon: React.ComponentProps<typeof Ionicons>['name']; value: string; label: string; color?: string }) {
  return (
    <View style={styles.statBox}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={styles.statNumber}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutralBG },
  content: { padding: 16, paddingBottom: 40 },
  lead: { fontSize: 15, color: colors.text.secondary, marginBottom: 12 },
  restrictions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EAF0FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  restrictionsText: { flex: 1, color: colors.text.primary, fontSize: 14 },
  cardRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 22, alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text.primary, marginTop: 8 },
  cardSubtitle: { fontSize: 13, color: colors.text.secondary, marginTop: 2 },
  section: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text.primary, marginBottom: 12 },
  link: { color: colors.accentBlue, fontWeight: '600', marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statBox: { flex: 1, backgroundColor: colors.neutralBG, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  statNumber: { fontSize: 20, fontWeight: '700', color: colors.text.primary, marginTop: 4 },
  statLabel: { fontSize: 12, color: colors.text.secondary, marginTop: 2 },
  error: { color: colors.alertRed, marginBottom: 8 },
  empty: { color: colors.text.secondary },
});
