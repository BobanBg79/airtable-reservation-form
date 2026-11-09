import { formatRole, userFullName, type FormVM, type RoleOption, type UserFormData, type UserSummary } from '@delta/core';
import { useForm } from '@delta/react-bindings';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, IconButton, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserForm } from '../hooks/useUserForm';
import type { AppTheme } from '../theme';
import { FormActions, FormBanner, FormSelectField, FormSwitchField, FormTextField } from './form/FormFields';

interface Props {
  /** The user to show and edit; none is the Add user form. */
  id?: string;
}

/**
 * The screen of one user: the Add user form (no id) or the user's details, read-only with an Edit button (an id).
 * Both are the same form (FormVM in packages/core); this file only lays it out.
 */
export function UserFormScreen({ id }: Props) {
  const theme = useTheme<AppTheme>();
  const loaded = useUserForm(id);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/users'));

  return (
    <SafeAreaView style={[s.root, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.topBar}>
        <IconButton icon="arrow-left" mode="contained-tonal" accessibilityLabel="Back" onPress={goBack} />
        <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {id ? 'User' : 'Add user'}
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
        <UserFields form={loaded.form} roles={loaded.roles} />
      )}
    </SafeAreaView>
  );
}

function UserFields({ form, roles }: { form: FormVM<UserFormData, UserSummary>; roles: RoleOption[] }) {
  const theme = useTheme<AppTheme>();
  const state = useForm(form);
  const options = roles.map((r) => ({ value: r.id, label: formatRole(r.name) }));
  const field = { form, state } as const;

  return (
    <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text variant="headlineSmall" style={s.title}>
          {state.saved ? userFullName(state.saved) : 'New user'}
        </Text>
        {state.mode !== 'view' ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Fields marked * are required.
          </Text>
        ) : null}

        <FormBanner message={state.formError} />

        <FormTextField {...field} field="email" label="Email" keyboardType="email-address" autoCapitalize="none" />
        <FormTextField {...field} field="firstName" label="First name" />
        <FormTextField {...field} field="lastName" label="Last name" />
        <FormTextField {...field} field="phone" label="Phone" keyboardType="phone-pad" autoCapitalize="none" />
        <FormSelectField {...field} field="roleId" label="Role" options={options} />
        <FormTextField {...field} field="password" label={state.mode === 'create' ? 'Password' : 'New password (optional)'} autoCapitalize="none" secret />
        <FormSwitchField {...field} field="isActive" label="Active" />

        <FormActions form={form} state={state} saveLabel={state.mode === 'create' ? 'Add user' : 'Save changes'} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 4 },
  content: { padding: 20, gap: 6, paddingBottom: 32 },
  title: { fontWeight: '600', marginBottom: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  message: { textAlign: 'center' },
});
