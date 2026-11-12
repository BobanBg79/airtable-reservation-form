import { formatRole, groupPermissions, type FormVM, type RoleFormData, type RoleWithPermissions } from '@delta/core';
import { useForm } from '@delta/react-bindings';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, IconButton, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoleForm } from '../hooks/useRoleForm';
import type { AppTheme } from '../theme';
import { FormActions, FormBanner, FormSwitchField } from './form/FormFields';

/**
 * The permissions of one role, as switches grouped by entity: read-only with an Edit button (the admin role has
 * none, it is fixed). The same form behaviour as every other form (FormVM in packages/core); this file only
 * lays it out.
 */
export function RoleFormScreen({ id }: { id: string }) {
  const theme = useTheme<AppTheme>();
  const loaded = useRoleForm(id);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/roles'));

  return (
    <SafeAreaView style={[s.root, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.topBar}>
        <IconButton icon="arrow-left" mode="contained-tonal" accessibilityLabel="Back" onPress={goBack} />
        <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          Role
        </Text>
      </View>

      {loaded.status === 'loading' ? (
        <View style={s.center}>
          <ActivityIndicator size="large" accessibilityLabel="Loading" />
        </View>
      ) : loaded.status === 'error' ? (
        <View style={s.center}>
          <Text variant="bodyLarge" style={s.message}>
            {loaded.message}
          </Text>
          <Button mode="contained" onPress={loaded.reload}>
            Try again
          </Button>
        </View>
      ) : (
        <RoleFields form={loaded.form} permissionNames={loaded.permissionNames} />
      )}
    </SafeAreaView>
  );
}

function RoleFields({ form, permissionNames }: { form: FormVM<RoleFormData, RoleWithPermissions>; permissionNames: string[] }) {
  const theme = useTheme<AppTheme>();
  const state = useForm(form);
  const groups = groupPermissions(permissionNames);
  const role = state.saved;
  const field = { form, state } as const;

  return (
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text variant="headlineSmall" style={s.title}>
        {role ? formatRole(role.name) : 'Role'}
      </Text>
      {role?.isProtected ? (
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          The admin role has every permission and cannot be changed.
        </Text>
      ) : null}

      <FormBanner message={state.formError} />

      {groups.map((group) => (
        <View key={group.entity} style={s.group}>
          <Text variant="titleSmall" style={[s.groupTitle, { color: theme.colors.primary }]}>
            {group.title}
          </Text>
          {group.items.map((item) => (
            <View key={item.name}>
              <FormSwitchField {...field} field={item.name} label={item.label} />
              {state.mode === 'edit' && state.editable[item.name] === false ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Only the admin can have this permission.
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ))}

      <FormActions form={form} state={state} saveLabel="Save permissions" />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 4 },
  content: { padding: 20, gap: 8, paddingBottom: 32 },
  title: { fontWeight: '600', marginBottom: 4 },
  group: { gap: 2, marginTop: 8 },
  groupTitle: { fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  message: { textAlign: 'center' },
});
