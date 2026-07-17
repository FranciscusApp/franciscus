/**
 * Wide-layout preference: reclaim the decorative gutters on large screens.
 * When on, the ornamental figure is hidden, the Verbum Caro logo drops from
 * its floating corner into the in-flow page bottom, and the wide reading
 * surfaces (parallel reader, study view) stretch to the full viewport width.
 * Toggled from the navbar (xl and up, where the gutters exist); persisted so
 * the choice survives reloads.
 */

const STORAGE_KEY = 'franciscus-wide-layout';

function loadPref(): boolean {
	if (typeof localStorage === 'undefined') return false;
	return localStorage.getItem(STORAGE_KEY) === 'true';
}

let wide = $state(loadPref());

export function getWideLayout(): boolean {
	return wide;
}

export function setWideLayout(on: boolean) {
	wide = on;
	if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, String(on));
}
