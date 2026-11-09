import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../services/apiClient';
import { FormVM, type FormDefinition } from './FormVM';

// A small entity, only to exercise the form behaviour that every entity shares.
type Pet = { id: string; name: string; note: string; code: string; active: boolean };
type PetForm = { name: string; note: string; code: string; active: boolean };

const saved: Pet = { id: '1', name: 'Rex', note: 'Good dog', code: 'R-1', active: true };

function definition(over: Partial<FormDefinition<PetForm, Pet>> = {}): FormDefinition<PetForm, Pet> {
  return {
    fields: {
      name: { required: { create: true, edit: true }, validate: (v) => (v.name.trim().length > 10 ? 'Name is too long.' : undefined) },
      note: { required: { create: false, edit: false } },
      code: { required: { create: true, edit: false }, editableInEdit: false, showInView: true },
      active: { required: { create: false, edit: false } },
    },
    empty: { name: '', note: '', code: '', active: true },
    fromSaved: (p) => ({ name: p.name, note: p.note, code: p.code, active: p.active }),
    create: vi.fn(async (v) => ({ id: '2', ...v })),
    update: vi.fn(async (v, _initial, s) => ({ ...s, ...v })),
    ...over,
  };
}

const newForm = (over: Partial<FormDefinition<PetForm, Pet>> = {}, canEdit = true) =>
  new FormVM<PetForm, Pet>({ definition: definition(over), canEdit });
const detailsForm = (over: Partial<FormDefinition<PetForm, Pet>> = {}, canEdit = true) =>
  new FormVM<PetForm, Pet>({ definition: definition(over), saved, canEdit });

describe('a blank create form', () => {
  it('starts empty, editable, with no messages, and Save, Edit and the saved entity all off', () => {
    const s = newForm().getState();
    expect(s.mode).toBe('create');
    expect(s.values).toEqual({ name: '', note: '', code: '', active: true });
    expect(s.errors).toEqual({});
    expect(s.formError).toBeNull();
    expect(s.saved).toBeUndefined();
    expect(s.canSave).toBe(false);
    expect(s.canEdit).toBe(false);
    expect(s.canCancel).toBe(true);
    expect(s.required).toEqual({ name: true, note: false, code: true, active: false });
    expect(s.editable).toEqual({ name: true, note: true, code: true, active: true });
  });

  it('Save turns on only when every required field is filled (spaces do not count)', () => {
    const form = newForm();
    form.setValue('name', 'Rex');
    expect(form.getState().canSave).toBe(false);
    form.setValue('code', '   ');
    expect(form.getState().canSave).toBe(false);
    form.setValue('code', 'R-1');
    expect(form.getState().canSave).toBe(true);
    form.setValue('name', '');
    expect(form.getState().canSave).toBe(false);
  });

  it('a field shows its message only after the user leaves it, and the message goes when the value is fixed', () => {
    const form = newForm();
    form.setValue('name', 'A name that is far too long');
    expect(form.getState().errors).toEqual({}); // still typing
    form.blur('name');
    expect(form.getState().errors).toEqual({ name: 'Name is too long.' });
    form.setValue('name', 'Rex');
    expect(form.getState().errors).toEqual({});
  });

  it('a required field that was left empty says so on blur, with the default message', () => {
    const form = newForm();
    form.blur('code');
    expect(form.getState().errors).toEqual({ code: 'This field is required.' });
    expect(form.getState().errors.note).toBeUndefined();
  });
});

