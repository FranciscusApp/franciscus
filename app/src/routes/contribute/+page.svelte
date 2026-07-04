<script lang="ts">
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { t } from '$lib/i18n';
    import * as github from '$lib/github.svelte';
    import type { PageData } from './$types';

    // Corpus provenance comes from the manifest (root layout load), so this hub
    // renders and prerenders without the sql.js DB.
    let { data }: { data: PageData } = $props();

    // Re-check a persisted GitHub session on load; a revoked/expired token drops
    // back to disconnected. Client-only — no-op during prerender/SSR.
    onMount(() => {
        github.revalidate();
    });

    // Friendly, localized message for the last connect error (null when none).
    const connectError = $derived.by(() => {
        const code = github.getError();
        if (!code) return null;
        if (code === 'popup_blocked') return t('pages.contribute.errPopupBlocked');
        if (code === 'popup_closed') return t('pages.contribute.errPopupClosed');
        return t('pages.contribute.errConnect');
    });
    const corpus = $derived(data.manifest.corpus);
    const appLabel = `${__APP_VERSION__}${__APP_COMMIT__ ? ` (${__APP_COMMIT__})` : ''}`;
    // $derived so the localized "texts" label tracks the active UI language.
    const corpusParts = $derived(
        [
            corpus.data_commit,
            corpus.data_commit_date,
            corpus.book_count ? `${corpus.book_count} ${t('pages.contribute.versionBooks')}` : '',
            corpus.languages.join(', ')
        ].filter(Boolean)
    );
</script>

<main id="main-content" tabindex="-1" class="w-full max-w-4xl mx-auto px-4 py-12">
    <h1 class="text-2xl font-display font-bold text-foreground mb-6">{t('pages.contribute.title')}</h1>
    <div class="text-foreground leading-relaxed">
        {@html t('pages.contribute.body')}
    </div>

    <section class="mt-8 border-t border-border pt-6">
        <h2 class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80 mb-3">
            {t('pages.contribute.githubTitle')}
        </h2>
        <div class="text-foreground leading-relaxed">
            {@html t('pages.contribute.githubBody')}
        </div>

        {#if browser}
            {#if github.isConnected()}
                {@const user = github.getUser()}
                <div class="mt-4 flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
                    {#if user}
                        <img
                            src={user.avatarUrl}
                            alt=""
                            width="40"
                            height="40"
                            class="h-10 w-10 shrink-0 rounded-full"
                        />
                        <div class="min-w-0 flex-1">
                            <a
                                href={user.htmlUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                class="block truncate font-medium text-foreground underline decoration-transparent hover:decoration-inherit"
                            >
                                {user.name ?? user.login}
                            </a>
                            <div class="truncate text-sm text-muted-foreground">@{user.login}</div>
                        </div>
                    {/if}
                    <button
                        type="button"
                        onclick={() => github.disconnect()}
                        aria-label={t('pages.contribute.disconnect')}
                        title={t('pages.contribute.disconnect')}
                        class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background sm:px-3"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            class="size-4 sm:hidden"
                            aria-hidden="true"
                        >
                            <path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
                            <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
                            <line x1="8" x2="8" y1="2" y2="4" />
                            <line x1="2" x2="4" y1="8" y2="8" />
                            <line x1="16" x2="16" y1="20" y2="22" />
                            <line x1="20" x2="22" y1="16" y2="16" />
                        </svg>
                        <span class="hidden sm:inline">{t('pages.contribute.disconnect')}</span>
                    </button>
                </div>
            {:else}
                <label class="mt-4 flex items-start gap-2 text-sm text-foreground">
                    <input
                        type="checkbox"
                        checked={github.getConsent()}
                        onchange={(e) => github.setConsent(e.currentTarget.checked)}
                        class="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
                    />
                    <span>{t('pages.contribute.consentLabel')}</span>
                </label>
                <button
                    type="button"
                    disabled={!github.getConsent() || github.isConnecting()}
                    onclick={() => github.connect()}
                    class="mt-4 inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="h-5 w-5" aria-hidden="true">
                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
                    </svg>
                    {github.isConnecting()
                        ? t('pages.contribute.connecting')
                        : t('pages.contribute.connectButton')}
                </button>
            {/if}

            {#if connectError}
                <p class="mt-3 text-sm text-destructive" role="alert">{connectError}</p>
            {/if}
        {:else}
            <p class="mt-4 text-sm text-muted-foreground">{t('pages.contribute.githubNoScript')}</p>
        {/if}
    </section>

    <section class="mt-8 border-t border-border pt-6">
        <h2 class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80 mb-3">
            {t('pages.contribute.connectTitle')}
        </h2>
        <div class="text-foreground leading-relaxed">
            {@html t('pages.contribute.connectBody')}
        </div>
        <a
            href="https://discord.gg/4QWwjRWbT"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 rounded-md bg-[#5865F2] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4752C4] focus:outline-none focus:ring-2 focus:ring-[#5865F2] focus:ring-offset-2 focus:ring-offset-background"
        >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true">
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9554 2.4189-2.1568 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
            </svg>
            {t('pages.contribute.discord')}
        </a>
    </section>

    <section class="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
        <h2 class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80 mb-3">
            {t('pages.contribute.versionTitle')}
        </h2>
        <dl class="space-y-1 tabular-nums">
            <div class="flex gap-2">
                <dt class="font-medium text-foreground">{t('pages.contribute.versionApp')}</dt>
                <dd>{appLabel}</dd>
            </div>
            {#if corpusParts.length}
                <div class="flex gap-2">
                    <dt class="font-medium text-foreground">{t('pages.contribute.versionCorpus')}</dt>
                    <dd>{corpusParts.join(' · ')}</dd>
                </div>
            {/if}
            {#if corpus.built_at}
                <div class="flex gap-2">
                    <dt class="font-medium text-foreground">{t('pages.contribute.versionBuilt')}</dt>
                    <dd>{corpus.built_at}</dd>
                </div>
            {/if}
        </dl>
    </section>
</main>
