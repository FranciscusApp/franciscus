import { getContext, setContext } from 'svelte';
import type { DbProgress } from './db';

/** Reactive view of the background DB download, owned by the root layout and
 *  read by the DB-gated routes (book, topic-detail) and the hub chrome. The
 *  fields are getters so consumers stay reactive to the layout's `$state`. */
export interface DbState {
	readonly ready: boolean;
	readonly error: string | null;
	readonly progress: DbProgress | null;
	/** True while recovering from a schema mismatch (fetching the new build and
	 *  reloading). DB-gated routes show an "updating" screen instead of an error. */
	readonly updating: boolean;
}

const KEY = Symbol('franciscus-db-state');

export function setDbState(state: DbState): void {
	setContext(KEY, state);
}

export function getDbState(): DbState {
	return getContext(KEY) as DbState;
}