describe('Save', () => {
  it('with a wrong field shows every message, sends nothing and resolves to null', async () => {
    const def = definition();
    const form = new FormVM<PetForm, Pet>({ definition: def, canEdit: true });
    form.setValue('name', 'A name that is far too long');
    expect(await form.submit()).toBeNull();
    expect(def.create).not.toHaveBeenCalled();
    expect(form.getState().errors).toEqual({ name: 'Name is too long.', code: 'This field is required.' });
  });

  it('creates, then shows the saved entity read-only with Edit available', async () => {
    const def = definition();
    const form = new FormVM<PetForm, Pet>({ definition: def, canEdit: true });
    form.setValue('name', 'Rex');
    form.setValue('code', 'R-1');
    expect(await form.submit()).toEqual({ id: '2', name: 'Rex', note: '', code: 'R-1', active: true });
    expect(def.create).toHaveBeenCalledWith({ name: 'Rex', note: '', code: 'R-1', active: true });
    const s = form.getState();
    expect(s.mode).toBe('view');
    expect(s.saved?.id).toBe('2');
    expect(s.errors).toEqual({});
    expect(s.canEdit).toBe(true);
    expect(s.canSave).toBe(false);
    expect(s.dirty).toBe(false);
  });

  it('while sending, Save, Edit and Cancel are off, typing is ignored, and a second Save sends nothing more', async () => {
    let finish!: (p: Pet) => void;
    const create = vi.fn(() => new Promise<Pet>((resolve) => (finish = resolve)));
    const form = newForm({ create });
    form.setValue('name', 'Rex');
    form.setValue('code', 'R-1');
    const first = form.submit();
    expect(form.getState()).toMatchObject({ submitting: true, canSave: false, canCancel: false, canEdit: false });
    form.setValue('name', 'Changed while sending');
    expect(form.getState().values.name).toBe('Rex');
    expect(await form.submit()).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
    finish(saved);
    await first;
    expect(form.getState().submitting).toBe(false);
  });

  it('a server error shows in the banner and under the fields it names; changing a field clears only its own message', async () => {
    const create = vi.fn(async () => {
      throw new ApiError('A pet with this code already exists.', 409, { code: 'This code is already in use.' });
    });
    const form = newForm({ create });
    form.setValue('name', 'Rex');
    form.setValue('code', 'R-1');
    expect(await form.submit()).toBeNull();
    let s = form.getState();
    expect(s.mode).toBe('create');
    expect(s.formError).toBe('A pet with this code already exists.');
    expect(s.errors).toEqual({ code: 'This code is already in use.' });
    expect(s.values.code).toBe('R-1'); // what the user typed is kept
    form.setValue('name', 'Rexy');
    expect(form.getState().errors).toEqual({ code: 'This code is already in use.' });
    form.setValue('code', 'R-2');
    s = form.getState();
    expect(s.errors).toEqual({});
    expect(s.formError).toBe('A pet with this code already exists.'); // the banner stays until the next Save or Cancel
  });

  it('an error that is not an ApiError still gives a readable banner message', async () => {
    const form = newForm({ create: vi.fn(async () => { throw new Error('boom'); }) });
    form.setValue('name', 'Rex');
    form.setValue('code', 'R-1');
    await form.submit();
    expect(form.getState().formError).toBe('boom');
  });

  it('a server message for a field the form does not have only reaches the banner', async () => {
    const form = newForm({ create: vi.fn(async () => { throw new ApiError('Nope.', 400, { unknown: 'x' }); }) });
    form.setValue('name', 'Rex');
    form.setValue('code', 'R-1');
    await form.submit();
    expect(form.getState().errors).toEqual({});
    expect(form.getState().formError).toBe('Nope.');
  });
});

