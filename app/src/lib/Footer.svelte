<script lang="ts">
    let { dark }: { dark: boolean } = $props();
</script>

<div class="fixed left-1/2 bottom-4 z-40 -translate-x-1/2 md:left-auto md:right-4 md:translate-x-0 md:bottom-6 text-center">
    <div class="inline-flex flex-col items-center gap-3">
        <span class="text-xs uppercase tracking-[0.3em] text-stone-500 dark:text-stone-400">A project by</span>
        <a href="https://verbumcaro.it" target="_blank" rel="noopener noreferrer" class="inline-flex flex-col items-center gap-2 no-underline">
            <img src={dark ? '/vc-inline-dark.png' : '/vc-inline-light.png'} alt="Verbum Caro" class="h-12 w-auto md:h-16" />
        </a>
    </div>
</div>
