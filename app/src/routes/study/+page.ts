// The study view is client-driven (search + readers need the sql.js DB), but we
// prerender the shell so the no-JS notice and the small-screen message ship as
// static HTML instead of a blank page.
export const prerender = true;
export const ssr = true;
