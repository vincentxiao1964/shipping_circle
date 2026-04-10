import { enUS } from "./en-US";
import { zhCN } from "./zh-CN";

export type Locale = "zh-CN" | "en-US";

const STORAGE_KEY = "sc_locale";

const dictionaries = {
  "zh-CN": zhCN,
  "en-US": enUS
} as const;

type Dictionary = (typeof dictionaries)[Locale];
export type MessageKey = keyof Dictionary;

export function detectLocale(): Locale {
  const stored = safeGetStorage(STORAGE_KEY);
  if (stored === "zh-CN" || stored === "en-US") return stored;

  try {
    const sys = wx.getSystemInfoSync();
    const lang = (sys.language || "").toLowerCase();
    if (lang.startsWith("zh")) return "zh-CN";
    return "en-US";
  } catch {
    return "zh-CN";
  }
}

export function getLocale(): Locale {
  const app = getApp<{ globalData: { locale: Locale } }>();
  return app?.globalData?.locale ?? detectLocale();
}

export function setLocale(locale: Locale) {
  wx.setStorageSync(STORAGE_KEY, locale);
  const app = getApp<{ globalData: { locale: Locale; localeVersion: number } }>();
  if (app?.globalData) {
    app.globalData.locale = locale;
    app.globalData.localeVersion += 1;
  }
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const locale = getLocale();
  const dict = dictionaries[locale];
  const template = dict[key] ?? String(key);
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

export function pick(keys: readonly MessageKey[]) {
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = t(k);
  return out;
}

export function getLocaleVersion(): number {
  const app = getApp<{ globalData: { localeVersion: number } }>();
  return app?.globalData?.localeVersion ?? 0;
}

export function syncPageI18n(page: WechatMiniprogram.Page.Instance<any, any>, keys: readonly MessageKey[]) {
  const locale = getLocale();
  const localeVersion = getLocaleVersion();
  if (page.data?.localeVersion === localeVersion) return;
  page.setData({
    locale,
    localeVersion,
    i18n: pick(keys)
  });
}

function safeGetStorage(key: string): unknown {
  try {
    return wx.getStorageSync(key);
  } catch {
    return undefined;
  }
}
