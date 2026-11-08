import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button, Icon, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AppTheme } from '../theme';

interface Props {
  /** What the user tried to open, e.g. "the users list". */
  what: string;
}

/**
 * Shown instead of a screen the signed-in user has no permission for, reached by a stale route or a link.
 * This is only about the experience: the server refuses the data anyway (403).
 */
export function NoAccess({ what }: Props) {
  const theme = useTheme<AppTheme>();
  return (
    <SafeAreaView style={[s.root, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <View style={s.center} accessibilityRole="alert">
        <View style={[s.icon, { backgroundColor: theme.colors.secondaryContainer }]}>
          <Icon source="lock-outline" size={32} color={theme.colors.onSecondaryContainer} />
        </View>
        <Text variant="headlineSmall" style={s.title}>
          No access
        </Text>
        <Text variant="bodyLarge" style={[s.text, { color: theme.colors.onSurfaceVariant }]}>
          Your account is not allowed to open {what}. If you need it, ask an administrator.
        </Text>
        <Button mode="contained-tonal" onPress={() => router.replace('/')}>
          Go to Home
        </Button>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  icon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontWeight: '600' },
  text: { textAlign: 'center', maxWidth: 360, marginBottom: 8 },
});
