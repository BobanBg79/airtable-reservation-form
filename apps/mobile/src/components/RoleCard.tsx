import { formatRole, type RoleWithPermissions } from '@delta/core';
import { StyleSheet, View } from 'react-native';
import { Chip, Icon, Surface, Text, TouchableRipple, useTheme } from 'react-native-paper';
import type { AppTheme } from '../theme';

interface Props {
  role: RoleWithPermissions;
  onPress?: () => void;
}

/** One row of the Roles list: the role, how many permissions it has, and a note for the admin role (fixed). */
export function RoleCard({ role, onPress }: Props) {
  const theme = useTheme<AppTheme>();
  const count = role.permissions.length;
  const summary = `${count} ${count === 1 ? 'permission' : 'permissions'}`;

  return (
    <Surface elevation={0} style={[s.card, { backgroundColor: theme.colors.elevation.level1, borderColor: theme.colors.outlineVariant }]}>
      <TouchableRipple onPress={onPress} disabled={!onPress} borderless accessibilityRole="button" accessibilityLabel={`${formatRole(role.name)}, ${summary}`}>
        <View style={s.row}>
          <View style={[s.avatar, { backgroundColor: theme.colors.primaryContainer }]}>
            <Icon source={role.isProtected ? 'shield-lock-outline' : 'shield-account-outline'} size={26} color={theme.colors.onPrimaryContainer} />
          </View>
          <View style={s.text}>
            <Text variant="titleMedium" style={s.name}>
              {formatRole(role.name)}
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {summary}
            </Text>
            {role.isProtected ? (
              <View style={s.chips}>
                <Chip compact style={{ backgroundColor: theme.colors.secondaryContainer }} textStyle={{ color: theme.colors.onSecondaryContainer }}>
                  Fixed
                </Chip>
              </View>
            ) : null}
          </View>
          <Icon source="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
        </View>
      </TouchableRipple>
    </Surface>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 14 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  name: { fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 6, marginTop: 6 },
});
