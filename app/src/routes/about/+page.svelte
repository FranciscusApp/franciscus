<script lang="ts">
    import { t } from '$lib/i18n';
</script>

<main id="main-content" tabindex="-1" class="max-w-4xl mx-auto px-4 py-12">
    <h1 class="text-2xl font-display font-bold text-foreground mb-6">{t('pages.about.title')}</h1>
    <div class="text-foreground leading-relaxed">
        {@html t('pages.about.body')}
    </div>
    <h2 class="text-lg font-display text-foreground mt-10 mb-4">{t('pages.about.techHeading')}</h2>
    <div class="text-muted-foreground leading-relaxed">
        {@html t('pages.about.techBody')}
    </div>
</main>
