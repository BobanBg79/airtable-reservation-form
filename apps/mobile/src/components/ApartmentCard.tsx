import { apartmentLocationLine, apartmentSubtitle, formatEur, type ApartmentDetails } from '@delta/core';
import { StyleSheet, View } from 'react-native';
import { Icon, Surface, Text, TouchableRipple, useTheme } from 'react-native-paper';
import { barColors, type AppTheme } from '../theme';

interface Props {
  apartment: ApartmentDetails;
  hue: number;
  onPress: () => void;
}

/** One row of the apartments list: coloured initial, name, one line of facts, rent and a chevron. */
export function ApartmentCard({ apartment, hue, onPress }: Props) {
  const theme = useTheme<AppTheme>();
  const colors = barColors(hue, theme.dark);

  return (
    <Surface
      elevation={0}
      style={[s.card, { backgroundColor: theme.colors.elevation.level1, borderColor: theme.colors.outlineVariant }]}
    >
      <TouchableRipple
        onPress={onPress}
        borderless
        accessibilityRole="button"
        accessibilityLabel={`${apartment.name}, ${apartmentSubtitle(apartment)}`}
        style={s.touch}
      >
        <View style={s.row}>
          <View style={[s.avatar, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text variant="titleLarge" style={{ color: colors.text, fontWeight: '700' }}>
              {apartment.name.charAt(0)}
            </Text>
          </View>
          <View style={s.text}>
            <Text variant="titleMedium" numberOfLines={1} style={{ fontWeight: '600' }}>
              {apartment.name}
            </Text>
            <Text
              variant="bodyMedium"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {apartmentLocationLine(apartment)}
            </Text>
          </View>
          {/* The rent is left out by the server for roles without can_view_apartment_rent. */}
          {apartment.monthlyRentEur !== undefined ? (
            <View style={s.rent}>
              <Text variant="titleSmall" style={{ color: theme.colors.primary, fontWeight: '700' }}>
                {formatEur(apartment.monthlyRentEur)}
              </Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                / month
              </Text>
            </View>
          ) : null}
          <Icon source="chevron-right" size={22} color={theme.colors.onSurfaceVariant} />
        </View>
      </TouchableRipple>
    </Surface>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  touch: { borderRadius: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 14 },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  rent: { alignItems: 'flex-end' },
});
