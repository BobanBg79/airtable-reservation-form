import { router } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApartmentCard } from '../../components/ApartmentCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useApartments } from '../../state/ApartmentsProvider';
import type { AppTheme } from '../../theme';

// Apartments list: tap a row to open its details.
export default function ApartmentsScreen() {
  const theme = useTheme<AppTheme>();
  const { apartments, loading, refreshing, error, reload, refresh, hueOf } = useApartments();
  const { width } = useWindowDimensions();
  const columns = width >= 600 ? 2 : 1; // two columns on wide screens (a phone in landscape)

  const count = apartments?.length;
  const subtitle = count === undefined ? undefined : `${count} ${count === 1 ? 'apartment' : 'apartments'}`;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <ScreenHeader overline="Delta Apartments" title="Apartments" subtitle={subtitle} />

      {apartments ? (
        <FlatList
          key={columns} // a different column count needs a fresh list
          data={apartments}
          keyExtractor={(a) => a.id}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? s.column : undefined}
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={s.gap} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} />}
          ListEmptyComponent={
            <Text variant="bodyLarge" style={[s.empty, { color: theme.colors.onSurfaceVariant }]}>
              No apartments yet.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={s.cell}>
              <ApartmentCard apartment={item} hue={hueOf(item.name)} onPress={() => router.push(`/apartment/${item.id}`)} />
            </View>
          )}
        />
      ) : error ? (
        <View style={s.center}>
          <Text variant="bodyLarge" style={s.errorText}>
            {error}
          </Text>
          <Button mode="contained" onPress={reload}>
            Try again
          </Button>
        </View>
      ) : (
        <View style={s.center}>{loading && <ActivityIndicator size="large" />}</View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 16, flexGrow: 1 },
  gap: { height: 10 },
  column: { gap: 10 },
  cell: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { textAlign: 'center', marginBottom: 12 },
  empty: { textAlign: 'center', marginTop: 32 },
});
