import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApartmentsProvider } from '../state/ApartmentsProvider';
import { darkTheme, lightTheme } from '../theme';

// Root stack: the tabs (Home, Calendar, Apartments) sit at the bottom of it, and a detail screen
// (apartment/[id]) is pushed on top, so Back always returns to where the user came from, the
// calendar or the list.
export default function RootLayout() {
  const dark = useColorScheme() === 'dark';
  const theme = dark ? darkTheme : lightTheme;

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <ApartmentsProvider>
          <StatusBar style={dark ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          />
        </ApartmentsProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
