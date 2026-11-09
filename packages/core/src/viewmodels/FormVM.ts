import { ApiError } from '../services/apiClient';

// One form behaviour for EVERY entity and EVERY app (mobile, web, ...). The screens only render this state and
// call these commands; nothing about when an error shows, when Save is enabled, when Edit appears, or what
// Cancel restores is decided in a view. Pure TypeScript: no React, no UI. An entity provides a FormDefinition
// (its fields, rules and API calls); see userFormVM.ts.
//
// The behaviour, in one place:
//  - mode 'create' (an empty form), 'view' (read-only details) and 'edit' (the same form made editable);
//  - a field's message shows after the user leaves the field (blur) or after a Save attempt, and the server's
//    message for a field shows until that field is changed; a server error that is not about one field is `formError`
//    (the banner at the top of the form);
//  - Save is enabled only when every required field is filled, nothing is being sent, and (when editing)
//    something has changed; pressing it validates everything first and sends nothing if a field is wrong;
//  - Edit shows only in view mode and only when the caller may edit; Cancel shows in create and edit mode and puts
//    every field back to what it was before the changes, with no messages, and edit goes back to view;
//  - after a successful Save the form shows the saved entity in view mode.

export type FormValue = string | boolean;
export type FormValues = { [field: string]: FormValue };
export type FormMode = 'create' | 'view' | 'edit';
type RuleMode = 'create' | 'edit';

export interface FieldRule<V extends FormValues> {
  /** Required when creating / when editing. Only text fields can be "unfilled". */
  required: { create: boolean; edit: boolean };
  /** The message for a wrong value, or undefined. Called with the mode as a rule mode ('view' counts as 'edit'). */
  validate?: (values: V, mode: RuleMode) => string | undefined;
  /** False for a field that never changes after creation (the email). Default true. */
  editableInEdit?: boolean;
  /** False for a field that is not shown in the read-only view (the password). Default true. */
  showInView?: boolean;
  /** False for a field that is not shown on a blank create form (the "active" switch). Default true. */
  showInCreate?: boolean;
}

export interface FormDefinition<V extends FormValues, S> {
  fields: { [K in keyof V]: FieldRule<V> };
  /** The values of a blank create form. */
  empty: V;
  /** The values that describe a saved entity. */
  fromSaved: (saved: S) => V;
  create: (values: V) => Promise<S>;
  /** `initial` are the values before the changes, `saved` the entity as the server last sent it. */
  update: (values: V, initial: V, saved: S) => Promise<S>;
}

export interface FormOptions<V extends FormValues, S> {
  definition: FormDefinition<V, S>;
  /** A saved entity opens in view mode; none opens a blank create form. */
  saved?: S;
  /** May the caller edit? Decides whether Edit is shown. */
  canEdit: boolean;
}

export interface FormState<V extends FormValues, S> {
  mode: FormMode;
  values: V;
  /** What the form goes back to on Cancel. */
  initial: V;
  /** The entity as last saved (view and edit mode), undefined while creating. */
  saved: S | undefined;
  /** The message to show under each field (only the fields that have one). */
  errors: { [K in keyof V]?: string };
  /** A server error that is not about one field: shown in the banner at the top. */
  formError: string | null;
  submitting: boolean;
  required: { [K in keyof V]: boolean };
  /** Can the user type in the field now? (Never in view mode.) */
  editable: { [K in keyof V]: boolean };
  /** Is the field shown now? */
  visible: { [K in keyof V]: boolean };
  dirty: boolean;
  canSave: boolean;
  canEdit: boolean;
  canCancel: boolean;
}

export class FormVM<V extends FormValues, S> {
  private readonly definition: FormDefinition<V, S>;
  private readonly allowEdit: boolean;
  private readonly keys: (keyof V & string)[];
  private readonly listeners = new Set<() => void>();

  private mode: FormMode;
  private values: V;
  private initial: V;
  private saved: S | undefined;
  private touched = new Set<string>();
  private attempted = false;
  private serverErrors: { [K in keyof V]?: string } = {};
  private formError: string | null = null;
  private submitting = false;
  private snapshot: FormState<V, S>;

  constructor({ definition, saved, canEdit }: FormOptions<V, S>) {
    this.definition = definition;
    this.allowEdit = canEdit;
    this.keys = Object.keys(definition.fields) as (keyof V & string)[];
    this.saved = saved;
    this.mode = saved === undefined ? 'create' : 'view';
    this.initial = saved === undefined ? { ...definition.empty } : definition.fromSaved(saved);
    this.values = { ...this.initial };
    this.snapshot = this.compute();
  }

  getState = (): FormState<V, S> => this.snapshot;

  /** For useSyncExternalStore (React) or any other framework: returns the unsubscribe function. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The user typed or chose something. Ignored for a field that cannot be edited now. */
  setValue = <K extends keyof V & string>(field: K, value: V[K]): void => {
    if (!this.editableNow(field) || this.submitting) return;
    this.values = { ...this.values, [field]: value };
    delete this.serverErrors[field]; // the server's message was about the old value
    this.emit();
  };

