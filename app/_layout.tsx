import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../lib/auth';
import { colors } from '../lib/colors';

/** Sends signed-out users to the login screen and signed-in users away from it. */
function AuthGate() {
  const { user, ready } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const first = segments[0] as string | undefined;
    const onLogin = !first || first === 'index';
    if (!user && !onLogin) router.replace('/');
    if (user && onLogin) router.replace('/home');
  }, [user, ready, segments, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.neutralBG }}>
        <ActivityIndicator color={colors.accentBlue} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.neutralBG } }}>
      <Stack.Screen name="index" options={{ gestureEnabled: false }} />
      <Stack.Screen name="home" options={{ gestureEnabled: false }} />
      <Stack.Screen name="scanner" />
      <Stack.Screen name="search" />
      <Stack.Screen name="history" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="product/[code]" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate />
      <StatusBar style="dark" />
    </AuthProvider>
  );
}
