/**
 * Site CSS, inlined into every page. Palette matches ethereal.news:
 * #fafafa / #171717 swapped between light and dark. Theme follows
 * prefers-color-scheme unless <html data-theme="light|dark"> overrides it.
 */
export const CSS = `
:root{--bg:#fafafa;--fg:#171717;--muted:#6b6b6b;--rule:#e4e4e4;--err:#b42318;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#171717;--fg:#fafafa;--muted:#9c9c9c;--rule:#2c2c2c;--err:#f97066;color-scheme:dark}}
:root[data-theme=dark]{--bg:#171717;--fg:#fafafa;--muted:#9c9c9c;--rule:#2c2c2c;--err:#f97066;color-scheme:dark}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:44rem;margin:0 auto;padding:1.25rem 1rem 3rem}
header{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem 1rem;margin-bottom:1.5rem}
.brand{font-weight:600;font-size:1.0625rem}
.brand .sep{color:var(--muted);font-weight:400;margin:0 .35rem}
.brand .feed{font-weight:400}
.tools{margin-left:auto;display:flex;gap:1rem;font-size:.8125rem;color:var(--muted)}
#theme{all:unset;cursor:pointer;color:var(--muted);font-size:.8125rem}
#theme:hover{text-decoration:underline}
nav.cats{width:100%;display:flex;flex-wrap:wrap;gap:.2rem .8rem;font-size:.8125rem;color:var(--muted)}
nav.cats a[aria-current]{color:var(--fg);font-weight:600}
main h1{font-size:1.0625rem;font-weight:600;margin:0 0 1rem}
main h1 span{color:var(--muted);font-weight:400}
h2.day{font-size:.75rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:1.75rem 0 .75rem;display:flex;align-items:center;gap:.75rem}
h2.day::after{content:"";flex:1;height:1px;background:var(--rule)}
h2.day:first-child{margin-top:.25rem}
.item{margin:0 0 .95rem}
.item .t{font-weight:500;line-height:1.35}
.item .m{font-size:.8125rem;color:var(--muted);line-height:1.5}
.item .d{font-size:.875rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.empty{color:var(--muted)}
.pager{display:flex;justify-content:space-between;gap:1rem;font-size:.8125rem;color:var(--muted);margin:1.5rem 0 0}
.tablewrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.8125rem;line-height:1.45}
th,td{text-align:left;padding:.35rem .75rem .35rem 0;vertical-align:top;white-space:nowrap}
th{color:var(--muted);font-weight:500}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
td.err{color:var(--err);white-space:normal;min-width:14rem}
td.muted,.muted{color:var(--muted)}
footer{margin-top:3rem;font-size:.8125rem;color:var(--muted);display:flex;flex-wrap:wrap;gap:.25rem 1rem}
`;
