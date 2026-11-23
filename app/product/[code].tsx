/**
 * Product result: verdict, per-restriction breakdown, ingredients and nutrition.
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import GlobalHeader from '../../components/GlobalHeader';
import OwlMascot, { OwlMood } from '../../components/OwlMascot';
import VerdictBadge from '../../components/VerdictBadge';
import { api, ProductResponse } from '../../lib/api';
import { colors, statusStyle } from '../../lib/colors';
import { getRestriction } from '../../lib/restrictions';
import type { Nutrition, Verdict } from '../../lib/types';

const MOOD: Record<Verdict, OwlMood> = { good: 'happy', caution: 'concerned', avoid: 'warning', unknown: 'thinking' };

const NUTRIENTS: [keyof Nutrition, string, string][] = [
  ['energyKcal', 'Calories', 'kcal'],
  ['sugars', 'Sugar', 'g'],
  ['fat', 'Fat', 'g'],
  ['saturatedFat', 'Saturated fat', 'g'],
  ['salt', 'Salt', 'g'],
  ['proteins', 'Protein', 'g'],
  ['fiber', 'Fibre', 'g'],
];

export default function ProductScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [data, setData] = useState<ProductResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    api.product(String(code))
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error || !data) {
    return (
      <View style={styles.container}>
        <GlobalHeader showBackButton title="Product" />
        <View style={styles.center}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.accentBlue} />}
        </View>
      </View>
    );
  }

  const { product, analysis } = data;
  const nutrition = product.nutrition ?? {};

  return (
    <View style={styles.container}>
      <GlobalHeader showBackButton title="Product" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          {product.imageUrl ? (
            <Image source={{ uri: product.imageUrl }} style={styles.image} contentFit="contain" />
          ) : (
            <View style={[styles.image, styles.placeholder]}>
              <Ionicons name="fast-food-outline" size={40} color={colors.text.secondary} />
            </View>
          )}
          <Text style={styles.name}>{product.name}</Text>
          {product.brands ? <Text style={styles.brand}>{product.brands}</Text> : null}
          <View style={{ marginTop: 10 }}>
            <VerdictBadge verdict={analysis.verdict} size="large" />
          </View>
        </View>

        <OwlMascot mood={MOOD[analysis.verdict]} message={analysis.summary} />

        {analysis.results.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your food rules</Text>
            {analysis.results.map((r) => {
              const s = statusStyle[r.status];
              const def = getRestriction(r.id);
              return (
                <View key={r.id} style={styles.ruleRow}>
                  <Ionicons name={s.icon} size={22} color={s.color} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ruleName}>{def?.emoji} {def?.label}</Text>
                    <Text style={styles.ruleDetail}>
                      {r.findings.length
                        ? r.findings.map((f) => (f.source === 'traces' ? `may contain ${f.term}` : f.term)).join(', ')
                        : r.status === 'unknown'
                          ? 'Not enough information on the label'
                          : 'Nothing found'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {analysis.ai && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Why?</Text>
            <Text style={styles.body}>{analysis.ai.explanation}</Text>
            {analysis.ai.alternatives.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Try instead</Text>
                {analysis.ai.alternatives.map((a) => (
                  <Text key={a} style={styles.body}>• {a}</Text>
                ))}
              </>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ingredients</Text>
          <Text style={styles.body}>{product.ingredientsText || 'No ingredient list available for this product.'}</Text>
          {product.allergenTags && product.allergenTags.length > 0 && (
            <Text style={[styles.body, { marginTop: 8 }]}>
              <Text style={{ fontWeight: '700' }}>Allergens: </Text>
              {product.allergenTags.map((t) => t.replace(/^\w\w:/, '')).join(', ')}
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nutrition per 100 g</Text>
          {NUTRIENTS.filter(([k]) => nutrition[k] != null).map(([k, label, unit]) => (
            <View key={k} style={styles.nutrientRow}>
              <Text style={styles.body}>{label}</Text>
              <Text style={styles.body}>{Math.round((nutrition[k] as number) * 10) / 10} {unit}</Text>
            </View>
          ))}
          {NUTRIENTS.every(([k]) => nutrition[k] == null) && <Text style={styles.body}>No nutrition facts available.</Text>}
        </View>

        <Text style={styles.footnote}>
          Data from Open Food Facts (barcode {product.code}). Always double-check the package if an allergy is serious.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutralBG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 16, paddingBottom: 48 },
  hero: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 20, padding: 20 },
  image: { width: 140, height: 140, borderRadius: 16, backgroundColor: colors.neutralBG },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 22, fontWeight: '700', color: colors.text.primary, textAlign: 'center', marginTop: 12 },
  brand: { fontSize: 15, color: colors.text.secondary, marginTop: 4 },
  section: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text.primary, marginBottom: 10 },
  ruleRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  ruleName: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  ruleDetail: { fontSize: 13, color: colors.text.secondary, marginTop: 2 },
  body: { fontSize: 14, color: colors.text.primary, lineHeight: 20 },
  nutrientRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  error: { color: colors.alertRed, textAlign: 'center', fontSize: 16 },
  footnote: { fontSize: 12, color: colors.text.secondary, textAlign: 'center', marginTop: 4 },
});
