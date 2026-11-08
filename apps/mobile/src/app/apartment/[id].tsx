import { apartmentAmenities, formatArea, formatEur, formatFloor, type ApartmentDetails } from '@delta/core';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, IconButton, Surface, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AmenityChip, InfoRow, Section, StatTile } from '../../components/DetailParts';
import { NoAccess } from '../../components/NoAccess';
import { useApartments } from '../../state/ApartmentsProvider';
import { useAuth } from '../../state/AuthProvider';
import { barColors, type AppTheme } from '../../theme';

// Apartment details, read-only. Reached from the apartments list and by tapping a name in the calendar.
export default function ApartmentDetailsScreen() {
  const { canOpen } = useAuth();
  return canOpen('apartments') ? <ApartmentDetailsContent /> : <NoAccess what="apartment details" />;
}

function ApartmentDetailsContent() {
  const theme = useTheme<AppTheme>();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { byId, hueOf, loading, error, reload } = useApartments();
  const apartment = id ? byId(String(id)) : undefined;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/apartments'));

  return (
    <SafeAreaView style={[s.root, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.topBar}>
        <IconButton icon="arrow-left" mode="contained-tonal" accessibilityLabel="Back" onPress={goBack} />
        <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          Apartment
        </Text>
      </View>

      {apartment ? (
        <ApartmentBody apartment={apartment} hue={hueOf(apartment.name)} />
      ) : (
        <View style={s.center}>
          {loading ? (
            <ActivityIndicator size="large" />
          ) : (
            <>
              <Text variant="bodyLarge" style={s.message}>
                {error ?? 'This apartment could not be found.'}
              </Text>
              <Button mode="contained" onPress={error ? reload : goBack}>
                {error ? 'Try again' : 'Back to apartments'}
              </Button>
            </>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function ApartmentBody({ apartment: a, hue }: { apartment: ApartmentDetails; hue: number }) {
  const theme = useTheme<AppTheme>();
  const colors = barColors(hue, theme.dark);
  const ownerPhone = a.ownerPhone;
  const call = ownerPhone ? () => void Linking.openURL(`tel:${ownerPhone}`).catch(() => undefined) : undefined;
  // Owner contact and rent are left out by the server for roles without the permission: skip them here.
  const showOwner = a.ownerName !== undefined || a.ownerPhone !== undefined;

  return (
    <ScrollView contentContainerStyle={s.content}>
      {/* Hero, tinted with the apartment's own colour, the same one its bars have in the calendar. */}
      <Surface
        elevation={0}
        style={[s.hero, { backgroundColor: colors.background, borderColor: colors.border }]}
        accessibilityRole="header"
      >
        <View style={[s.heroAvatar, { backgroundColor: colors.dot }]}>
          <Text variant="headlineMedium" style={{ color: theme.dark ? '#0E1515' : '#FFFFFF', fontWeight: '700' }}>
            {a.name.charAt(0)}
          </Text>
        </View>
        <View style={s.heroText}>
          <Text variant="headlineMedium" style={{ color: colors.text, fontWeight: '700' }}>
            {a.name}
          </Text>
          <Text variant="bodyMedium" style={{ color: colors.text, opacity: 0.85 }}>
            {a.buildingName} · Apartment {a.apartmentNumber}
          </Text>
        </View>
      </Surface>

      <View style={s.tiles}>
        <StatTile icon="stairs" value={formatFloor(a.floor)} caption="Floor" />
        <StatTile icon="ruler-square" value={formatArea(a.areaM2)} caption="Area" />
        {a.monthlyRentEur !== undefined ? (
          <StatTile icon="currency-eur" value={formatEur(a.monthlyRentEur)} caption="Monthly rent" />
        ) : null}
      </View>

      <Section title="Location">
        <InfoRow icon="map-marker-outline" label="Address" value={a.address} />
        <InfoRow icon="office-building-outline" label="Building" value={a.buildingName} />
        <InfoRow icon="door" label="Apartment number" value={a.apartmentNumber} />
      </Section>

      <Section title="Amenities">
        <View style={s.chips}>
          {apartmentAmenities(a).map((amenity) => (
            <AmenityChip key={amenity.key} amenity={amenity} />
          ))}
        </View>
      </Section>

      {showOwner ? (
        <Section title="Owner">
          {a.ownerName !== undefined ? <InfoRow icon="account-outline" label="Name" value={a.ownerName} /> : null}
          {a.ownerPhone !== undefined ? (
            <InfoRow icon="phone-outline" label="Phone" value={a.ownerPhone} onPress={call} accessibilityHint="Opens the phone app" />
          ) : null}
        </Section>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8 },
  content: { padding: 16, paddingTop: 4, gap: 14, width: '100%', maxWidth: 720, alignSelf: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, borderRadius: 28, borderWidth: 1 },
  heroAvatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  heroText: { flex: 1, gap: 2 },
  tiles: { flexDirection: 'row', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { textAlign: 'center', marginBottom: 12 },
});
