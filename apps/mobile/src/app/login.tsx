import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Icon, Text, TextInput, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../state/AuthProvider';
import type { AppTheme } from '../theme';

// Sign in with email and password. The server answers every failure with the same message, and limits
// repeated failures (429); both are shown as they come. There is no "forgot password": the admin sets a new one.
export default function LoginScreen() {
  const theme = useTheme<AppTheme>();
  const { signIn } = useAuth();
  // Paper's ref type does not line up with React Native 0.88's TextInput types, so keep only what is used.
  const passwordRef = useRef<{ focus: () => void } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim() !== '' && password !== '' && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const message = await signIn(email.trim(), password);
    // On success the router moves on (this screen is protected: it disappears once signed in).
    if (message) {
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={[s.logo, { backgroundColor: theme.colors.primaryContainer }]}>
            <Icon source="home-city-outline" size={32} color={theme.colors.onPrimaryContainer} />
          </View>
          <Text variant="labelLarge" style={{ color: theme.colors.primary }}>
            Delta Apartments
          </Text>
          <Text variant="headlineMedium" style={s.title}>
            Sign in
          </Text>

          <TextInput
            mode="outlined"
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            editable={!submitting}
            style={s.input}
          />
          <TextInput
            ref={(r: unknown) => {
              passwordRef.current = r as { focus: () => void } | null;
            }}
            mode="outlined"
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            editable={!submitting}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                onPress={() => setShowPassword((v) => !v)}
              />
            }
            style={s.input}
          />

          <HelperText type="error" visible={!!error} style={s.error} accessibilityLiveRegion="polite">
            {error ?? ' '}
          </HelperText>

          <Button mode="contained" onPress={submit} loading={submitting} disabled={!canSubmit} contentStyle={s.buttonContent}>
            Sign in
          </Button>
          <Text variant="bodySmall" style={[s.hint, { color: theme.colors.onSurfaceVariant }]}>
            Forgot your password? Ask an administrator to set a new one.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 8, width: '100%', maxWidth: 440, alignSelf: 'center' },
  logo: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { fontWeight: '600', marginBottom: 12 },
  input: { backgroundColor: 'transparent' },
  error: { fontSize: 14, minHeight: 28 },
  buttonContent: { paddingVertical: 6 },
  hint: { textAlign: 'center', marginTop: 12 },
});
