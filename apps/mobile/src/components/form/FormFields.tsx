import type { FormState, FormValues, FormVM } from '@delta/core';
import { useState } from 'react';
import { StyleSheet, View, type KeyboardTypeOptions, type TextInputProps } from 'react-native';
import { Button, HelperText, Icon, Menu, Surface, Switch, Text, TextInput, TouchableRipple, useTheme } from 'react-native-paper';
import type { AppTheme } from '../../theme';

// Generic form pieces: they only DRAW the state of a FormVM (packages/core) and call its commands. When a message
// shows, what is required, what can be edited and which buttons are on is decided there, the same for every
// entity and every app. Nothing in this file knows about users, apartments or reservations.

interface FieldProps<V extends FormValues, S> {
  form: FormVM<V, S>;
  state: FormState<V, S>;
  field: keyof V & string;
  label: string;
}

/** "First name *" for a required field. */
function labelOf<V extends FormValues, S>({ state, field, label }: FieldProps<V, S>): string {
  return state.required[field] ? `${label} *` : label;
}

/** A field that cannot be edited now: the label and the value as plain text. */
function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  const theme = useTheme<AppTheme>();
  return (
    <View style={s.readOnly} accessible accessibilityLabel={`${label}: ${value || 'empty'}`}>
      <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        {label}
      </Text>
      <Text variant="bodyLarge">{value || '—'}</Text>
    </View>
  );
}

function Message({ text }: { text?: string }) {
  return (
    <HelperText type="error" visible={!!text} padding="none" style={s.message}>
      {text ?? ' '}
    </HelperText>
  );
}

interface TextFieldProps<V extends FormValues, S> extends FieldProps<V, S> {
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  /** A password: hidden while typing, with a show/hide toggle. */
  secret?: boolean;
}

export function FormTextField<V extends FormValues, S>(props: TextFieldProps<V, S>) {
  const { form, state, field, label, keyboardType, autoCapitalize, secret } = props;
  const [hidden, setHidden] = useState(true);
  if (!state.visible[field]) return null;
  const value = String(state.values[field]);
  if (!state.editable[field]) return <ReadOnlyValue label={label} value={value} />;

  const message = state.errors[field];
  return (
    <View>
      <TextInput
        mode="outlined"
        label={labelOf(props)}
        value={value}
        onChangeText={(text) => form.setValue(field, text as V[typeof field])}
        onBlur={() => form.blur(field)}
        error={!!message}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        autoCorrect={false}
        secureTextEntry={secret && hidden}
        right={secret ? <TextInput.Icon icon={hidden ? 'eye-outline' : 'eye-off-outline'} onPress={() => setHidden((h) => !h)} /> : undefined}
        disabled={state.submitting}
      />
      <Message text={message} />
    </View>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps<V extends FormValues, S> extends FieldProps<V, S> {
  options: readonly SelectOption[];
}

/** A dropdown: the value is the id of the chosen option. */
export function FormSelectField<V extends FormValues, S>(props: SelectFieldProps<V, S>) {
  const { form, state, field, label, options } = props;
  const [open, setOpen] = useState(false);
  if (!state.visible[field]) return null;
  const selected = options.find((o) => o.value === state.values[field]);
  if (!state.editable[field]) return <ReadOnlyValue label={label} value={selected?.label ?? ''} />;

  const message = state.errors[field];
  const close = () => {
    setOpen(false);
    form.blur(field);
  };
  return (
    <View>
      <Menu
        visible={open}
        onDismiss={close}
        anchor={
          <TouchableRipple onPress={() => setOpen(true)} disabled={state.submitting} accessibilityRole="button" accessibilityLabel={`${label}, ${selected?.label ?? 'not chosen'}`}>
            <View pointerEvents="none">
              <TextInput
                mode="outlined"
                label={labelOf(props)}
                value={selected?.label ?? ''}
                editable={false}
                error={!!message}
                right={<TextInput.Icon icon="menu-down" />}
              />
            </View>
          </TouchableRipple>
        }
      >
        {options.map((option) => (
          <Menu.Item
            key={option.value}
            title={option.label}
            leadingIcon={option.value === state.values[field] ? 'check' : undefined}
            onPress={() => {
              form.setValue(field, option.value as V[typeof field]);
              close();
            }}
          />
        ))}
      </Menu>
      <Message text={message} />
    </View>
  );
}

/** An on/off switch. Read-only it is a plain "Yes" or "No". */
export function FormSwitchField<V extends FormValues, S>(props: FieldProps<V, S>) {
  const { form, state, field, label } = props;
  const theme = useTheme<AppTheme>();
  if (!state.visible[field]) return null;
  const on = state.values[field] === true;
  if (!state.editable[field]) return <ReadOnlyValue label={label} value={on ? 'Yes' : 'No'} />;

  const message = state.errors[field];
  return (
    <View>
      <View style={s.switchRow}>
        <Text variant="bodyLarge" style={s.switchLabel}>
          {labelOf(props)}
        </Text>
        <Switch value={on} onValueChange={(next) => form.setValue(field, next as V[typeof field])} disabled={state.submitting} accessibilityLabel={label} />
      </View>
      {message ? <Message text={message} /> : <View style={{ height: theme.roundness }} />}
    </View>
  );
}

/** The error that is not about one field (for example "No connection"), at the top of the form. */
export function FormBanner({ message }: { message: string | null }) {
  const theme = useTheme<AppTheme>();
  if (!message) return null;
  return (
    <Surface elevation={0} style={[s.banner, { backgroundColor: theme.colors.errorContainer }]} accessibilityRole="alert">
      <Icon source="alert-circle-outline" size={22} color={theme.colors.onErrorContainer} />
      <Text variant="bodyMedium" style={[s.bannerText, { color: theme.colors.onErrorContainer }]}>
        {message}
      </Text>
    </Surface>
  );
}

interface ActionsProps<V extends FormValues, S> {
  form: FormVM<V, S>;
  state: FormState<V, S>;
  /** The Save button, e.g. "Add user" or "Save changes". */
  saveLabel: string;
}

/** Edit in the read-only view; Cancel and Save while creating or editing. Which one is on comes from the state. */
export function FormActions<V extends FormValues, S>({ form, state, saveLabel }: ActionsProps<V, S>) {
  return (
    <View style={s.actions}>
      {state.canEdit ? (
        <Button mode="contained" icon="pencil-outline" onPress={form.startEdit}>
          Edit
        </Button>
      ) : null}
      {state.mode !== 'view' ? (
        <>
          <Button mode="outlined" onPress={form.cancel} disabled={!state.canCancel} style={s.action}>
            Cancel
          </Button>
          <Button mode="contained" onPress={() => void form.submit()} disabled={!state.canSave} loading={state.submitting} style={s.action}>
            {saveLabel}
          </Button>
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  readOnly: { gap: 2, paddingVertical: 8 },
  message: { marginTop: 2, minHeight: 20 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  switchLabel: { flex: 1 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16 },
  bannerText: { flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' },
  action: { minWidth: 120 },
});
