<script lang="ts">
    import * as Sheet from '$lib/components/ui/sheet/index.js';
    import { t } from '$lib/i18n';
</script>

<nav aria-label={t('a11y.primaryNav')} class="text-sm">
    <!-- Desktop / tablet: simple inline links -->
    <div class="hidden xl:flex items-center gap-4">
        <a href="/" class="text-foreground hover:text-primary">{t('nav.home')}</a>
        <a href="/about" class="text-muted-foreground hover:text-primary">{t('nav.about')}</a>
        <a href="/contribute" class="text-muted-foreground hover:text-primary">{t('nav.contribute')}</a>
        <a href="/contact" class="text-muted-foreground hover:text-primary">{t('nav.contact')}</a>
    </div>

    <!-- Mobile: sheet drawer -->
    <div class="xl:hidden">
        <Sheet.Root>
            <Sheet.Trigger
                aria-label={t('a11y.toggleMenu')}
                class="p-2 pointer-coarse:p-3 rounded text-muted-foreground hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
                    <path fill-rule="evenodd" d="M4.5 6.75a.75.75 0 000 1.5h15a.75.75 0 000-1.5h-15zM4.5 11.25a.75.75 0 000 1.5h15a.75.75 0 000-1.5h-15zM4.5 15.75a.75.75 0 000 1.5h15a.75.75 0 000-1.5h-15z" clip-rule="evenodd" />
                </svg>
            </Sheet.Trigger>
            <Sheet.Content side="left" showCloseButton={false} class="w-72! bg-background p-4">
                <Sheet.Title class="sr-only">{t('a11y.menu')}</Sheet.Title>
                <div class="flex flex-col gap-1">
                    <Sheet.Close>
                        {#snippet child({ props })}
                            <a href="/" {...props} class="block rounded-md py-2.5 text-foreground">{t('nav.home')}</a>
                        {/snippet}
                    </Sheet.Close>
                    <Sheet.Close>
                        {#snippet child({ props })}
                            <a href="/about" {...props} class="block rounded-md py-2.5 text-foreground">{t('nav.about')}</a>
                        {/snippet}
                    </Sheet.Close>
                    <Sheet.Close>
                        {#snippet child({ props })}
                            <a href="/contribute" {...props} class="block rounded-md py-2.5 text-foreground">{t('nav.contribute')}</a>
                        {/snippet}
                    </Sheet.Close>
                    <Sheet.Close>
                        {#snippet child({ props })}
                            <a href="/contact" {...props} class="block rounded-md py-2.5 text-foreground">{t('nav.contact')}</a>
                        {/snippet}
                    </Sheet.Close>
                </div>
            </Sheet.Content>
        </Sheet.Root>
    </div>
</nav>
