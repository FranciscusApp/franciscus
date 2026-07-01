<script lang="ts">
	import { getDbState } from '$lib/dbState';
	import DbProgressBar from '$lib/DbProgressBar.svelte';
	import { t } from '$lib/i18n';

	// Gate for routes that need the full sql.js database (book / chapter /
	// topic-detail). Hubs render from the manifest and are never wrapped in this.
	let { children } = $props();

	const db = getDbState();
</script>

{#if db.error}
	<main id="main-content" tabindex="-1" class="min-h-screen flex items-center justify-center">
		<p class="text-destructive">{t('app.dbError')} {db.error}</p>
	</main>
{:else if db.updating}
	<main id="main-content" tabindex="-1" class="min-h-screen flex items-center justify-center px-6">
		<p class="text-muted-foreground">{t('app.updating')}</p>
	</main>
{:else if !db.ready}
	<main id="main-content" tabindex="-1" class="min-h-screen flex items-center justify-center px-6">
		<div class="w-full max-w-xs">
			<DbProgressBar progress={db.progress} />
		</div>
	</main>
{:else}
	{@render children()}
{/if}
