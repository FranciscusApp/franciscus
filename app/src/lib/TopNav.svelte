<script lang="ts">
    import * as Sheet from '$lib/components/ui/sheet/index.js';
    import { page } from '$app/stores';
    import { t } from '$lib/i18n';
    import { getTrail } from '$lib/trail.svelte.js';
    import House from '@lucide/svelte/icons/house';
    import Tags from '@lucide/svelte/icons/tags';
    import Bookmark from '@lucide/svelte/icons/bookmark';
    import Info from '@lucide/svelte/icons/info';
    import HeartHandshake from '@lucide/svelte/icons/heart-handshake';
    import BookOpenText from '@lucide/svelte/icons/book-open-text';
    import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
    import X from '@lucide/svelte/icons/x';
    import * as github from '$lib/github.svelte.js';

    // GitHub-style nav cluster: the menu button is always present (mobile and
    // desktop), the logo returns home, and the current page is named beside it.

    // Hubs reset the breadcrumb trail, so they can't source the label from it —
    // they name themselves. Home shows no label (the logo already means home).
    const HUB_LABELS: Record<string, string | null> = {
        '/': null,
        '/topics': 'nav.topics',
        '/about': 'nav.about',
        '/contribute': 'nav.contribute',
        '/bookmarks': 'nav.bookmarks',
        '/contributions': 'nav.myContributions'
    };

    // On hubs use the static name; on content pages (book / chapter / topic) the
    // current page is the last entry the trail recorded.
    const currentPage = $derived.by(() => {
        const routeId = $page.route.id;
        if (routeId && routeId in HUB_LABELS) {
            const key = HUB_LABELS[routeId];
            return key ? t(key) : null;
        }
        const trail = getTrail();
        return trail.length ? trail[trail.length - 1].label : null;
    });

    // The book list comes from the hub manifest loaded by the root layout, so the
    // menu lists every source without waiting on the (12 MB) sql.js DB. Titles
    // are the canonical source-language titles, matching the home sources list.
    const books = $derived($page.data.manifest?.books ?? []);

    // Highlight the entry matching the current route. Books match by id so the
    // open book stays lit while reading its chapters.
    const routeId = $derived($page.route.id);
    const activeBookId = $derived($page.params.book_id);
</script>

