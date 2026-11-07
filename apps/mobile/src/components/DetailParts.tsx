import type { Amenity } from '@delta/core';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, Surface, Text, TouchableRipple, useTheme } from 'react-native-paper';
import type { AppTheme } from '../theme';

/** A rounded card with a small accent title, the building block of the detail screen. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme<AppTheme>();
  return (
    <Surface
      elevation={0}
      style={[s.section, { backgroundColor: theme.colors.elevation.level1, borderColor: theme.colors.outlineVariant }]}
    >
      <Text variant="titleSmall" style={{ color: theme.colors.primary, fontWeight: '700' }}>
        {title}
      </Text>
      <View style={s.sectionBody}>{children}</View>
    </Surface>
  );
}

interface InfoRowProps {
  icon: string;
  label: string;
  value: string;
  /** Makes the row tappable (for example to call a number). */
  onPress?: () => void;
  accessibilityHint?: string;
}

/** Icon, a small label and a value. */
export function InfoRow({ icon, label, value, onPress, accessibilityHint }: InfoRowProps) {
  const theme = useTheme<AppTheme>();
  const content = (
    <View style={s.infoRow}>
      <View style={[s.infoIcon, { backgroundColor: theme.colors.secondaryContainer }]}>
        <Icon source={icon} size={20} color={theme.colors.onSecondaryContainer} />
      </View>
      <View style={s.infoText}>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {label}
        </Text>
        <Text variant="bodyLarge">{value}</Text>
      </View>
      {onPress ? <Icon source="chevron-right" size={22} color={theme.colors.onSurfaceVariant} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <TouchableRipple
      onPress={onPress}
      borderless
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint={accessibilityHint}
      style={s.rowTouch}
    >
      {content}
    </TouchableRipple>
  );
}

/** A big value with a small caption, three of them in a row under the title. */
export function StatTile({ icon, value, caption }: { icon: string; value: string; caption: string }) {
  const theme = useTheme<AppTheme>();
  return (
    <Surface
      elevation={0}
      style={[s.tile, { backgroundColor: theme.colors.elevation.level1, borderColor: theme.colors.outlineVariant }]}
    >
      <Icon source={icon} size={22} color={theme.colors.primary} />
      <Text variant="titleMedium" style={s.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {value}
      </Text>
      <Text variant="labelMedium" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ color: theme.colors.onSurfaceVariant }}>
        {caption}
      </Text>
    </Surface>
  );
}

const AMENITY_ICONS: Record<Amenity['key'], string> = {
  bathtub: 'bathtub-outline',
  terrace: 'balcony',
  dishwasher: 'dishwasher',
  parking: 'car',
};

/** An amenity: filled and ticked when the apartment has it, muted and crossed out when it does not. */
export function AmenityChip({ amenity }: { amenity: Amenity }) {
  const theme = useTheme<AppTheme>();
  const has = amenity.available;
  return (
    <View
      accessible
      accessibilityLabel={`${amenity.label}: ${has ? amenity.detail ?? 'yes' : 'no'}`}
      style={[
        s.chip,
        has
          ? { backgroundColor: theme.colors.secondaryContainer, borderColor: 'transparent' }
          : { backgroundColor: 'transparent', borderColor: theme.colors.outlineVariant },
      ]}
    >
      <Icon
        source={AMENITY_ICONS[amenity.key]}
        size={22}
        color={has ? theme.colors.onSecondaryContainer : theme.colors.outline}
      />
      <View style={s.chipText}>
        <Text
          variant="labelLarge"
          style={{
            color: has ? theme.colors.onSecondaryContainer : theme.colors.outline,
            textDecorationLine: has ? 'none' : 'line-through',
          }}
        >
          {amenity.label}
        </Text>
        {has && amenity.detail ? (
          <Text variant="labelSmall" style={{ color: theme.colors.onSecondaryContainer }}>
            {amenity.detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12 },
  sectionBody: { gap: 6 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 6 },
  infoIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  infoText: { flex: 1 },
  rowTouch: { borderRadius: 14, marginHorizontal: -6, paddingHorizontal: 6 },
  tile: { flex: 1, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 4, alignItems: 'flex-start' },
  tileValue: { fontWeight: '700', marginTop: 2 },
  chip: {
    flexGrow: 1,
    flexBasis: 135, // two per row on a phone in portrait
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: { flex: 1 },
});
