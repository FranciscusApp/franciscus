<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import {
		t,
		getUiLang,
		setUiLang,
		getCorpusLang,
		setCorpusLang,
		getParallelReader,
		setParallelReader,
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

	// The left column already shows the original, so parallel mode needs a
	// translation in the corpus slot: prefer the UI language, else the first.
	function defaultTranslation(): string {
		const ui = getUiLang();
		return languages.includes(ui) ? ui : (languages[0] ?? 'la');
	}

	function toggleParallel(on: boolean) {
		if (on && getCorpusLang() === 'la') setCorpusLang(defaultTranslation());
		setParallelReader(on);
	}
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
				<!-- Parallel mode dedicates the left column to the original, so the
				     corpus slot must be a translation — hide the original option. -->
				{#if !getParallelReader()}
					<option value="la">{t('language.original')}</option>
				{/if}
				{#each languages as lang}
					<option value={lang}>{LANG_LABELS[lang] ?? lang}</option>
				{/each}
			</select>
		</div>
		{#if languages.length > 0}
			<!-- Parallel reader is a wide-screen affordance only; hidden below lg. -->
			<div class="hidden lg:block">
				<label class="flex items-center justify-between gap-2 text-sm text-foreground">
					<span>{t('reader.parallel')}</span>
					<input
						type="checkbox"
						checked={getParallelReader()}
						onchange={(e) => toggleParallel((e.target as HTMLInputElement).checked)}
						class="h-4 w-4 rounded border-border"
					/>
				</label>
				<p class="mt-1 text-xs text-muted-foreground">{t('reader.parallelHelp')}</p>
			</div>
		{/if}
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
