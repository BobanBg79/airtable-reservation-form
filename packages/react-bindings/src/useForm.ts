import type { FormState, FormValues, FormVM } from '@delta/core';
import { useSyncExternalStore } from 'react';

/**
 * The state of a FormVM (packages/core), re-rendering the component whenever it changes. This is the only React
 * part of the forms: every rule (messages, when Save is enabled, Edit, Cancel) lives in the ViewModel, so the
 * mobile app and the web app show exactly the same behaviour and only differ in how they draw it.
 */
export function useForm<V extends FormValues, S>(vm: FormVM<V, S>): FormState<V, S> {
  return useSyncExternalStore(vm.subscribe, vm.getState, vm.getState);
}
