<script lang="ts">
	import { getAvailableCorpusLanguages } from '$lib';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import {
		t,
		getUiLang,
		setUiLang,
		getCorpusLang,
		setCorpusLang,
		UI_LANGUAGES
	} from '$lib/i18n';

	const LANG_LABELS: Record<string, string> = {
		la: 'Latina',
		it: 'Italiano',
		en: 'English',
		fr: 'Français',
		de: 'Deutsch',
		es: 'Español'
	};

	const corpusLanguages = getAvailableCorpusLanguages();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class="p-2 pointer-coarse:p-3 rounded-full text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
		aria-label="Language settings"
	>
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
			<path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" clip-rule="evenodd"/>
			<path d="M10 3.5c-1.38 0-2.87 2.24-3.25 5.5h6.5c-.38-3.26-1.87-5.5-3.25-5.5ZM6.75 11c.38 3.26 1.87 5.5 3.25 5.5s2.87-2.24 3.25-5.5h-6.5ZM3.5 10c0-.52.06-1.02.17-1.5h2.6a14 14 0 0 0 0 3h-2.6A6.5 6.5 0 0 1 3.5 10Zm10.23 1.5a14 14 0 0 0 0-3h2.6c.11.48.17.98.17 1.5s-.06 1.02-.17 1.5h-2.6Z"/>
		</svg>
	</DropdownMenu.Trigger>

	<DropdownMenu.Content
		align="end"
		class="w-56 p-3 space-y-3 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg ring-0"
	>
		<div>
			<label for="corpus-lang" class="block text-xs font-medium text-stone-500 dark:text-stone-400 mb-1">
				{t('language.corpus')}
			</label>
			<select
				id="corpus-lang"
				value={getCorpusLang()}
				onchange={(e) => setCorpusLang((e.target as HTMLSelectElement).value)}
				class="w-full text-sm rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-200 px-2 py-1"
			>
				<option value="la">{t('language.original')}</option>
				{#each corpusLanguages as lang}
					<option value={lang}>{LANG_LABELS[lang] ?? lang}</option>
				{/each}
			</select>
		</div>
		<div>
			<label for="ui-lang" class="block text-xs font-medium text-stone-500 dark:text-stone-400 mb-1">
				{t('language.ui')}
			</label>
			<select
				id="ui-lang"
				value={getUiLang()}
				onchange={(e) => setUiLang((e.target as HTMLSelectElement).value)}
				class="w-full text-sm rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-200 px-2 py-1"
			>
				{#each UI_LANGUAGES as lang}
					<option value={lang.code}>{lang.label}</option>
				{/each}
			</select>
		</div>
	</DropdownMenu.Content>
</DropdownMenu.Root>