  /** The user left the field: from now on its message (if any) is shown. */
  blur = (field: keyof V & string): void => {
    if (this.touched.has(field)) return;
    this.touched.add(field);
    this.emit();
  };

  /** Edit: the read-only view becomes the form. Only when the caller may edit. */
  startEdit = (): void => {
    if (!this.snapshot.canEdit) return;
    this.mode = 'edit';
    this.formError = null;
    this.emit();
  };

  /** Cancel: every field goes back to what it was before the changes, the messages go away, edit goes back to view. */
  cancel = (): void => {
    if (!this.snapshot.canCancel) return;
    this.values = this.mode === 'create' ? { ...this.definition.empty } : { ...this.initial };
    this.resetFeedback();
    if (this.mode === 'edit') this.mode = 'view';
    this.emit();
  };

  /**
   * Save: checks every field first (and shows the messages) and sends nothing if one is wrong. Resolves to the
   * saved entity, or null when nothing was saved (not allowed now, a wrong field, or the server refused it; its
   * message is then in the state).
   */
  submit = async (): Promise<S | null> => {
    if (this.mode === 'view' || this.submitting) return null;
    this.attempted = true;
    if (Object.keys(this.messages(true)).length > 0) {
      this.emit();
      return null;
    }
    this.submitting = true;
    this.formError = null;
    this.serverErrors = {};
    this.emit();
    try {
      const saved =
        this.mode === 'create'
          ? await this.definition.create(this.values)
          : await this.definition.update(this.values, this.initial, this.saved as S);
      this.saved = saved;
      this.initial = this.definition.fromSaved(saved);
      this.values = { ...this.initial };
      this.mode = 'view';
      this.resetFeedback();
      return saved;
    } catch (e) {
      this.formError = e instanceof Error ? e.message : 'Something went wrong. Try again.';
      if (e instanceof ApiError && e.fields) {
        for (const field of this.keys) if (e.fields[field]) this.serverErrors[field] = e.fields[field];
      }
      return null;
    } finally {
      this.submitting = false;
      this.emit();
    }
  };

  // ---- internals ----

  private ruleMode(): RuleMode {
    return this.mode === 'create' ? 'create' : 'edit';
  }

  private editableNow(field: keyof V & string): boolean {
    return this.mode === 'create' || (this.mode === 'edit' && this.definition.fields[field].editableInEdit !== false);
  }

  private isFilled(field: string): boolean {
    const value = this.values[field];
    return typeof value === 'string' ? value.trim() !== '' : true;
  }

  /**
   * The messages of the fields that have one: the server's, then the field's own rule, then "required". A field
   * that cannot be edited now has nothing to fix, so it has no message. `all` ignores whether the field was
   * left yet (a Save attempt looks at every field).
   */
  private messages(all: boolean): { [K in keyof V]?: string } {
    const out: { [K in keyof V]?: string } = {};
    if (this.mode === 'view') return out;
    const rule = this.ruleMode();
    for (const field of this.keys) {
      if (!this.editableNow(field)) continue;
      const server = this.serverErrors[field];
      if (server) {
        out[field] = server;
        continue;
      }
      if (!all && !this.attempted && !this.touched.has(field)) continue;
      const fieldRule = this.definition.fields[field];
      let message = fieldRule.validate?.(this.values, rule);
      if (!message && fieldRule.required[rule] && !this.isFilled(field)) message = 'This field is required.';
      if (message) out[field] = message;
    }
    return out;
  }

  private resetFeedback(): void {
    this.touched = new Set();
    this.attempted = false;
    this.serverErrors = {};
    this.formError = null;
  }

  private emit(): void {
    this.snapshot = this.compute();
    for (const listener of this.listeners) listener();
  }

  private compute(): FormState<V, S> {
    const rule = this.ruleMode();
    const required = {} as { [K in keyof V]: boolean };
    const editable = {} as { [K in keyof V]: boolean };
    const visible = {} as { [K in keyof V]: boolean };
    let requiredFilled = true;
    let dirty = false;
    for (const field of this.keys) {
      const fieldRule = this.definition.fields[field];
      required[field] = fieldRule.required[rule];
      editable[field] = this.editableNow(field);
      visible[field] = this.mode === 'view' ? fieldRule.showInView !== false : this.mode === 'create' ? fieldRule.showInCreate !== false : true;
      if (editable[field] && required[field] && !this.isFilled(field)) requiredFilled = false;
      if (this.values[field] !== this.initial[field]) dirty = true;
    }
    return {
      mode: this.mode,
      values: this.values,
      initial: this.initial,
      saved: this.saved,
      errors: this.messages(false),
      formError: this.formError,
      submitting: this.submitting,
      required,
      editable,
      visible,
      dirty,
      canSave: this.mode !== 'view' && requiredFilled && !this.submitting && (this.mode === 'create' || dirty),
      canEdit: this.mode === 'view' && this.allowEdit && !this.submitting,
      canCancel: this.mode !== 'view' && !this.submitting,
    };
  }
}
