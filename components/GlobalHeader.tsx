/**
 * Screen header with optional back button and a settings shortcut.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../lib/colors';

interface Props {
  title?: string;
  showBackButton?: boolean;
  showSettings?: boolean;
}

export default function GlobalHeader({ title, showBackButton = false, showSettings = true }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.left}>
        {showBackButton && (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        )}
        {title && (
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
        )}
      </View>
      {showSettings && (
        <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Settings">
          <Ionicons name="settings-outline" size={24} color={colors.text.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconButton: { padding: 8 },
  title: { fontSize: 26, fontWeight: '700', color: colors.text.primary, marginLeft: 4, flexShrink: 1 },
});
