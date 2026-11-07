import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { View, useWindowDimensions } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBarItem } from '../../components/TabBarItem';
import type { AppTheme } from '../../theme';

// Bottom navigation: Home, Calendar, Apartments. Headless tabs (expo-router/ui) so the bar can look
// like the rest of the app (Material 3). The triggers must sit directly inside <TabList>.
export default function TabsLayout() {
  const theme = useTheme<AppTheme>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const compact = width > height; // landscape: shorter bar, icon and label side by side

  return (
    <Tabs>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <TabSlot />
      </View>
      <TabList
        style={{
          flexDirection: 'row',
          backgroundColor: theme.colors.elevation.level2,
          borderTopWidth: 1,
          borderTopColor: theme.colors.outlineVariant,
          paddingBottom: insets.bottom,
        }}
      >
        <TabTrigger name="index" href="/" asChild>
          <TabBarItem label="Home" icon="home-variant-outline" activeIcon="home-variant" compact={compact} />
        </TabTrigger>
        <TabTrigger name="calendar" href="/calendar" asChild>
          <TabBarItem label="Calendar" icon="calendar-month-outline" activeIcon="calendar-month" compact={compact} />
        </TabTrigger>
        <TabTrigger name="apartments" href="/apartments" asChild>
          <TabBarItem label="Apartments" icon="office-building-outline" activeIcon="office-building" compact={compact} />
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}
