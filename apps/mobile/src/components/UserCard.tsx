import { formatLastLogin, formatRole, userFullName, userInitials, type UserSummary } from '@delta/core';
import { StyleSheet, View } from 'react-native';
import { Chip, Surface, Text, useTheme } from 'react-native-paper';
import type { AppTheme } from '../theme';

interface Props {
  user: UserSummary;
}

/** One row of the Users list: initials, name, email, role, and a note when the user is inactive. */
export function UserCard({ user }: Props) {
  const theme = useTheme<AppTheme>();
  const muted = { color: theme.colors.onSurfaceVariant };

  return (
    <Surface
      elevation={0}
      style={[
        s.card,
        { backgroundColor: theme.colors.elevation.level1, borderColor: theme.colors.outlineVariant },
        !user.isActive && s.inactive,
      ]}
      accessible
      accessibilityLabel={`${userFullName(user)}, ${formatRole(user.role)}${user.isActive ? '' : ', inactive'}`}
    >
      <View style={s.row}>
        <View style={[s.avatar, { backgroundColor: theme.colors.primaryContainer }]}>
          <Text variant="titleMedium" style={{ color: theme.colors.onPrimaryContainer, fontWeight: '700' }}>
            {userInitials(user)}
          </Text>
        </View>
        <View style={s.text}>
          <Text variant="titleMedium" numberOfLines={1} style={s.name}>
            {userFullName(user)}
          </Text>
          <Text variant="bodyMedium" numberOfLines={1} style={muted}>
            {user.email}
          </Text>
          {user.phone ? (
            <Text variant="bodyMedium" numberOfLines={1} style={muted}>
              {user.phone}
            </Text>
          ) : null}
          <Text variant="labelMedium" numberOfLines={1} style={muted}>
            {formatLastLogin(user.lastLoginAt)}
          </Text>
          <View style={s.chips}>
            <Chip
              compact
              style={{ backgroundColor: theme.colors.secondaryContainer }}
              textStyle={{ color: theme.colors.onSecondaryContainer }}
            >
              {formatRole(user.role)}
            </Chip>
            {!user.isActive ? (
              <Chip
                compact
                style={{ backgroundColor: theme.colors.errorContainer }}
                textStyle={{ color: theme.colors.onErrorContainer }}
              >
                Inactive
              </Chip>
            ) : null}
          </View>
        </View>
      </View>
    </Surface>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  inactive: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 14 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  name: { fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
});
