/**
 * Site CSS, inlined into every page. Mirrors ethereal.news: 640px column with
 * 0.75rem padding, #fafafa / #171717 swapped between light and dark, muted
 * nav at 60% that goes full on hover. Theme follows prefers-color-scheme (the
 * "system" preference) unless <html data-theme="light|dark"> overrides it.
 */
const LIGHT = `--bg:#fafafa;--fg:#171717;--muted:#6b6b6b;--nav:rgba(0,0,0,.6);--rule:#e4e4e4;--edge:rgba(0,0,0,.15);--hover:rgba(0,0,0,.05);--err:#b42318;color-scheme:light`;
const DARK = `--bg:#171717;--fg:#fafafa;--muted:#9c9c9c;--nav:rgba(255,255,255,.6);--rule:#2c2c2c;--edge:rgba(255,255,255,.2);--hover:rgba(255,255,255,.05);--err:#f97066;color-scheme:dark`;

export const CSS = `
:root{${LIGHT}}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${DARK}}}
:root[data-theme=dark]{${DARK}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
main a:hover{text-decoration:underline}
svg{display:block}
.wrap{max-width:640px;margin:0 auto;padding:1rem .75rem 2.5rem}

/* header */
header{margin-bottom:1.25rem}
.bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem 1.5rem;min-height:2.5rem}
.brand{display:flex;align-items:center;gap:.5rem;font-weight:600;white-space:nowrap}
.brand .home{display:flex;align-items:center;gap:.5rem}
.brand .sub{color:var(--nav);font-weight:400}
.brand .sep{margin-right:.5rem}
.brand .sub a{transition:color .3s}
.brand .sub a:hover{color:var(--fg)}
nav.top{display:flex;align-items:center;gap:1.5rem;font-size:.875rem;text-transform:lowercase}
nav.top a,#theme{color:var(--nav);transition:color .3s}
nav.top a:hover,#theme:hover{color:var(--fg)}
#theme{all:unset;cursor:pointer;display:flex;color:var(--nav);transition:color .3s}
/* icon shows the chosen preference: monitor = system (no data-theme), sun = light, moon = dark */
#theme .sun,#theme .moon{display:none}
:root[data-theme=light] #theme .sun{display:block}
:root[data-theme=dark] #theme .moon{display:block}
:root[data-theme=light] #theme .system,:root[data-theme=dark] #theme .system{display:none}
nav.cats{display:flex;flex-wrap:wrap;gap:.15rem 1rem;margin-top:.5rem;font-size:.75rem;color:var(--nav)}
nav.cats a{transition:color .3s}
nav.cats a:hover,nav.cats a[aria-current]{color:var(--fg)}
nav.cats a[aria-current]{font-weight:600}

/* river */
main h1{font-size:1.0625rem;font-weight:600;margin:0 0 1rem}
main h1 span{color:var(--muted);font-weight:400}
h2.day{font-size:.75rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:1.75rem 0 .75rem;display:flex;align-items:center;gap:.75rem}
h2.day::after{content:"";flex:1;height:1px;background:var(--rule)}
h2.day:first-child{margin-top:.25rem}
.item{margin:0 0 1.1rem}
.item .s{font-size:.75rem;color:var(--muted);letter-spacing:.02em;line-height:1.5}
.item .s a:hover{color:var(--fg)}
.item .t{font-weight:500;line-height:1.35}
.item .d{font-size:1rem;color:var(--fg);opacity:.8;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.item .m{font-size:.75rem;color:var(--muted);letter-spacing:.02em;line-height:1.6;margin-top:.1rem}
.empty{color:var(--muted)}
.pager{display:flex;justify-content:space-between;gap:1rem;font-size:.8125rem;color:var(--muted);margin:1.5rem 0 0}

/* sources table */
.tablewrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.8125rem;line-height:1.45}
th,td{text-align:left;padding:.35rem .75rem .35rem 0;vertical-align:top;white-space:nowrap}
th{color:var(--muted);font-weight:500}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
td.err{color:var(--err);white-space:normal;min-width:14rem}
td.muted,.muted{color:var(--muted)}

/* footer */
footer{margin-top:3rem;font-size:.875rem}
footer .row{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.pill{all:unset;cursor:pointer;position:relative;display:inline-flex;align-items:center;padding:.375rem .75rem .375rem 2rem;border:1px solid var(--edge);border-radius:.25rem;font-size:.875rem;line-height:1.25;transition:background-color .3s}
.pill:hover{background:var(--hover)}
.pill svg{position:absolute;left:.625rem;top:50%;transform:translateY(-50%)}
footer .icons{display:flex;gap:.75rem;margin-top:.5rem}
footer .icons a{color:var(--nav);transition:color .3s}
footer .icons a:hover{color:var(--fg)}
`;
