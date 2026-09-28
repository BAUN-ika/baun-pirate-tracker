import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * i18n: izvorni tekstovi u kodu su na bosanskom/srpskom (latinica).
 * Prevodi su u src/i18n/locales/<lang>.json kao mapa "izvorni tekst" → prevod.
 * Prevod se primjenjuje na prikazani UI (tekst, placeholder, title, aria-label),
 * pa se jezik mijenja odmah bez refresh-a. Podaci (usernames, tagovi, gradovi…)
 * se ne prevode jer nisu u rječniku; elementi sa data-no-i18n se preskaču.
 */

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "bs", label: "Bosanski" },
  { code: "sr-Latn", label: "Srpski (latinica)" },
  { code: "sr-Cyrl", label: "Српски (ћирилица)" },
  { code: "hr", label: "Hrvatski" },
  { code: "de", label: "Deutsch" },
  { code: "tr", label: "Türkçe" },
  { code: "el", label: "Ελληνικά" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "pl", label: "Polski" },
  { code: "ru", label: "Русский" },
  { code: "uk", label: "Українська" },
] as const;
export type LangCode = (typeof LANGUAGES)[number]["code"];
const DEFAULT: LangCode = "en";
const STORAGE_KEY = "app-language";

const loaders = import.meta.glob<{ default: Record<string, string> }>("./locales/*.json");

interface Dict {
  exact: Map<string, string>;
  patterns: { re: RegExp; tpl: string }[];
}
let dict: Dict | null = null;

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function loadDict(lang: LangCode): Promise<Dict | null> {
  if (lang === "sr-Latn" || lang === "bs") return null; // izvorni jezik
  const mod = await loaders[`./locales/${lang}.json`]?.();
  if (!mod) return null;
  const exact = new Map<string, string>();
  const patterns: Dict["patterns"] = [];
  for (const [k, v] of Object.entries(mod.default)) {
    if (!v) continue;
    if (k.includes("{0}")) {
      const parts = k.split("{0}").map(escapeRe);
      patterns.push({ re: new RegExp("^" + parts.join("(.+?)") + "$"), tpl: v });
    } else exact.set(k, v);
  }
  patterns.sort((a, b) => b.re.source.length - a.re.source.length);
  return { exact, patterns };
}

export function translate(s: string): string {
  if (!dict || !s) return s;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s)!;
  const core = m[2].replace(/\s+/g, " ");
  if (!core || !/\p{L}/u.test(core)) return s;
  const hit = dict.exact.get(core);
  if (hit != null) return m[1] + hit + m[3];
  for (const p of dict.patterns) {
    const r = p.re.exec(core);
    if (r) {
      let i = 1;
      return m[1] + p.tpl.replace(/\{0\}/g, () => r[i++] ?? "") + m[3];
    }
  }
  return s;
}

// ---- DOM prevodilac ----
const ATTRS = ["placeholder", "title", "aria-label"] as const;
const textOrig = new WeakMap<Text, { orig: string; shown: string }>();
const attrOrig = new WeakMap<Element, Record<string, { orig: string; shown: string }>>();

function skip(el: Element | null) {
  return !!el?.closest("script,style,textarea,code,[data-no-i18n],[contenteditable=true]");
}

function doText(n: Text) {
  if (skip(n.parentElement)) return;
  const cur = n.nodeValue ?? "";
  let rec = textOrig.get(n);
  if (!rec || cur !== rec.shown) rec = { orig: cur, shown: cur };
  const next = translate(rec.orig);
  rec.shown = next;
  textOrig.set(n, rec);
  if (next !== cur) n.nodeValue = next;
}

function doAttrs(el: Element) {
  if (skip(el)) return;
  for (const a of ATTRS) {
    const cur = el.getAttribute(a);
    if (cur == null) continue;
    const all = attrOrig.get(el) ?? {};
    let rec = all[a];
    if (!rec || cur !== rec.shown) rec = { orig: cur, shown: cur };
    const next = translate(rec.orig);
    rec.shown = next;
    all[a] = rec;
    attrOrig.set(el, all);
    if (next !== cur) el.setAttribute(a, next);
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return doText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  doAttrs(root as Element);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null;
  while ((n = w.nextNode())) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
    else doAttrs(n as Element);
  }
}

let observer: MutationObserver | null = null;
let hydrated = false;
function startObserver() {
  if (observer) return;
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") doText(m.target as Text);
      else if (m.type === "attributes") doAttrs(m.target as Element);
      else m.addedNodes.forEach(walk);
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS],
  });
}

// ---- React ----
const Ctx = createContext<{ lang: LangCode; setLang: (l: LangCode) => void }>({
  lang: DEFAULT,
  setLang: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(DEFAULT);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as LangCode | null;
    if (saved && LANGUAGES.some((l) => l.code === saved)) setLangState(saved);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ready = hydrated
      ? Promise.resolve()
      : new Promise<void>((r) => {
          const go = () => setTimeout(r, 400);
          if (document.readyState === "complete") go();
          else window.addEventListener("load", go, { once: true });
        });
    Promise.all([loadDict(lang), ready]).then(([d]) => {
      if (cancelled) return;
      hydrated = true;
      dict = d;
      document.documentElement.lang = lang;
      startObserver();
      walk(document.body);
    });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const setLang = (l: LangCode) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLangState(l);
  };
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
