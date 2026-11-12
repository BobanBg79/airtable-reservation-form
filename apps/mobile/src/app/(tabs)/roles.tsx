import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { FlatList, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NoAccess } from '../../components/NoAccess';
import { RoleCard } from '../../components/RoleCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useRolePermissions } from '../../hooks/useRolePermissions';
import { useAuth } from '../../state/AuthProvider';
import type { AppTheme } from '../../theme';

// Roles list (Manage roles). Needs can_view_role (admin only by default). A tap opens the role's permissions.
export default function RolesScreen() {
  const { canOpen } = useAuth();
  return canOpen('roles') ? <RolesContent /> : <NoAccess what="the roles list" />;
}

function RolesContent() {
  const theme = useTheme<AppTheme>();
  const { data, loading, refreshing, error, reload, refresh } = useRolePermissions();
  const { width } = useWindowDimensions();
  const columns = width >= 600 ? 2 : 1;

  // Back from a role screen (after changing permissions): refresh the list quietly. Not on the first visit.
  const seen = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (seen.current) refresh();
      seen.current = true;
    }, [refresh]),
  );

  const count = data?.roles.length;
  const subtitle = count === undefined ? undefined : `${count} ${count === 1 ? 'role' : 'roles'}`;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <ScreenHeader overline="Delta Apartments" title="Roles" subtitle={subtitle} />

      {data ? (
        <FlatList
          key={columns}
          data={data.roles}
          keyExtractor={(r) => r.id}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? s.column : undefined}
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={s.gap} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} />}
          ListEmptyComponent={
            <Text variant="bodyLarge" style={[s.empty, { color: theme.colors.onSurfaceVariant }]}>
              No roles yet.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={s.cell}>
              <RoleCard role={item} onPress={() => router.push(`/role/${item.id}`)} />
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
