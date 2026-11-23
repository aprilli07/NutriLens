/**
 * NutriLens' watermelon mascot, drawn with plain Views so it needs no image asset.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

export default function WatermelonMascot({ size = 64 }: { size?: number }) {
  const s = size / 64;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Watermelon mascot"
      style={[styles.body, { width: size, height: size, borderRadius: size / 2, borderWidth: 2 * s }]}
    >
      {[10, 22, 34, 46].map((top) => (
        <View key={top} style={[styles.stripe, { top: top * s, height: 4 * s, left: 6 * s, right: 6 * s }]} />
      ))}
      <View style={[styles.eye, { top: 22 * s, left: 17 * s, width: 7 * s, height: 9 * s, borderRadius: 4 * s }]} />
      <View style={[styles.eye, { top: 22 * s, right: 17 * s, width: 7 * s, height: 9 * s, borderRadius: 4 * s }]} />
      <View
        style={[
          styles.smile,
          { top: 34 * s, left: 24 * s, width: 16 * s, height: 8 * s, borderBottomLeftRadius: 8 * s, borderBottomRightRadius: 8 * s },
        ]}
      />
      <View style={[styles.cheek, { top: 33 * s, left: 10 * s, width: 8 * s, height: 5 * s, borderRadius: 3 * s }]} />
      <View style={[styles.cheek, { top: 33 * s, right: 10 * s, width: 8 * s, height: 5 * s, borderRadius: 3 * s }]} />
      <View style={[styles.shine, { top: 7 * s, right: 12 * s, width: 12 * s, height: 7 * s, borderRadius: 4 * s }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { backgroundColor: '#2E8B3E', borderColor: '#1D4D25', overflow: 'hidden' },
  stripe: { position: 'absolute', backgroundColor: '#4CB85C', borderRadius: 2 },
  eye: { position: 'absolute', backgroundColor: '#1B1B1B' },
  smile: { position: 'absolute', backgroundColor: '#E0565B' },
  cheek: { position: 'absolute', backgroundColor: '#FF9AA2', opacity: 0.85 },
  shine: { position: 'absolute', backgroundColor: '#FFFFFF', opacity: 0.7 },
});
