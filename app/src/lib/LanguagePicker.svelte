<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import {
		t,
		getUiLang,
		setUiLang,
		getCorpusLang,
		setCorpusLang,
		UI_LANGUAGES
	} from '$lib/i18n';
	import * as github from '$lib/github.svelte.js';
	import { isEditorMode, setEditorMode } from '$lib/edits.svelte.js';
	import Settings from '@lucide/svelte/icons/settings';

	// Corpus translation languages come from the manifest (passed down by the
	// root layout) so the picker works before the sql.js DB has loaded.
	let { languages = [] }: { languages?: string[] } = $props();

	const LANG_LABELS: Record<string, string> = {
		it: 'Italiano',
		en: 'English',
		fr: 'Français',
		de: 'Deutsch',
		es: 'Español'
	};
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class="p-2 pointer-coarse:p-3 rounded-full text-muted-foreground hover:bg-accent transition-colors"
		aria-label={t('a11y.settings')}
	>
		<Settings class="w-6 h-6" />
	</DropdownMenu.Trigger>

	<DropdownMenu.Content
		align="end"
		class="w-56 p-3 space-y-3 bg-popover text-popover-foreground border border-border rounded-lg shadow-lg ring-0"
	>
		<div>
			<label for="corpus-lang" class="block text-xs font-medium text-muted-foreground mb-1">
				{t('language.corpus')}
			</label>
			<select
				id="corpus-lang"
				value={getCorpusLang()}
				onchange={(e) => setCorpusLang((e.target as HTMLSelectElement).value)}
				class="w-full text-sm rounded border border-input bg-background text-foreground px-2 py-1"
			>
				<option value="la">{t('language.original')}</option>
				{#each languages as lang}
					<option value={lang}>{LANG_LABELS[lang] ?? lang}</option>
				{/each}
			</select>
		</div>
		<div>
			<label for="ui-lang" class="block text-xs font-medium text-muted-foreground mb-1">
				{t('language.ui')}
			</label>
			<select
				id="ui-lang"
				value={getUiLang()}
				onchange={(e) => setUiLang((e.target as HTMLSelectElement).value)}
				class="w-full text-sm rounded border border-input bg-background text-foreground px-2 py-1"
			>
				{#each UI_LANGUAGES as lang}
					<option value={lang.code}>{lang.label}</option>
				{/each}
			</select>
		</div>
		{#if github.isConnected()}
			<div class="border-t border-border pt-3">
				<label class="flex items-center justify-between gap-2 text-sm text-foreground">
					<span>{t('edit.editorMode')}</span>
					<input
						type="checkbox"
						checked={isEditorMode()}
						onchange={(e) => setEditorMode((e.target as HTMLInputElement).checked)}
						class="h-4 w-4 rounded border-border"
					/>
				</label>
			</div>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
