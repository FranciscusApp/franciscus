<script lang="ts">
	import { Dialog } from 'bits-ui';
	import X from '@lucide/svelte/icons/x';
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n';

	// Centered modal on bits-ui's Dialog primitive (same one the Sheet wraps):
	// portal + overlay + focus trap + Escape/backdrop dismiss for free.
	// `initialFocus` redirects the opening focus (e.g. to a search input).
	// `size` 'md' is the compact default; 'lg' is a tall working surface —
	// near-fullscreen on phones — whose children fill the fixed height and
	// manage their own internal scrolling.
	let {
		open = $bindable(false),
		title,
		size = 'md',
		initialFocus,
		children
	}: {
		open: boolean;
		title: string;
		size?: 'md' | 'lg';
		initialFocus?: () => HTMLElement | null;
		children: Snippet;
	} = $props();

	const sizeClasses = $derived(
		size === 'lg'
			? 'inset-x-2 top-2 bottom-2 flex flex-col sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:h-[min(85svh,52rem)] sm:w-[min(100vw-3rem,44rem)]'
			: 'left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2'
	);
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/50" />
		<Dialog.Content
			class="fixed z-50 rounded-lg border border-border bg-popover p-4 shadow-lg {sizeClasses}"
			onOpenAutoFocus={(e) => {
				const el = initialFocus?.();
				if (el) {
					e.preventDefault();
					el.focus();
				}
			}}
		>
			<div class="mb-3 flex items-center justify-between gap-2">
				<Dialog.Title class="min-w-0 truncate text-sm font-medium text-foreground">
					{title}
				</Dialog.Title>
				<Dialog.Close
					aria-label={t('edit.cancel')}
					class="-mr-1 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				>
					<X class="size-4" />
				</Dialog.Close>
			</div>
			{#if size === 'lg'}
				<div class="min-h-0 flex-1">
					{@render children()}
				</div>
			{:else}
				{@render children()}
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
