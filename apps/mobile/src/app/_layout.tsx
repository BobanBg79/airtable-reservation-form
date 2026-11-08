import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { ActivityIndicator, Button, PaperProvider, Text, useTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApartmentsProvider } from '../state/ApartmentsProvider';
import { AuthProvider, useAuth } from '../state/AuthProvider';
import { darkTheme, lightTheme, type AppTheme } from '../theme';

// Root stack. Signed out, the only screen is `login`; signed in, the tabs (Home, Calendar, Apartments, Users) sit
// at the bottom of the stack and a detail screen (apartment/[id]) is pushed on top, so Back always returns to
// where the user came from. `Stack.Protected` keeps the two groups apart: a signed-out user cannot reach the
// tabs by any link, and a user who signs out is sent back to login.
export default function RootLayout() {
  const dark = useColorScheme() === 'dark';
  const theme = dark ? darkTheme : lightTheme;

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <AuthProvider>
          <ApartmentsProvider>
            <StatusBar style={dark ? 'light' : 'dark'} />
            <RootNavigator backgroundColor={theme.colors.background} />
          </ApartmentsProvider>
        </AuthProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator({ backgroundColor }: { backgroundColor: string }) {
  const { status } = useAuth();
  const signedIn = status === 'signedIn';

  return (
    <View style={s.fill}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor } }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="apartment/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
      {/* Until the server has said who the saved token belongs to, nothing of the app is shown. */}
      {status === 'loading' || status === 'offline' ? <StartupCover /> : null}
    </View>
  );
}

function StartupCover() {
  const theme = useTheme<AppTheme>();
  const { status, message, retry } = useAuth();
  return (
    <View style={[s.cover, { backgroundColor: theme.colors.background }]}>
      {status === 'offline' ? (
        <>
          <Text variant="titleLarge" style={s.coverTitle}>
            {"Can't reach the server"}
          </Text>
          <Text variant="bodyLarge" style={[s.coverText, { color: theme.colors.onSurfaceVariant }]}>
            {message ?? 'Check your internet connection and try again.'}
          </Text>
          <Button mode="contained" onPress={retry}>
            Try again
          </Button>
        </>
      ) : (
        <ActivityIndicator size="large" accessibilityLabel="Loading" />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  coverTitle: { fontWeight: '600' },
  coverText: { textAlign: 'center', maxWidth: 360, marginBottom: 8 },
});
