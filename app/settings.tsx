/**
 * Family food rules (saved to the account, so every signed-in device uses them) and account actions.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import GlobalHeader from '../components/GlobalHeader';
import VerdictBadge from '../components/VerdictBadge';
import { useAuth } from '../lib/auth';
import { colors } from '../lib/colors';
import { RESTRICTIONS } from '../lib/restrictions';
import type { RestrictionId } from '../lib/types';

export default function SettingsScreen() {
  const { user, updateRestrictions, signOut } = useAuth();
  const [saving, setSaving] = useState<RestrictionId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = new Set(user?.restrictions ?? []);

  const toggle = async (id: RestrictionId) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSaving(id);
    setError(null);
    try {
      await updateRestrictions([...next]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={styles.container}>
      <GlobalHeader title="Settings" showBackButton showSettings={false} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Food rules</Text>
          <Text style={styles.description}>
            Pick everything your child needs to avoid. These are saved to your family account, so every phone signed in to it checks for the same things.
          </Text>
          {error && <Text style={styles.error}>{error}</Text>}
          {RESTRICTIONS.map((r) => {
            const on = selected.has(r.id);
            return (
              <TouchableOpacity
                key={r.id}
                style={[styles.item, on && styles.itemOn]}
                onPress={() => toggle(r.id)}
                disabled={saving !== null}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
              >
                <Text style={styles.emoji}>{r.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemLabel}>{r.label}</Text>
                  <Text style={styles.itemDescription}>{r.description}</Text>
                </View>
                <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? colors.accentBlue : colors.border} />
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What the colours mean</Text>
          <Legend verdict="good" text="Nothing on the label breaks your rules." />
          <Legend verdict="caution" text="“May contain”, or something worth checking with a grown-up." />
          <Legend verdict="avoid" text="Contains something on your list." />
          <Legend verdict="unknown" text="The label didn't have enough information." />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Text style={styles.description}>Signed in as {user?.email}</Text>
          <TouchableOpacity style={styles.signOut} onPress={signOut} accessibilityRole="button">
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>NutriLens · Product data © Open Food Facts contributors (ODbL)</Text>
      </ScrollView>
    </View>
  );
}

function Legend({ verdict, text }: { verdict: React.ComponentProps<typeof VerdictBadge>['verdict']; text: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={{ width: 96 }}>
        <VerdictBadge verdict={verdict} size="small" />
      </View>
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutralBG },
  content: { padding: 16, paddingBottom: 48 },
  section: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text.primary, marginBottom: 6 },
  description: { color: colors.text.secondary, fontSize: 14, marginBottom: 12, lineHeight: 20 },
  error: { color: colors.alertRed, marginBottom: 8 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: 8,
  },
  itemOn: { borderColor: colors.accentBlue, backgroundColor: '#F0F4FF' },
  emoji: { fontSize: 24 },
  itemLabel: { fontSize: 16, fontWeight: '600', color: colors.text.primary },
  itemDescription: { fontSize: 13, color: colors.text.secondary, marginTop: 2 },
  legendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  legendText: { flex: 1, color: colors.text.primary, fontSize: 14 },
  signOut: { borderRadius: 12, borderWidth: 1.5, borderColor: colors.alertRed, paddingVertical: 12, alignItems: 'center' },
  signOutText: { color: colors.alertRed, fontWeight: '700', fontSize: 16 },
  footer: { textAlign: 'center', color: colors.text.secondary, fontSize: 12 },
});
