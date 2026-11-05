import {
  apartmentHues,
  formatWeekdayShort,
  isWeekend,
  layoutMonth,
  monthDays,
  type CalendarData,
  type ISODate,
  type Reservation,
} from '@delta/core';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { barColors, type AppTheme } from '../theme';

const DAY_W = 46;
const ROW_H = 54;
const NAME_W = 108;
const HEADER_H = 58;
const BAR_GAP = 2;

interface Props {
  data: CalendarData;
  today: ISODate;
  refreshing: boolean;
  onRefresh: () => void;
  onPressBooking: (r: Reservation) => void;
}

export function MonthGrid({ data, today, refreshing, onRefresh, onPressBooking }: Props) {
  const theme = useTheme<AppTheme>();
  const days = useMemo(() => monthDays(data.month), [data.month]);
  const bars = useMemo(() => layoutMonth(data.month, data.reservations), [data]);
  const hues = useMemo(() => apartmentHues(data.apartments.map((a) => a.name)), [data.apartments]);
  const todayIndex = days.indexOf(today);
  const gridW = days.length * DAY_W;

  // Header follows the body's horizontal scroll (native driver on iOS/Android).
  const scrollX = useRef(new Animated.Value(0)).current;
  const hScroll = useRef<{ scrollTo(o: { x: number; animated: boolean }): void } | null>(null);
  useEffect(() => {
    const x = todayIndex > 1 ? (todayIndex - 1) * DAY_W : 0;
    hScroll.current?.scrollTo({ x, animated: false });
  }, [data.month, todayIndex]);

  const s = styles(theme);

  return (
    <ScrollView
      stickyHeaderIndices={[0]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
    >
      {/* Frozen day header */}
      <View style={s.headerRow}>
        <View style={[s.corner, { width: NAME_W }]}>
          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Apartment
          </Text>
        </View>
        <View style={s.headerClip}>
          <Animated.View style={{ flexDirection: 'row', width: gridW, transform: [{ translateX: Animated.multiply(scrollX, -1) }] }}>
            {days.map((d, i) => {
              const isToday = i === todayIndex;
              return (
                <View key={d} style={[s.dayHeader, isWeekend(d) && { backgroundColor: theme.app.weekend }]}>
                  <Text variant="labelSmall" style={{ color: isToday ? theme.colors.primary : theme.colors.onSurfaceVariant }}>
                    {formatWeekdayShort(d)}
                  </Text>
                  <View style={[s.dayNumber, isToday && { backgroundColor: theme.colors.primary }]}>
                    <Text variant="titleSmall" style={{ color: isToday ? theme.colors.onPrimary : theme.colors.onSurface }}>
                      {i + 1}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Animated.View>
        </View>
      </View>

      {/* Body: frozen apartment column + horizontally scrolling grid */}
      <View style={{ flexDirection: 'row' }}>
        <View style={[s.nameColumn, { width: NAME_W }]}>
          {data.apartments.map((a) => (
            <View key={a.id} style={s.nameCell}>
              <View style={[s.dot, { backgroundColor: barColors(hues.get(a.name) ?? 0, theme.dark).dot }]} />
              <Text variant="titleSmall" numberOfLines={1} style={{ flexShrink: 1 }}>
                {a.name}
              </Text>
            </View>
          ))}
        </View>

        <Animated.ScrollView
          ref={hScroll as never}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: Platform.OS !== 'web',
          })}
        >
          <View style={{ width: gridW, height: data.apartments.length * ROW_H }}>
            {/* Column backgrounds: weekends + today */}
            {days.map((d, i) => (
              <View
                key={d}
                style={[
                  s.column,
                  { left: i * DAY_W },
                  isWeekend(d) && { backgroundColor: theme.app.weekend },
                  i === todayIndex && { backgroundColor: theme.app.todayColumn },
                ]}
              />
            ))}

            {data.apartments.map((a, row) => {
              const colors = barColors(hues.get(a.name) ?? 0, theme.dark);
              return (
                <View key={a.id} style={[s.row, { top: row * ROW_H, width: gridW }]}>
                  {(bars.get(a.id) ?? []).map((b) => (
                    <Pressable
                      key={b.reservation.id}
                      onPress={() => onPressBooking(b.reservation)}
                      accessibilityRole="button"
                      accessibilityLabel={`${b.reservation.guest}, ${b.reservation.checkIn} to ${b.reservation.checkOut}`}
                      style={({ pressed }) => [
                        s.bar,
                        {
                          left: b.start * DAY_W + (b.continuesBefore ? 0 : BAR_GAP),
                          width: (b.end - b.start) * DAY_W - (b.continuesBefore ? 0 : BAR_GAP) - (b.continuesAfter ? 0 : BAR_GAP),
                          backgroundColor: colors.background,
                          borderColor: colors.border,
                          borderLeftWidth: b.continuesBefore ? 0 : 3,
                          borderTopLeftRadius: b.continuesBefore ? 0 : 10,
                          borderBottomLeftRadius: b.continuesBefore ? 0 : 10,
                          borderTopRightRadius: b.continuesAfter ? 0 : 10,
                          borderBottomRightRadius: b.continuesAfter ? 0 : 10,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Text variant="labelLarge" numberOfLines={1} style={{ color: colors.text }}>
                        {b.reservation.guest || 'Guest'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              );
            })}
          </View>
        </Animated.ScrollView>
      </View>
    </ScrollView>
  );
}

const styles = (t: AppTheme) =>
  StyleSheet.create({
    headerRow: {
      flexDirection: 'row',
      height: HEADER_H,
      backgroundColor: t.app.headerSurface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.outlineVariant,
    },
    corner: {
      justifyContent: 'flex-end',
      paddingLeft: 16,
      paddingBottom: 10,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: t.colors.outlineVariant,
    },
    headerClip: { flex: 1, overflow: 'hidden' },
    dayHeader: { width: DAY_W, alignItems: 'center', justifyContent: 'center', gap: 2 },
    dayNumber: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    nameColumn: {
      backgroundColor: t.colors.background,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: t.colors.outlineVariant,
    },
    nameCell: {
      height: ROW_H,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingLeft: 16,
      paddingRight: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.app.gridLine,
    },
    dot: { width: 10, height: 10, borderRadius: 5 },
    column: { position: 'absolute', top: 0, bottom: 0, width: DAY_W },
    row: {
      position: 'absolute',
      left: 0,
      height: ROW_H,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.app.gridLine,
    },
    bar: {
      position: 'absolute',
      top: 9,
      height: ROW_H - 18,
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
  });
