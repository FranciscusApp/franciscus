<script lang="ts">
    import * as Sheet from '$lib/components/ui/sheet/index.js';
    import { t } from '$lib/i18n';
</script>

<nav aria-label={t('a11y.primaryNav')} class="text-sm">
    <!-- Desktop / tablet: simple inline links -->
    <div class="hidden xl:flex items-center gap-4">
        <a href="/" class="text-stone-600 dark:text-stone-300 hover:text-stone-800 dark:hover:text-stone-100">Home</a>
        <a href="/about" class="text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-100">About</a>
        <a href="/contribute" class="text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-100">Contribute</a>
        <a href="/contact" class="text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-100">Contact</a>
    </div>

    <!-- Mobile: sheet drawer -->
    <div class="xl:hidden">
        <Sheet.Root>
            <Sheet.Trigger
                aria-label="Toggle menu"
                class="p-2 pointer-coarse:p-3 rounded text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
                    <path fill-rule="evenodd" d="M4.5 6.75a.75.75 0 000 1.5h15a.75.75 0 000-1.5h-15zM4.5 11.25a.75.75 0 000 1.5h15a.75.75 0 000-1.5h-15zM4.5 15.75a.75.75 0 000 1.5h15a.75.75 0 000-1.5h-15z" clip-rule="evenodd" />
                </svg>
            </Sheet.Trigger>
            <Sheet.Content side="left" showCloseButton={false} class="w-72! bg-white dark:bg-stone-900 p-4">
                <Sheet.Title class="sr-only">Menu</Sheet.Title>
                <div class="flex flex-col gap-1">
                    <Sheet.Close>
                        {#snippet child({ props })}
                            <a href="/" {...props} class="block rounded-md py-2.5 text-stone-700 dark:text-stone-200">Home</a>
                        {/snippet}
                    </Sheet.Close>
                    <Sheet.Close>
                        {#snippet child({ props })}
                            <a href="/about" {...props} class="block rounded-md py-2.5 text-stone-700 dark:text-stone-200">About</a>
                        {/snippet}
                    </Sheet.Close>
                    <Sheet.Close>
                        {#snippet child({ props })}
                            <a href="/contribute" {...props} class="block rounded-md py-2.5 text-stone-700 dark:text-stone-200">Contribute</a>
                        {/snippet}
                    </Sheet.Close>
                    <Sheet.Close>
                        {#snippet child({ props })}
                            <a href="/contact" {...props} class="block rounded-md py-2.5 text-stone-700 dark:text-stone-200">Contact</a>
                        {/snippet}
                    </Sheet.Close>
                </div>
            </Sheet.Content>
        </Sheet.Root>
    </div>
</nav>
