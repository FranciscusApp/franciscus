// Staged edits live in localStorage (client-only), but we prerender the page so
// the no-JS NoScriptNotice ships in the static HTML. The buffer is rendered
// client-side after mount. Mirrors bookmarks/+page.ts.
export const prerender = true;
export const ssr = true;
