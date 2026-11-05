import {
  addMonths,
  formatDisplayDate,
  formatMonthTitle,
  formatNights,
  monthOf,
  todayInBelgrade,
  type Reservation,
} from '@delta/core';
import { useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { ActivityIndicator, Button, Dialog, IconButton, Portal, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MonthGrid } from '../components/MonthGrid';
import { useCalendarData } from '../hooks/useCalendarData';
import type { AppTheme } from '../theme';

export default function CalendarScreen() {
  const theme = useTheme<AppTheme>();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const today = useMemo(() => todayInBelgrade(), []);
  const [month, setMonth] = useState(() => monthOf(today));
  const [selected, setSelected] = useState<Reservation | null>(null);
  const { data, loading, refreshing, error, reload, refresh } = useCalendarData(month);

  const apartmentName = selected && data?.apartments.find((a) => a.id === selected.apartmentId)?.name;
  const stays = data?.reservations.length ?? 0;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      {/* Nav sits next to the title, leaving the top-right corner free (Expo Go's dev gear lives there). */}
      <View style={[s.toolbar, landscape && s.toolbarLandscape]}>
        <View style={landscape ? s.titleLandscape : { flexShrink: 1 }}>
          {!landscape && (
            <Text variant="labelLarge" style={{ color: theme.colors.primary }}>
              Delta Apartments
            </Text>
          )}
          <Text variant={landscape ? 'titleMedium' : 'headlineSmall'} style={{ fontWeight: '600' }}>
            {formatMonthTitle(month)}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {data ? `${stays} ${stays === 1 ? 'stay' : 'stays'} · ${data.apartments.length} apartments` : ' '}
          </Text>
        </View>
        <IconButton
          icon="chevron-left"
          mode="contained-tonal"
          size={landscape ? 18 : 24}
          style={landscape ? s.navLandscape : undefined}
          accessibilityLabel="Previous month"
          onPress={() => setMonth((m) => addMonths(m, -1))}
        />
        <IconButton
          icon="chevron-right"
          mode="contained-tonal"
          size={landscape ? 18 : 24}
          style={landscape ? s.navLandscape : undefined}
          accessibilityLabel="Next month"
          onPress={() => setMonth((m) => addMonths(m, 1))}
        />
        <Button compact mode="text" onPress={() => setMonth(monthOf(today))} disabled={month === monthOf(today)}>
          Today
        </Button>
      </View>

      <View style={[s.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
        {data ? (
          <MonthGrid data={data} today={today} refreshing={refreshing} onRefresh={refresh} onPressBooking={setSelected} />
        ) : error ? (
          <View style={s.center}>
            <Text variant="bodyLarge" style={{ textAlign: 'center', marginBottom: 12 }}>
              {error}
            </Text>
            <Button mode="contained" onPress={reload}>
              Try again
            </Button>
          </View>
        ) : (
          <View style={s.center}>{loading && <ActivityIndicator size="large" />}</View>
        )}
      </View>

      <Portal>
        <Dialog visible={!!selected} onDismiss={() => setSelected(null)} style={{ maxWidth: 420, width: '90%', alignSelf: 'center' }}>
          {/* No Fragment here: Paper's Dialog clones its first child with a `style` prop, which Fragment rejects. */}
          {selected && <Dialog.Title>{selected.guest || 'Guest'}</Dialog.Title>}
          {selected && (
            <Dialog.Content style={{ gap: 12 }}>
              <Detail label="Apartment" value={apartmentName ?? '—'} />
              <Detail label="Check-in" value={formatDisplayDate(selected.checkIn)} />
              <Detail label="Check-out" value={formatDisplayDate(selected.checkOut)} />
              <Detail label="Length" value={formatNights(selected.checkIn, selected.checkOut)} />
            </Dialog.Content>
          )}
          {selected && (
            <Dialog.Actions>
              <Button onPress={() => setSelected(null)}>Close</Button>
            </Dialog.Actions>
          )}
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View>
      <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        {label}
      </Text>
      <Text variant="bodyLarge">{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  toolbarLandscape: { paddingVertical: 0, paddingHorizontal: 12 },
  titleLandscape: { flexShrink: 1, flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  navLandscape: { width: 32, height: 32, margin: 2 },
  card: { flex: 1, marginHorizontal: 12, marginBottom: 12, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
