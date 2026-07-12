<script lang="ts">
	import { topicColors } from '$lib/topicColors';
	import { t } from '$lib/i18n';
	import X from '@lucide/svelte/icons/x';

	// Autocomplete tags input for topic filtering: chosen topics render as inline
	// pills, typing narrows a suggestion list, only real topics are accepted (no
	// freeform), and Backspace on an empty field pops the last pill. Shared by the
	// advanced search and the relation picker's passage search.
	let {
		options,
		selected = $bindable<string[]>([]),
		placeholder = ''
	}: {
		/** Flattened topic pool; each `value` is the `type:value` key. */
		options: { value: string; label: string; type: string }[];
		/** Selected `type:value` keys (two-way). */
		selected?: string[];
		placeholder?: string;
	} = $props();

	// Unique per instance: the advanced search and the relation picker can both be
	// mounted, so the listbox id must not collide.
	const listboxId = $props.id();

	let query = $state('');
	let focused = $state(false);
	let activeIndex = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);

	const suggestions = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return options
			.filter((o) => !selected.includes(o.value))
			.filter((o) => !q || o.label.toLowerCase().includes(q))
			.slice(0, 8);
	});
	const showDropdown = $derived(focused && suggestions.length > 0);

	// Resolve each selected key to its label/type, falling back to the raw value.
	const pills = $derived(
		selected.map((key) => {
			const found = options.find((o) => o.value === key);
			const colon = key.indexOf(':');
			return {
				key,
				type: found?.type ?? key.slice(0, colon),
				label: found?.label ?? key.slice(colon + 1).replaceAll('_', ' ')
			};
		})
	);

	// Reset the keyboard highlight whenever the query (and thus the list) changes.
	$effect(() => {
		void query;
		activeIndex = 0;
	});

	function add(key: string) {
		if (key && !selected.includes(key)) selected = [...selected, key];
		query = '';
		activeIndex = 0;
		inputEl?.focus();
	}
	function remove(key: string) {
		selected = selected.filter((k) => k !== key);
	}
	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			activeIndex = Math.min(activeIndex + 1, suggestions.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIndex = Math.max(activeIndex - 1, 0);
		} else if (e.key === 'Enter') {
			const pick = suggestions[activeIndex] ?? suggestions[0];
			if (pick) {
				e.preventDefault();
				add(pick.value);
			}
		} else if (e.key === 'Backspace' && query === '' && selected.length) {
			selected = selected.slice(0, -1);
		} else if (e.key === 'Escape') {
			focused = false;
		}
	}
</script>

<div class="relative">
	<div
		class="flex flex-wrap items-center gap-1 rounded border border-input bg-background px-1.5 py-1 focus-within:ring-2 focus-within:ring-ring"
	>
		{#each pills as p (p.key)}
			<span
				class="inline-flex items-center gap-1 max-w-full break-words rounded-full px-2 py-0.5 text-xs {topicColors(
					p.type
				)}"
			>
				{p.label}
				<button
					type="button"
					onclick={() => remove(p.key)}
					aria-label={t('search.removeTopic')}
					class="rounded-full hover:opacity-70 focus:outline-none focus:ring-2 focus:ring-ring"
				>
					<X class="h-3 w-3" />
				</button>
			</span>
		{/each}
		<input
			type="text"
			bind:this={inputEl}
			bind:value={query}
			onfocus={() => (focused = true)}
			onblur={() => setTimeout(() => (focused = false), 120)}
			onkeydown={onKeydown}
			placeholder={selected.length ? '' : placeholder}
			role="combobox"
			aria-expanded={showDropdown}
			aria-controls={listboxId}
			aria-autocomplete="list"
			aria-label={placeholder}
			class="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
		/>
	</div>
	{#if showDropdown}
		<ul
			id={listboxId}
			role="listbox"
			class="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded border border-border bg-popover shadow-lg"
		>
			{#each suggestions as o, i (o.value)}
				<li role="option" aria-selected={i === activeIndex}>
					<button
						type="button"
						onmousedown={(e) => e.preventDefault()}
						onclick={() => add(o.value)}
						class="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-sm hover:bg-accent focus:outline-none {i ===
						activeIndex
							? 'bg-accent'
							: ''}"
					>
						<span class="inline-block h-2 w-2 shrink-0 rounded-full {topicColors(o.type)}"></span>
						<span class="truncate text-foreground">{o.label}</span>
						<span class="ml-auto shrink-0 text-xs text-muted-foreground"
							>{t(`topics.types.${o.type}`)}</span
						>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