<nav aria-label={t('a11y.primaryNav')} class="flex min-w-0 items-center gap-1 text-base sm:gap-2">
    <Sheet.Root>
        <Sheet.Trigger
            aria-label={t('a11y.toggleMenu')}
            class="-ml-1 p-2 pointer-coarse:p-3 rounded-md text-muted-foreground hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
        >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
                <path fill-rule="evenodd" d="M4.5 6.75a.75.75 0 000 1.5h15a.75.75 0 000-1.5h-15zM4.5 11.25a.75.75 0 000 1.5h15a.75.75 0 000-1.5h-15zM4.5 15.75a.75.75 0 000 1.5h15a.75.75 0 000-1.5h-15z" clip-rule="evenodd" />
            </svg>
        </Sheet.Trigger>
        <Sheet.Content side="left" showCloseButton={false} class="flex w-80! flex-col gap-0 overflow-y-auto bg-background p-3">
            <Sheet.Title class="sr-only">{t('a11y.menu')}</Sheet.Title>

            <!-- Brand header: logo returns home (and closes the sheet); the X
                 dismisses without navigating, mirroring GitHub's menu panel. -->
            <div class="mb-2 flex items-center justify-between px-1 pb-2">
                <Sheet.Close>
                    {#snippet child({ props })}
                        <a href="/" {...props} class="flex items-center gap-2 rounded-md focus:outline-none focus:ring-2 focus:ring-ring">
                            <img src="/favicon-round.png" alt="" class="size-8" />
                            <span class="font-display text-lg font-bold text-foreground">{t('app.title')}</span>
                        </a>
                    {/snippet}
                </Sheet.Close>
                <Sheet.Close
                    aria-label={t('a11y.toggleMenu')}
                    class="-mr-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                    <X class="size-5" />
                </Sheet.Close>
            </div>

            <!-- Primary destinations -->
            <div class="flex flex-col">
                <Sheet.Close>
                    {#snippet child({ props })}
                        <a
                            href="/"
                            {...props}
                            aria-current={routeId === '/' ? 'page' : undefined}
                            class="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium"
                        >
                            <House class="size-5 shrink-0 text-muted-foreground group-aria-[current=page]:text-primary" />
                            <span class="text-foreground">{t('nav.home')}</span>
                        </a>
                    {/snippet}
                </Sheet.Close>
                <Sheet.Close>
                    {#snippet child({ props })}
                        <a
                            href="/topics"
                            {...props}
                            aria-current={routeId?.startsWith('/topics') ? 'page' : undefined}
                            class="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium"
                        >
                            <Tags class="size-5 shrink-0 text-muted-foreground group-aria-[current=page]:text-primary" />
                            <span class="text-foreground">{t('nav.topics')}</span>
                        </a>
                    {/snippet}
                </Sheet.Close>
                <Sheet.Close>
                    {#snippet child({ props })}
                        <a
                            href="/bookmarks"
                            {...props}
                            aria-current={routeId === '/bookmarks' ? 'page' : undefined}
                            class="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium"
                        >
                            <Bookmark class="size-5 shrink-0 text-muted-foreground group-aria-[current=page]:text-primary" />
                            <span class="text-foreground">{t('nav.bookmarks')}</span>
                        </a>
                    {/snippet}
                </Sheet.Close>
                {#if github.isConnected()}
                    <Sheet.Close>
                        {#snippet child({ props })}
                            <a
                                href="/contributions"
                                {...props}
                                aria-current={routeId === '/contributions' ? 'page' : undefined}
                                class="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium"
                            >
                                <GitPullRequest class="size-5 shrink-0 text-muted-foreground group-aria-[current=page]:text-primary" />
                                <span class="text-foreground">{t('nav.myContributions')}</span>
                            </a>
                        {/snippet}
                    </Sheet.Close>
                {/if}
            </div>

            <!-- Sources: every book in the corpus, avatar-style chip + title -->
            {#if books.length}
                <div class="my-2 border-t border-border"></div>
                <p class="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('nav.sources')}
                </p>
                <div class="flex flex-col">
                    {#each books as book}
                        <Sheet.Close>
                            {#snippet child({ props })}
                                <a
                                    href="/book/{book.id}"
                                    {...props}
                                    aria-current={activeBookId === book.id ? 'page' : undefined}
                                    class="group flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-accent aria-[current=page]:bg-accent"
                                >
                                    <span
                                        class="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary group-aria-[current=page]:bg-primary/10 group-aria-[current=page]:text-primary"
                                    >
                                        <BookOpenText class="size-4" />
                                    </span>
                                    <span class="min-w-0 flex-1">
                                        <span class="block truncate font-serif text-foreground group-aria-[current=page]:font-medium" title={book.title}>{book.title}</span>
                                        {#if book.author}
                                            <span class="block truncate text-xs text-muted-foreground">{book.author}</span>
                                        {/if}
                                    </span>
                                </a>
                            {/snippet}
                        </Sheet.Close>
                    {/each}
                </div>
            {/if}

            <!-- Meta pages -->
            <div class="my-2 border-t border-border"></div>
            <div class="flex flex-col">
                <Sheet.Close>
                    {#snippet child({ props })}
                        <a
                            href="/about"
                            {...props}
                            aria-current={routeId === '/about' ? 'page' : undefined}
                            class="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium"
                        >
                            <Info class="size-5 shrink-0 text-muted-foreground group-aria-[current=page]:text-primary" />
                            <span class="text-foreground">{t('nav.about')}</span>
                        </a>
                    {/snippet}
                </Sheet.Close>
                <Sheet.Close>
                    {#snippet child({ props })}
                        <a
                            href="/contribute"
                            {...props}
                            aria-current={routeId === '/contribute' ? 'page' : undefined}
                            class="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium"
                        >
                            <HeartHandshake class="size-5 shrink-0 text-muted-foreground group-aria-[current=page]:text-primary" />
                            <span class="text-foreground">{t('nav.contribute')}</span>
                        </a>
                    {/snippet}
                </Sheet.Close>
            </div>
        </Sheet.Content>
    </Sheet.Root>

    <a
        href="/"
        aria-label={t('nav.home')}
        class="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-ring"
    >
        <img src="/favicon-round.png" alt={t('app.title')} class="size-8 pointer-coarse:size-9" />
    </a>

    {#if currentPage}
        <span class="truncate font-semibold text-foreground" title={currentPage}>{currentPage}</span>
    {/if}
</nav>
