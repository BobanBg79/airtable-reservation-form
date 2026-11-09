import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { FlatList, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ActivityIndicator, Button, FAB, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NoAccess } from '../../components/NoAccess';
import { ScreenHeader } from '../../components/ScreenHeader';
import { UserCard } from '../../components/UserCard';
import { useUsers } from '../../hooks/useUsers';
import { useAuth } from '../../state/AuthProvider';
import type { AppTheme } from '../../theme';

// Users list. Needs can_view_user (admin only by default). A tap opens the details (with Edit); "Add user" needs can_create_user.
export default function UsersScreen() {
  const { canOpen } = useAuth();
  return canOpen('users') ? <UsersContent /> : <NoAccess what="the users list" />;
}

function UsersContent() {
  const theme = useTheme<AppTheme>();
  const { can } = useAuth();
  const { users, loading, refreshing, error, reload, refresh } = useUsers();
  // Back from a user screen (after adding or editing): refresh the list quietly. Not on the first visit, which loads it.
  const seen = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (seen.current) refresh();
      seen.current = true;
    }, [refresh]),
  );
  const { width } = useWindowDimensions();
  const columns = width >= 600 ? 2 : 1; // two columns on wide screens (a phone in landscape)

  const count = users?.length;
  const subtitle = count === undefined ? undefined : `${count} ${count === 1 ? 'user' : 'users'}`;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <ScreenHeader overline="Delta Apartments" title="Users" subtitle={subtitle} />

      {users ? (
        <FlatList
          key={columns} // a different column count needs a fresh list
          data={users}
          keyExtractor={(u) => u.id}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? s.column : undefined}
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={s.gap} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} />}
          ListEmptyComponent={
            <Text variant="bodyLarge" style={[s.empty, { color: theme.colors.onSurfaceVariant }]}>
              No users yet.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={s.cell}>
              <UserCard user={item} onPress={() => router.push(`/user/${item.id}`)} />
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
      {can('can_create_user') ? (
        <FAB icon="account-plus-outline" label="Add user" style={s.fab} onPress={() => router.push('/user/new')} accessibilityLabel="Add user" />
      ) : null}
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
  fab: { position: 'absolute', right: 16, bottom: 16 },
});
