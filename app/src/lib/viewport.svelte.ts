/**
 * Track whether the viewport is at least Tailwind's `lg` breakpoint — the gate
 * for the two-column parallel reader (matches the language picker's own lg
 * gating). A rune helper so the chapter reader and topic page share one source
 * of truth; call it once during a component's setup.
 */
export function isLargeViewport() {
	let isLarge = $state(false);
	$effect(() => {
		const mq = matchMedia('(min-width: 1024px)');
		isLarge = mq.matches;
		const onChange = () => (isLarge = mq.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});
	return {
		get current() {
			return isLarge;
		}
	};
}
