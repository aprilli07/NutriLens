/**
 * Sign in / create a household account.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WatermelonMascot from '../components/WatermelonMascot';
import { useAuth } from '../lib/auth';

const BROWN = '#7A3E12';

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signIn') await signIn(email.trim(), password);
      else await signUp(email.trim(), password);
      // AuthGate redirects to /home once the user is set.
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require('../assets/images/background-login.jpg')} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
          <View style={styles.card}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>NutriLens</Text>
              <WatermelonMascot size={52} />
            </View>
            <Text style={styles.subtitle}>Scan it. Check it. Snack safely.</Text>

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#A66A3F"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              accessibilityLabel="Email"
            />
            <TextInput
              style={styles.input}
              placeholder={mode === 'signUp' ? 'Password (8+ characters)' : 'Password'}
              placeholderTextColor="#A66A3F"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
              onSubmitEditing={submit}
              accessibilityLabel="Password"
            />

            {error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}

            <TouchableOpacity style={styles.button} onPress={submit} disabled={busy} accessibilityRole="button">
              {busy ? <ActivityIndicator color={BROWN} /> : <Text style={styles.buttonText}>{mode === 'signIn' ? 'Sign in' : 'Create account'}</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setMode(mode === 'signIn' ? 'signUp' : 'signIn');
                setError(null);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.switch}>
                {mode === 'signIn' ? 'New here? Create a family account' : 'Already have an account? Sign in'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.hint}>
              Parents: sign in with the same account on your child&apos;s device to see every scan they make.
            </Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF3E2' },
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', padding: 20 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  title: { fontSize: 34, fontWeight: '800', color: BROWN, letterSpacing: 0.5 },
  subtitle: { textAlign: 'center', color: '#8A5A36', marginTop: 6, marginBottom: 24, fontSize: 15 },
  input: {
    height: 50,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E3A46E',
    borderRadius: 25,
    paddingHorizontal: 20,
    fontSize: 16,
    color: BROWN,
    marginBottom: 12,
  },
  error: { color: '#C0392B', textAlign: 'center', marginBottom: 8 },
  button: {
    backgroundColor: '#F6C987',
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonText: { fontSize: 18, fontWeight: '700', color: BROWN },
  switch: { textAlign: 'center', color: '#3D6FD8', marginTop: 16, fontSize: 15 },
  hint: { textAlign: 'center', color: '#8A8A8A', fontSize: 12, marginTop: 18, lineHeight: 17 },
});
