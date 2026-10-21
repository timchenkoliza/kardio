// Rendered audit of kardio pages: screenshots, computed text styles, contrast, targets, axe.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2];
const BASE = 'https://kardio-eta.vercel.app';
const ROUTES = ['/cardiology', '/cardiology/agents', '/cardiology/materials', '/cardiology/settings', '/cardiology/content/video-ah-current', '/oncology'];
const VIEWS = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }];
const AXE = fs.readFileSync(path.join(__dirname, 'node_modules/axe-core/axe.min.js'), 'utf8');

function collect() {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const hex = (o) => '#' + [o.r, o.g, o.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const lum = (o) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(o.r) + 0.7152 * f(o.g) + 0.0722 * f(o.b); };
  const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  function bgOf(el) {
    let layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return { img: true };
      const c = parse(cs.backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) bg = blend(layers[i], bg);
    return bg;
  }
  const out = { texts: [], targets: [], headings: [], imgs: [], h1: 0, fonts: {} };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode; const txt = t.textContent.replace(/\s+/g, ' ').trim(); if (!txt) continue;
    const el = t.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
    if (el.closest('svg')) { /* svg text */ }
    const fs = parseFloat(cs.fontSize); const lh = cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight);
    const fg = parse(cs.color); const bg = bgOf(el);
    let ratio = null, fgh = null, bgh = null;
    if (fg && !bg.img) { const f = blend(fg, bg); const l1 = lum(f), l2 = lum(bg); ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); fgh = hex(f); bgh = hex(bg); }
    const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '';
    const anc = el.closest('[class]');
    out.texts.push({ txt: txt.slice(0, 80), tag: el.tagName.toLowerCase(), cls: String(cls).slice(0, 80), anc: anc ? String(anc.className.baseVal ?? anc.className).slice(0, 60) : '', fs, lh, lhr: lh ? +(lh / fs).toFixed(2) : null, fw: cs.fontWeight, ff: cs.fontFamily.split(',')[0], fg: fgh, colorRaw: cs.color, bg: bgh, ratio: ratio ? +ratio.toFixed(2) : null, tt: cs.textTransform, svg: !!el.closest('svg') });
    out.fonts[cs.fontFamily] = (out.fonts[cs.fontFamily] || 0) + 1;
  }
  document.querySelectorAll('a[href], button, [role=button], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])').forEach(el => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') return;
    const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.value || '').replace(/\s+/g, ' ').trim();
    out.targets.push({ tag: el.tagName.toLowerCase(), cls: String(el.className.baseVal ?? el.className).slice(0, 70), name: name.slice(0, 60), w: Math.round(r.width), h: Math.round(r.height), inText: !!el.closest('p, li') && el.tagName === 'A' });
  });
  document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => { const r = h.getBoundingClientRect(); if (r.height) out.headings.push(h.tagName + ': ' + h.innerText.replace(/\s+/g, ' ').trim().slice(0, 70)); });
  out.h1 = document.querySelectorAll('h1').length;
  document.querySelectorAll('img').forEach(i => out.imgs.push({ src: i.getAttribute('src').slice(0, 80), alt: i.getAttribute('alt') }));
  out.svgsUnlabeled = [...document.querySelectorAll('svg')].filter(s => !s.closest('[aria-hidden=true]') && s.getAttribute('aria-hidden') !== 'true' && !s.getAttribute('aria-label') && !s.querySelector('title') && s.getBoundingClientRect().width > 0).length;
  out.footer = (document.querySelector('footer') || {}).innerText || null;
  out.copyright = /©/.test(document.body.innerText);
  out.docWidth = document.documentElement.scrollWidth;
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const report = {};
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: !!v.isMobile, hasTouch: !!v.hasTouch, deviceScaleFactor: 1, locale: 'ru-RU' });
    for (const r of ROUTES) {
      const page = await ctx.newPage();
      const key = v.name + ' ' + r;
      try {
        await page.goto(BASE + r, { waitUntil: 'networkidle', timeout: 120000 });
        await page.waitForTimeout(1500);
        const slug = (v.name + r).replace(/[\/]/g, '_');
        await page.screenshot({ path: path.join(OUT, slug + '.png'), fullPage: true });
        const data = await page.evaluate(collect);
        await page.addScriptTag({ content: AXE });
        const axe = await page.evaluate(async () => { const res = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }); return res.violations.map(x => ({ id: x.id, impact: x.impact, help: x.help, n: x.nodes.length, nodes: x.nodes.slice(0, 6).map(nd => ({ target: nd.target.join(' '), html: nd.html.slice(0, 160), summary: (nd.failureSummary || '').slice(0, 300) })) })); });
        report[key] = { data, axe };
        console.log(key, 'texts', data.texts.length, 'axe', axe.map(a => a.id + ':' + a.n).join(','));
      } catch (e) { report[key] = { error: String(e) }; console.log(key, 'ERROR', String(e).slice(0, 200)); }
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
})();
