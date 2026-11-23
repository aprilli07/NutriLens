/**
 * Search-as-you-type over the full Open Food Facts catalogue, with typo correction
 * and an optional "only show foods that fit our rules" filter.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import EmptyState from '../components/EmptyState';
import GlobalHeader from '../components/GlobalHeader';
import ScanRow from '../components/ScanRow';
import SearchBar from '../components/SearchBar';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors } from '../lib/colors';
import type { SearchResponse } from '../lib/types';

const RECENTS_KEY = 'nutrilens.recentSearches';
const DEBOUNCE_MS = 150;

export default function SearchScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [onlySafe, setOnlySafe] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const inflight = useRef<AbortController | null>(null);
  const hasRules = (user?.restrictions.length ?? 0) > 0;

  useEffect(() => {
    AsyncStorage.getItem(RECENTS_KEY).then((v) => v && setRecents(JSON.parse(v))).catch(() => undefined);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResult(null);
      setLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      inflight.current?.abort();
      const controller = new AbortController();
      inflight.current = controller;
      setLoading(true);
      try {
        const res = await api.search(q, { restrictions: onlySafe ? user?.restrictions : [], signal: controller.signal });
        if (!controller.signal.aborted) {
          setResult(res);
          setError(null);
        }
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, onlySafe, user?.restrictions]);

  const open = (code: string) => {
    const q = query.trim();
    if (q) {
      const next = [q, ...recents.filter((r) => r !== q)].slice(0, 6);
      setRecents(next);
      AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(() => undefined);
    }
    router.push({ pathname: '/product/[code]', params: { code } });
  };

  return (
    <View style={styles.container}>
      <GlobalHeader title="Search" showBackButton />
      <SearchBar value={query} onChangeText={setQuery} onClear={() => setQuery('')} placeholder="Search foods or brands" />
      {hasRules && (
        <View style={styles.filterRow}>
          <Text style={styles.filterText}>Only show foods that fit our rules</Text>
          <Switch value={onlySafe} onValueChange={setOnlySafe} trackColor={{ true: colors.primaryGreen }} accessibilityLabel="Only show foods that fit our rules" />
        </View>
      )}

      {result?.correctedQuery && (
        <Text style={styles.meta}>
          Showing results for <Text style={{ fontWeight: '700' }}>{result.correctedQuery}</Text>
        </Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      {query.trim().length < 2 ? (
        <View style={styles.recents}>
          {recents.length > 0 && <Text style={styles.sectionTitle}>Recent searches</Text>}
          <View style={styles.chips}>
            {recents.map((r) => (
              <TouchableOpacity key={r} style={styles.chip} onPress={() => setQuery(r)} accessibilityRole="button">
                <Text style={styles.chipText}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {recents.length === 0 && <EmptyState title="Find any food" message="Type a snack or brand, like “granola bar”." />}
        </View>
      ) : (
        <FlatList
          data={result?.hits ?? []}
          keyExtractor={(h) => h.code}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={loading ? <ActivityIndicator style={{ marginVertical: 8 }} color={colors.accentBlue} /> : null}
          ListEmptyComponent={!loading && result ? <EmptyState title="No matches" message="Try a different word or turn off the filter." mood="thinking" /> : null}
          renderItem={({ item }) => (
            <ScanRow title={item.name} subtitle={item.brands} imageUrl={item.imageUrl} onPress={() => open(item.code)} />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutralBG },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  filterText: { color: colors.text.primary, fontSize: 14 },
  meta: { paddingHorizontal: 20, paddingTop: 10, color: colors.text.secondary },
  error: { paddingHorizontal: 20, paddingTop: 10, color: colors.alertRed },
  list: { padding: 16 },
  recents: { padding: 16, flex: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text.primary, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: colors.text.primary },
});
