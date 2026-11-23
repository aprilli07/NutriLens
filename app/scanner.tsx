/**
 * Barcode scanner. Each scan is analysed on the server and saved to the family's history.
 */
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import GlobalHeader from '../components/GlobalHeader';
import { api } from '../lib/api';
import { colors } from '../lib/colors';

export default function ScannerScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const lastCode = useRef<string | null>(null);

  // Allow scanning the same product again after coming back to this screen.
  useFocusEffect(useCallback(() => {
    lastCode.current = null;
    setBusy(false);
  }, []));

  const lookUp = async (code: string) => {
    const clean = code.trim();
    if (!clean || busy || clean === lastCode.current) return;
    lastCode.current = clean;
    setBusy(true);
    setError(null);
    try {
      await api.scan(clean);
      router.push({ pathname: '/product/[code]', params: { code: clean } });
    } catch (e) {
      setError((e as Error).message);
      lastCode.current = null;
      setBusy(false);
    }
  };

  const cameraAvailable = Platform.OS !== 'web' && permission?.granted;

  return (
    <View style={styles.container}>
      <GlobalHeader title="Scan" showBackButton />
      <View style={styles.cameraBox}>
        {cameraAvailable ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={busy ? undefined : ({ data }) => lookUp(data)}
          />
        ) : (
          <View style={styles.noCamera}>
            <Ionicons name="camera-outline" size={48} color={colors.text.secondary} />
            {Platform.OS === 'web' ? (
              <Text style={styles.noCameraText}>The camera scanner works in the mobile app. Type a barcode below instead.</Text>
            ) : (
              <>
                <Text style={styles.noCameraText}>NutriLens needs the camera to read barcodes.</Text>
                <TouchableOpacity style={styles.permissionButton} onPress={requestPermission} accessibilityRole="button">
                  <Text style={styles.permissionText}>Allow camera</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
        {cameraAvailable && <View style={styles.frame} pointerEvents="none" />}
        {busy && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.overlayText}>Checking ingredients…</Text>
          </View>
        )}
      </View>

      <View style={styles.bottom}>
        {error && <Text style={styles.error}>{error}</Text>}
        <Text style={styles.label}>Or type the barcode</Text>
        <View style={styles.manualRow}>
          <TextInput
            style={styles.input}
            value={manual}
            onChangeText={(t) => setManual(t.replace(/\D/g, ''))}
            placeholder="e.g. 3017620422003"
            keyboardType="number-pad"
            maxLength={14}
            onSubmitEditing={() => lookUp(manual)}
            accessibilityLabel="Barcode number"
          />
          <TouchableOpacity style={styles.go} onPress={() => lookUp(manual)} disabled={busy} accessibilityRole="button" accessibilityLabel="Look up barcode">
            <Ionicons name="arrow-forward" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutralBG },
  cameraBox: { flex: 1, margin: 16, borderRadius: 20, overflow: 'hidden', backgroundColor: '#1E2430' },
  frame: {
    position: 'absolute',
    top: '30%',
    left: '12%',
    right: '12%',
    height: '35%',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
  },
  noCamera: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.surface },
  noCameraText: { textAlign: 'center', color: colors.text.secondary, marginTop: 12, fontSize: 15 },
  permissionButton: { marginTop: 16, backgroundColor: colors.accentBlue, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10 },
  permissionText: { color: '#fff', fontWeight: '700' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  overlayText: { color: '#fff', marginTop: 12, fontSize: 16, fontWeight: '600' },
  bottom: { paddingHorizontal: 16, paddingBottom: 32 },
  error: { color: colors.alertRed, marginBottom: 8 },
  label: { color: colors.text.secondary, marginBottom: 6 },
  manualRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  go: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.accentBlue, alignItems: 'center', justifyContent: 'center' },
});
