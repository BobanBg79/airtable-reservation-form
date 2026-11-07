import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';
import type { AppTheme } from '../theme';

interface Props {
  label: string;
  /** Material Community icon names: outline when idle, filled when selected. */
  icon: string;
  activeIcon: string;
  /** Icon and label side by side, in a shorter bar (landscape, where height is precious). */
  compact?: boolean;
  // Provided by expo-router's <TabTrigger asChild>.
  isFocused?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}

/** One destination of the bottom bar, drawn like a Material 3 navigation bar item. */
export function TabBarItem({ label, icon, activeIcon, compact, isFocused, onPress, onLongPress }: Props) {
  const theme = useTheme<AppTheme>();
  const color = isFocused ? theme.colors.onSecondaryContainer : theme.colors.onSurfaceVariant;
  const labelColor = isFocused ? theme.colors.onSurface : theme.colors.onSurfaceVariant;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!isFocused }}
      android_ripple={{ color: `${theme.colors.primary}22`, borderless: false }}
      style={[s.item, compact && s.itemCompact]}
    >
      {/* The background is always present (transparent when idle) and the view is not collapsed:
          Android drops the rounded corners of a view that gets its background only after mounting. */}
      <View
        collapsable={false}
        style={[
          s.indicator,
          compact && s.indicatorCompact,
          { backgroundColor: isFocused ? theme.colors.secondaryContainer : 'transparent' },
        ]}
      >
        <Icon source={isFocused ? activeIcon : icon} size={24} color={color} />
        {compact && (
          <Text variant="labelLarge" style={{ color, marginLeft: 8, fontWeight: isFocused ? '700' : '500' }}>
            {label}
          </Text>
        )}
      </View>
      {!compact && (
        <Text variant="labelMedium" style={{ color: labelColor, marginTop: 4, fontWeight: isFocused ? '700' : '500' }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 12, paddingBottom: 16 },
  itemCompact: { paddingTop: 6, paddingBottom: 6 },
  indicator: {
    width: 64,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  indicatorCompact: { width: undefined, minWidth: 120, height: 40, borderRadius: 20, paddingHorizontal: 16 },
});
