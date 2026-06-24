<script lang="ts">
    let open = $state(false);

    function toggleMenu() {
        open = !open;
    }
</script>

<nav class="text-sm z-50 pointer-events-auto">
    <!-- Desktop / tablet: simple inline links -->
    <div class="hidden md:flex items-center gap-4">
        <a href="/" class="text-stone-600 dark:text-stone-300 hover:text-stone-800 dark:hover:text-stone-100">Home</a>
        <a href="/about" class="text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-100">About</a>
        <a href="/contribute" class="text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-100">Contribute</a>
        <a href="/contact" class="text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-100">Contact</a>
    </div>

    <!-- Mobile: toggle button -->
    <div class="md:hidden">
        <button type="button" onclick={toggleMenu} aria-label="Toggle menu" aria-expanded={open} class="relative z-50 p-2 rounded text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400">
            {#if open}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
                    <path fill-rule="evenodd" d="M6.72 4.72a.75.75 0 011.06 0L12 8.94l4.22-4.22a.75.75 0 111.06 1.06L13.06 10l4.22 4.22a.75.75 0 11-1.06 1.06L12 11.06l-4.22 4.22a.75.75 0 11-1.06-1.06L10.94 10 6.72 5.78a.75.75 0 010-1.06z" clip-rule="evenodd" />
                </svg>
            {:else}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
                    <path fill-rule="evenodd" d="M4.5 6.75a.75.75 0 000 1.5h15a.75.75 0 000-1.5h-15zM4.5 11.25a.75.75 0 000 1.5h15a.75.75 0 000-1.5h-15zM4.5 15.75a.75.75 0 000 1.5h15a.75.75 0 000-1.5h-15z" clip-rule="evenodd" />
                </svg>
            {/if}
        </button>

        {#if open}
            <div class="fixed inset-0 z-40 bg-black/30 pointer-events-auto" role="presentation" onclick={toggleMenu}></div>
            <aside class="fixed inset-y-0 left-0 w-72 bg-white dark:bg-stone-900 z-50 p-4 shadow-lg pointer-events-auto">
                <div class="flex flex-col gap-4">
                    <a href="/" onclick={toggleMenu} class="text-stone-700 dark:text-stone-200">Home</a>
                    <a href="/about" onclick={toggleMenu} class="text-stone-700 dark:text-stone-200">About</a>
                    <a href="/contribute" onclick={toggleMenu} class="text-stone-700 dark:text-stone-200">Contribute</a>
                    <a href="/contact" onclick={toggleMenu} class="text-stone-700 dark:text-stone-200">Contact</a>
                </div>
            </aside>
        {/if}
    </div>
</nav>
