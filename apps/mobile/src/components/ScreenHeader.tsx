import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import type { AppTheme } from '../theme';

interface Props {
  /** Small accent line above the title (portrait only). */
  overline?: string;
  title: string;
  subtitle?: string;
}

/**
 * Title block shared by the tab screens, in the same style as the calendar toolbar.
 * In landscape, where height is precious, it shrinks to one line: title and subtitle side by side.
 */
export function ScreenHeader({ overline, title, subtitle }: Props) {
  const theme = useTheme<AppTheme>();
  const { width, height } = useWindowDimensions();

  if (width > height) {
    return (
      <View style={s.landscape}>
        <Text variant="headlineSmall" style={s.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={s.root}>
      {overline ? (
        <Text variant="labelLarge" style={{ color: theme.colors.primary }}>
          {overline}
        </Text>
      ) : null}
      <Text variant="headlineMedium" style={s.title}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, gap: 2 },
  landscape: { flexDirection: 'row', alignItems: 'baseline', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  title: { fontWeight: '600' },
});
