<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { t, getUiLang } from '$lib/i18n';
	import { parseCitation, getBibleSource, type ScripturePassage } from '$lib/scripture';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';

	// The raw `to` of the ref being shown, or null when closed. Bindable so the
	// sheet's own dismissals (overlay, Escape, close button) clear it upstream.
	let { to = $bindable<string | null>(null) }: { to: string | null } = $props();

	let passage = $state<ScripturePassage | null>(null);
	let loading = $state(false);
	let failed = $state(false);

	$effect(() => {
		const raw = to;
		const lang = getUiLang();
		if (raw === null) {
			passage = null;
			failed = false;
			return;
		}
		const refs = parseCitation(raw);
		loading = true;
		failed = false;
		passage = null;
		let cancelled = false;
		getBibleSource(lang)
			.resolve(refs ?? [])
			.then((p) => {
				if (!cancelled) {
					passage = p;
					loading = false;
				}
			})
			.catch(() => {
				if (!cancelled) {
					failed = true;
					loading = false;
				}
			});
		return () => {
			cancelled = true;
		};
	});
</script>

<Sheet.Root open={to !== null} onOpenChange={(o) => { if (!o) to = null; }}>
	<Sheet.Content side="bottom" class="mx-auto max-w-2xl gap-0 rounded-t-xl p-0">
		<Sheet.Header class="border-b border-border">
			<Sheet.Title>{t('scripture.title')}</Sheet.Title>
			{#if to}
				<Sheet.Description class="font-mono">{to}</Sheet.Description>
			{/if}
		</Sheet.Header>

		<div class="p-4 text-sm">
			{#if loading}
				<p class="text-muted-foreground">{t('scripture.loading')}</p>
			{:else if failed}
				<p class="text-muted-foreground">{t('scripture.error')}</p>
			{:else if passage?.status === 'link-only'}
				<p class="mb-3 text-muted-foreground">
					{t('scripture.linkIntro').replace('{source}', passage.source)}
				</p>
				<ul class="flex flex-col gap-2">
					{#each passage.links as link}
						<li>
							<a
								href={link.url}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex items-center gap-1.5 font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded"
							>
								{link.label}
								<ExternalLinkIcon class="w-3.5 h-3.5" />
							</a>
						</li>
					{/each}
				</ul>
			{:else if passage?.status === 'unimplemented'}
				<p class="text-muted-foreground">{t('scripture.unavailableLang')}</p>
			{:else if passage?.status === 'unsupported'}
				<p class="text-muted-foreground">{t('scripture.unsupported')}</p>
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>
