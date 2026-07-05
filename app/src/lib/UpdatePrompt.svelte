<script lang="ts">
	import { updated } from '$app/stores';
	import { t } from '$lib/i18n';
	import { Button } from '$lib/components/ui/button/index.js';

	// SvelteKit polls the version file (kit.version.pollInterval) and flips
	// `updated` when the live build differs. Force an extra check when the tab
	// regains focus so a returning reader learns about a new build promptly.
	$effect(() => {
		const check = () => {
			if (document.visibilityState === 'visible') updated.check();
		};
		document.addEventListener('visibilitychange', check);
		return () => document.removeEventListener('visibilitychange', check);
	});
</script>

{#if $updated}
	<div class="fixed inset-x-0 bottom-4 z-[60] flex justify-center px-3 pointer-events-none">
		<div
			role="status"
			class="pointer-events-auto flex items-center gap-3 rounded-lg border border-border bg-popover px-4 py-2.5 text-popover-foreground shadow-lg"
		>
			<span class="text-sm">{t('app.updateAvailable')}</span>
			<Button size="sm" onclick={() => location.reload()}>{t('app.updateReload')}</Button>
		</div>
	</div>
{/if}
