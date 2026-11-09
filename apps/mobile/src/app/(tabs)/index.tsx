import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Icon, Surface, Text, TouchableRipple, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApartments } from '../../state/ApartmentsProvider';
import { useAuth } from '../../state/AuthProvider';
import type { AppTheme } from '../../theme';

// Home: greets the signed-in user, shortcuts to the screens they may open, and Sign out.
export default function HomeScreen() {
  const theme = useTheme<AppTheme>();
  const { apartments } = useApartments();
  const { session, canOpen, signOut, signOutAll } = useAuth();
  const count = apartments?.length;
  const firstName = session?.user.firstName;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.content}>
        <Surface
          elevation={0}
          style={[s.hero, { backgroundColor: theme.colors.primaryContainer, borderRadius: 28 }]}
        >
          <View style={[s.heroIcon, { backgroundColor: theme.colors.primary }]}>
            <Icon source="hand-wave" size={30} color={theme.colors.onPrimary} />
          </View>
          <View style={s.heroText}>
            <Text variant="labelLarge" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.8 }}>
              Delta Apartments
            </Text>
            <Text variant="displaySmall" style={{ color: theme.colors.onPrimaryContainer, fontWeight: '600' }}>
              {firstName ? `Hello, ${firstName}` : 'Hello'}
            </Text>
            <Text variant="bodyLarge" style={{ color: theme.colors.onPrimaryContainer }}>
              Everything about your stays and apartments, in one place.
            </Text>
          </View>
        </Surface>

        <Text variant="titleMedium" style={[s.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>
          Where to?
        </Text>

        <View style={s.cards}>
          {canOpen('calendar') ? (
            <ShortcutCard
              icon="calendar-month"
              title="Calendar"
              subtitle="See every stay, apartment by apartment"
              onPress={() => router.navigate('/calendar')}
            />
          ) : null}
          {canOpen('apartments') ? (
            <ShortcutCard
              icon="office-building"
              title="Apartments"
              subtitle={count === undefined ? 'Details of each apartment' : `${count} ${count === 1 ? 'apartment' : 'apartments'}, with all their details`}
              onPress={() => router.navigate('/apartments')}
            />
          ) : null}
          {canOpen('users') ? (
            <ShortcutCard
              icon="account-group"
              title="Users"
              subtitle="Who can sign in, and as what"
              onPress={() => router.navigate('/users')}
            />
          ) : null}
          {!canOpen('calendar') && !canOpen('apartments') && !canOpen('users') ? (
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
              Your account has no screens yet. Ask an administrator to give you access.
            </Text>
          ) : null}
        </View>

        <View style={s.account}>
          {session ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Signed in as {session.user.email}
            </Text>
          ) : null}
          <Button mode="outlined" icon="logout" onPress={() => void signOut()}>
            Sign out
          </Button>
          <Button mode="text" icon="logout-variant" onPress={() => void signOutAll()}>
            Sign out of all devices
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ShortcutCard({ icon, title, subtitle, onPress }: { icon: string; title: string; subtitle: string; onPress: () => void }) {
  const theme = useTheme<AppTheme>();
  return (
    <Surface elevation={0} style={[s.card, { backgroundColor: theme.colors.elevation.level1, borderColor: theme.colors.outlineVariant }]}>
      <TouchableRipple onPress={onPress} borderless accessibilityRole="button" accessibilityLabel={title} style={s.cardTouch}>
        <View style={s.cardInner}>
          <View style={[s.cardIcon, { backgroundColor: theme.colors.secondaryContainer }]}>
            <Icon source={icon} size={26} color={theme.colors.onSecondaryContainer} />
          </View>
          <View style={s.cardText}>
            <Text variant="titleMedium" style={{ fontWeight: '600' }}>
              {title}
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {subtitle}
            </Text>
          </View>
          <Icon source="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
        </View>
      </TouchableRipple>
    </Surface>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 16, width: '100%', maxWidth: 880, alignSelf: 'center' },
  hero: { padding: 24, flexDirection: 'row', alignItems: 'center', gap: 20, overflow: 'hidden' },
  heroIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  heroText: { flex: 1, gap: 4 },
  sectionTitle: { marginTop: 8, marginLeft: 4 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  account: { marginTop: 16, gap: 8, alignItems: 'flex-start' },
  card: { flexGrow: 1, flexBasis: 300, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cardTouch: { borderRadius: 20 },
  cardInner: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  cardIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, gap: 2 },
});
