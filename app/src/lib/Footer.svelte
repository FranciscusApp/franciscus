<script lang="ts">
    import { t } from '$lib/i18n';
    let { dark }: { dark: boolean } = $props();
</script>

<div class="mt-auto flex flex-col items-center pt-12 pb-8 text-center xl:mt-0 xl:block xl:fixed xl:left-auto xl:right-4 xl:bottom-6 xl:z-40 xl:p-0">
    <div class="inline-flex flex-col items-center gap-3">
        <span class="text-xs uppercase tracking-[0.3em] text-muted-foreground">{t('footer.projectBy')}</span>
        <a href="https://verbumcaro.it" target="_blank" rel="noopener noreferrer" class="inline-flex flex-col items-center gap-2 no-underline">
            <img src={dark ? '/vc-inline-dark.png' : '/vc-inline-light.png'} alt="Verbum Caro" class="h-12 w-auto xl:h-16" />
        </a>
    </div>
</div>
