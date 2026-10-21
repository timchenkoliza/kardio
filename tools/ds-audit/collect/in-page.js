/*
 * Runs inside the audited page (injected with addInitScript). Plain JS on purpose:
 * functions transpiled by tsx/esbuild cannot be passed to page.evaluate reliably.
 * Exposes window.__dsAudit = { collect, focusProbe, locate }.
 *
 * Determinism: no coordinates, sizes or indices go into locators; output arrays
 * are sorted before they leave the page.
 */
(() => {
  if (window.__dsAudit) return;

  const STATE_CLASS = /^(is|has)-/;
  const HASHED_CLASS = /__[A-Za-z0-9_-]*\d[A-Za-z0-9_-]*$|^css-[a-z0-9]+$|^jsx-\d+$/;
  const UNSTABLE_ID = /[«»:]|^_r_|^radix-|^headlessui-|\d{3,}/;
  const LANDMARKS = new Set(["main", "nav", "header", "footer", "aside", "form", "dialog"]);

  const norm = (value) => String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  const normKey = (value) => norm(value).toLowerCase().replace(/\d/g, "#").slice(0, 60);
  /** Collapses ASCII whitespace only, so no-break spaces survive for R-10. */
  const rawText = (value) => String(value || "").replace(/[ \t\n\r\f]+/g, " ").trim();

  function stableId(el) {
    const id = el.getAttribute && el.getAttribute("id");
    return id && /^[A-Za-z][\w-]*$/.test(id) && !UNSTABLE_ID.test(id) ? id : null;
  }

  function classPart(el) {
    const raw = el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className;
    return String(raw || "").split(/\s+/).filter(Boolean).filter(c => !STATE_CLASS.test(c) && !HASHED_CLASS.test(c)).sort();
  }

  function selfPart(el) {
    const tag = el.tagName.toLowerCase();
    const id = stableId(el);
    if (id) return `${tag}#${id}`;
    const classes = classPart(el);
    return tag + (classes.length ? "." + classes.join(".") : "");
  }

  function anchorPart(el) {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      const id = stableId(node);
      if (id) return `#${id}`;
      const agent = node.getAttribute("data-agent");
      if (agent) return `[data-agent=${agent}]`;
      const tag = node.tagName.toLowerCase();
      const label = node.getAttribute("aria-label");
      if (label && (LANDMARKS.has(tag) || tag === "section" || node.getAttribute("role"))) return `${tag}[aria-label="${norm(label).slice(0, 40)}"]`;
    }
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      if (LANDMARKS.has(node.tagName.toLowerCase())) return node.tagName.toLowerCase();
    }
    return "body";
  }

  /** component: anchor + element kind; instance: + normalized own text. */
  function locate(el) {
    const component = `${anchorPart(el)} ${selfPart(el)}`;
    const text = normKey(el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.getAttribute("title") || "");
    return { component, instance: text ? `${component} "${text}"` : component, text: norm(el.textContent).slice(0, 120) };
  }

  function parseColor(value) {
    const m = String(value || "").match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(part => part.endsWith("%") ? parseFloat(part) / 100 : Number(part));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }
  const hex2 = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  const hex6 = (c) => "#" + hex2(c.r) + hex2(c.g) + hex2(c.b);
  const hex8 = (c) => hex6(c) + (c.a >= 1 ? "" : hex2(c.a * 255));
  const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const lum = (c) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

  function background(el) {
    const layers = [];
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return { image: true, layers: layers.map(hex8) };
      const c = parseColor(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) bg = blend(layers[i], bg);
    return { image: false, color: bg, layers: layers.map(hex8) };
  }

  function visible(el) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width <= 1 || r.height <= 1 || cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) return false;
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) if (parseFloat(getComputedStyle(node).opacity) === 0) return false;
    return true;
  }

  function textRole(el) {
    if (el.closest("h1,h2,h3,h4,h5,h6")) return "heading";
    if (el.closest("[class*=summary],[class*=deck],.ws-intro-lead,.ws-intro-status")) return "summary";
    return "other";
  }

  function pseudoArea(el, rect) {
    let width = rect.width, height = rect.height;
    if (getComputedStyle(el).position === "static") return { width, height };
    for (const pseudo of ["::before", "::after"]) {
      const cs = getComputedStyle(el, pseudo);
      if (!cs || cs.content === "none" || cs.content === "normal" || cs.position !== "absolute") continue;
      const px = (v) => (v && v.endsWith("px") ? parseFloat(v) : null);
      const left = px(cs.left), right = px(cs.right), top = px(cs.top), bottom = px(cs.bottom);
      if (left !== null && right !== null) width = Math.max(width, rect.width - left - right);
      else if (px(cs.width) !== null) width = Math.max(width, px(cs.width));
      if (top !== null && bottom !== null) height = Math.max(height, rect.height - top - bottom);
      else if (px(cs.height) !== null) height = Math.max(height, px(cs.height));
    }
    return { width, height };
  }

  function cssRules() {
    const out = [];
    const walk = (rules, sheet, media) => {
      for (const rule of Array.from(rules || [])) {
        if (rule.cssRules && !rule.style) { walk(rule.cssRules, sheet, rule.conditionText || rule.media && rule.media.mediaText || media); continue; }
        if (!rule.style || !rule.selectorText) continue;
        const declarations = [];
        for (let i = 0; i < rule.style.length; i++) {
          const prop = rule.style[i];
          declarations.push([prop, rule.style.getPropertyValue(prop).trim()]);
        }
        out.push({ sheet, media: media || "", selector: rule.selectorText, declarations });
        if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules, sheet, media);
      }
    };
    Array.from(document.styleSheets).forEach((sheet, index) => {
      let rules = null;
      try { rules = sheet.cssRules; } catch { return; }
      const href = sheet.href ? new URL(sheet.href).pathname : `inline:${index}`;
      walk(rules, href, "");
    });
    return out;
  }

  function collect() {
    const texts = [];
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const display = norm(node.textContent);
      if (!display) continue;
      const el = node.parentElement;
      if (!el || seen.has(el) || el.closest("script,style,noscript,template,option")) continue;
      seen.add(el);
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      const lh = cs.lineHeight === "normal" ? null : parseFloat(cs.lineHeight);
      const fg = parseColor(cs.color);
      const bg = background(el);
      let ratio = null, fgHex = null, bgHex = null;
      if (fg && !bg.image) { const blended = blend(fg, bg.color); ratio = Math.round(contrast(blended, bg.color) * 100) / 100; fgHex = hex6(blended); bgHex = hex6(bg.color); }
      const loc = locate(el);
      const ownText = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join("");
      texts.push({
        component: loc.component, instance: loc.instance, tag: el.tagName.toLowerCase(),
        text: display.slice(0, 200), raw: rawText(ownText).slice(0, 400),
        fontSize: fs, lineHeight: lh, lineHeightRatio: lh ? Math.round(lh / fs * 1000) / 1000 : null, fontWeight: Number(cs.fontWeight) || 400,
        colorRaw: fg ? hex8(fg) : null, fg: fgHex, bg: bgHex, bgLayers: bg.layers, bgImage: bg.image, contrast: ratio,
        inSvg: Boolean(el.closest("svg")), disabled: Boolean(el.closest(":disabled,[aria-disabled=true]")),
        primaryButton: Boolean(el.closest(".ws-button.is-primary")), role: textRole(el),
        excluded: Boolean(el.closest("[data-ds-audit-ignore]")),
        kind: "text",
      });
    }
    document.querySelectorAll("input[placeholder], textarea[placeholder]").forEach(el => {
      if (!visible(el)) return;
      const loc = locate(el);
      const placeholder = norm(el.getAttribute("placeholder"));
      texts.push({ component: loc.component, instance: `${loc.component} "${normKey(placeholder)}"`, tag: el.tagName.toLowerCase(), text: placeholder, raw: rawText(el.getAttribute("placeholder")), fontSize: null, lineHeight: null, lineHeightRatio: null, fontWeight: null, colorRaw: null, fg: null, bg: null, bgLayers: [], bgImage: false, contrast: null, inSvg: false, disabled: false, primaryButton: false, role: "other", excluded: false, kind: "placeholder" });
    });
    document.querySelectorAll("select").forEach(el => {
      if (!visible(el) || !el.selectedOptions || !el.selectedOptions[0]) return;
      const loc = locate(el);
      const value = norm(el.selectedOptions[0].textContent);
      texts.push({ component: loc.component, instance: `${loc.component} "${normKey(value)}"`, tag: "select", text: value, raw: rawText(el.selectedOptions[0].textContent), fontSize: null, lineHeight: null, lineHeightRatio: null, fontWeight: null, colorRaw: null, fg: null, bg: null, bgLayers: [], bgImage: false, contrast: null, inSvg: false, disabled: false, primaryButton: false, role: "other", excluded: false, kind: "select" });
    });

    const backgrounds = new Map();
    document.querySelectorAll("body *").forEach(el => {
      if (el.closest("svg")) return;
      const c = parseColor(getComputedStyle(el).backgroundColor);
      if (!c || c.a === 0 || !visible(el)) return;
      const loc = locate(el);
      const key = `${loc.component}|${hex8(c)}`;
      if (!backgrounds.has(key)) backgrounds.set(key, { component: loc.component, color: hex8(c), excluded: Boolean(el.closest("[data-ds-audit-ignore]")) });
    });

    const targets = [];
    document.querySelectorAll("a[href], button, [role=button], input:not([type=hidden]), select, textarea, summary, [tabindex]:not([tabindex='-1'])").forEach(el => {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (rect.width === 0 || rect.height === 0 || cs.visibility === "hidden" || cs.display === "none") return;
      if (rect.right < 0 || rect.bottom < 0 || el.closest(":disabled,[aria-disabled=true],[inert]")) return;
      const area = pseudoArea(el, rect);
      const loc = locate(el);
      targets.push({ component: loc.component, instance: loc.instance, tag: el.tagName.toLowerCase(), name: norm(el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || "").slice(0, 60), width: Math.round(area.width), height: Math.round(area.height), inText: el.tagName === "A" && Boolean(el.closest("p, li")), excluded: Boolean(el.closest("[data-ds-audit-ignore]")) });
    });

    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
      .filter(h => getComputedStyle(h).display !== "none")
      .map(h => ({ level: Number(h.tagName[1]), component: locate(h).component, text: norm(h.textContent).slice(0, 120) }));

    const images = Array.from(document.querySelectorAll("img")).map(img => ({ component: locate(img).component, src: (img.getAttribute("src") || "").slice(0, 200), alt: img.getAttribute("alt") }));

    return {
      title: document.title,
      lang: document.documentElement.getAttribute("lang"),
      bodyText: norm(document.body.innerText).slice(0, 60000),
      texts, backgrounds: Array.from(backgrounds.values()), targets, headings,
      h1Count: document.querySelectorAll("h1").length,
      images,
      navLinks: Array.from(document.querySelectorAll("nav a[href]")).map(a => a.getAttribute("href")).filter(Boolean),
      css: cssRules(),
      docWidth: document.documentElement.scrollWidth,
    };
  }

  /** Focus indicator of the element that has keyboard focus right now. */
  const focusSeen = new WeakSet();

  function focusProbe() {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    const revisit = focusSeen.has(el);
    focusSeen.add(el);
    const own = getComputedStyle(el);
    const ownWidth = parseFloat(own.outlineWidth) || 0;
    const solid = (cs) => cs.outlineStyle !== "none" && cs.outlineStyle !== "hidden" && (parseFloat(cs.outlineWidth) || 0) >= 2;
    let indicator = solid(own) ? "self" : null;
    if (!indicator) {
      for (let node = el.parentElement, depth = 0; node && depth < 3; node = node.parentElement, depth++) {
        if (node.matches(":focus-within") && solid(getComputedStyle(node))) { indicator = "ancestor"; break; }
      }
    }
    const loc = locate(el);
    return { component: loc.component, instance: loc.instance, tag: el.tagName.toLowerCase(), outlineStyle: own.outlineStyle, outlineWidth: ownWidth, boxShadow: own.boxShadow, indicator, excluded: Boolean(el.closest("[data-ds-audit-ignore]")), revisit };
  }

  /** Locator of the element an axe target selector points to. */
  function locateSelector(selector) {
    try { const el = document.querySelector(selector); return el ? locate(el).component : null; } catch { return null; }
  }

  window.__dsAudit = { collect, focusProbe, locate, locateSelector };
})();
