<script lang="ts">
	import { Dialog } from 'bits-ui';
	import X from '@lucide/svelte/icons/x';
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n';

	// Small centered modal on bits-ui's Dialog primitive (same one the Sheet
	// wraps): portal + overlay + focus trap + Escape/backdrop dismiss for free.
	// `initialFocus` redirects the opening focus (e.g. to a search input).
	let {
		open = $bindable(false),
		title,
		initialFocus,
		children
	}: {
		open: boolean;
		title: string;
		initialFocus?: () => HTMLElement | null;
		children: Snippet;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/50" />
		<Dialog.Content
			class="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-popover p-4 shadow-lg"
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
			{@render children()}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