describe('details and edit', () => {
  it('open read-only: the saved values, nothing editable, no Save, Edit only when the caller may edit', () => {
    const s = detailsForm().getState();
    expect(s.mode).toBe('view');
    expect(s.values).toEqual({ name: 'Rex', note: 'Good dog', code: 'R-1', active: true });
    expect(s.editable).toEqual({ name: false, note: false, code: false, active: false });
    expect(s.canSave).toBe(false);
    expect(s.canCancel).toBe(false);
    expect(s.canEdit).toBe(true);
    expect(detailsForm({}, false).getState().canEdit).toBe(false);
  });

  it('typing is ignored in view mode, and Edit does nothing when the caller may not edit', () => {
    const form = detailsForm({}, false);
    form.setValue('name', 'Changed');
    form.startEdit();
    expect(form.getState().values.name).toBe('Rex');
    expect(form.getState().mode).toBe('view');
  });

  it('Edit makes the same form editable, except the fields that never change after creation', () => {
    const form = detailsForm();
    form.startEdit();
    const s = form.getState();
    expect(s.mode).toBe('edit');
    expect(s.editable).toEqual({ name: true, note: true, code: false, active: true });
    expect(s.canEdit).toBe(false);
    expect(s.canCancel).toBe(true);
    form.setValue('code', 'HACK');
    expect(form.getState().values.code).toBe('R-1');
  });

  it('Save is off until something changes, on while it differs, and off again when it is changed back', () => {
    const form = detailsForm();
    form.startEdit();
    expect(form.getState().canSave).toBe(false);
    form.setValue('note', 'Very good dog');
    expect(form.getState()).toMatchObject({ dirty: true, canSave: true });
    form.setValue('note', 'Good dog');
    expect(form.getState()).toMatchObject({ dirty: false, canSave: false });
  });

  it('Save in edit mode updates with the values, the values before, and the saved entity, then goes back to view', async () => {
    const def = definition();
    const form = new FormVM<PetForm, Pet>({ definition: def, saved, canEdit: true });
    form.startEdit();
    form.setValue('note', 'Very good dog');
    const result = await form.submit();
    expect(def.update).toHaveBeenCalledWith(
      { name: 'Rex', note: 'Very good dog', code: 'R-1', active: true },
      { name: 'Rex', note: 'Good dog', code: 'R-1', active: true },
      saved,
    );
    expect(result?.note).toBe('Very good dog');
    const s = form.getState();
    expect(s.mode).toBe('view');
    expect(s.values.note).toBe('Very good dog');
    expect(s.initial.note).toBe('Very good dog');
    expect(s.canEdit).toBe(true);
  });

  it('Cancel puts every field back as it was, clears every message, and returns to view', () => {
    const form = detailsForm();
    form.startEdit();
    form.setValue('name', 'A name that is far too long');
    form.setValue('note', 'Changed');
    form.blur('name');
    expect(form.getState().errors).toEqual({ name: 'Name is too long.' });
    form.cancel();
    const s = form.getState();
    expect(s.mode).toBe('view');
    expect(s.values).toEqual({ name: 'Rex', note: 'Good dog', code: 'R-1', active: true });
    expect(s.errors).toEqual({});
    expect(s.dirty).toBe(false);
    form.startEdit();
    expect(form.getState().errors).toEqual({}); // and the old "left the field" marks are gone too
  });

  it('Cancel also clears a server error, and on a create form it empties the form', async () => {
    const form = detailsForm({ update: vi.fn(async () => { throw new ApiError('Nope.', 403, { name: 'Not allowed.' }); }) });
    form.startEdit();
    form.setValue('note', 'Changed');
    await form.submit();
    expect(form.getState()).toMatchObject({ formError: 'Nope.', errors: { name: 'Not allowed.' } });
    form.cancel();
    expect(form.getState()).toMatchObject({ formError: null, errors: {}, mode: 'view' });

    const create = newForm();
    create.setValue('name', 'Rex');
    create.cancel();
    expect(create.getState()).toMatchObject({ mode: 'create', values: { name: '', note: '', code: '', active: true } });
  });

  it('a blank create form hides a field that only makes sense later', () => {
    const def = definition();
    def.fields.active = { ...def.fields.active, showInCreate: false };
    const form = new FormVM<PetForm, Pet>({ definition: def, canEdit: true });
    expect(form.getState().visible).toEqual({ name: true, note: true, code: true, active: false });
    const details = new FormVM<PetForm, Pet>({ definition: def, saved, canEdit: true });
    expect(details.getState().visible.active).toBe(true);
  });

  it('the read-only view hides a field that is not for display, and shows it again while editing', () => {
    const def = definition();
    def.fields.note = { ...def.fields.note, showInView: false };
    const form = new FormVM<PetForm, Pet>({ definition: def, saved, canEdit: true });
    expect(form.getState().visible).toEqual({ name: true, note: false, code: true, active: true });
    form.startEdit();
    expect(form.getState().visible.note).toBe(true);
  });
});

describe('subscribe', () => {
  it('tells the listener after every change, hands out a new state each time, and stops after unsubscribe', () => {
    const form = newForm();
    const listener = vi.fn();
    const unsubscribe = form.subscribe(listener);
    const before = form.getState();
    form.setValue('name', 'Rex');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(form.getState()).not.toBe(before);
    expect(form.getState()).toBe(form.getState()); // the same snapshot until the next change
    unsubscribe();
    form.setValue('name', 'Rexy');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
