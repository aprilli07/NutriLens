/**
 * Every scan made on any device signed in to this family account.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Platform, RefreshControl, StyleSheet, Text, View } from 'react-native';
import EmptyState from '../components/EmptyState';
import GlobalHeader from '../components/GlobalHeader';
import ScanRow, { timeAgo } from '../components/ScanRow';
import { api } from '../lib/api';
import { colors } from '../lib/colors';
import type { ScanRecord } from '../lib/types';

export default function HistoryScreen() {
  const router = useRouter();
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

  const remove = (scan: ScanRecord) => {
    const doDelete = async () => {
      await api.deleteScan(scan.id).catch((e) => setError((e as Error).message));
      load();
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`Remove ${scan.name} from history?`)) doDelete();
      return;
    }
    Alert.alert('Remove from history?', scan.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: doDelete },
    ]);
  };

  return (
    <View style={styles.container}>
      <GlobalHeader title="History" showBackButton />
      <Text style={styles.caption}>Scans from every device signed in to this family account. Long-press to remove one.</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={scans ?? []}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={scans ? <EmptyState title="No scans yet" message="Scanned foods will show up here." /> : null}
        renderItem={({ item }) => (
          <ScanRow
            title={item.name}
            subtitle={timeAgo(item.scannedAt)}
            imageUrl={item.imageUrl}
            verdict={item.verdict}
            onPress={() => router.push({ pathname: '/product/[code]', params: { code: item.code } })}
            onLongPress={() => remove(item)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutralBG },
  caption: { color: colors.text.secondary, paddingHorizontal: 16, paddingTop: 12, fontSize: 13 },
  error: { color: colors.alertRed, paddingHorizontal: 16, paddingTop: 8 },
  list: { padding: 16 },
});
