export type ContactChannelKind = "mobile" | "email" | "wechat" | "other";

export type ParsedContactChannel = {
  kind: ContactChannelKind;
  normalized: string;
  display: string;
};

function normalizeSpaces(s: string): string {
  return String(s || "").trim().replace(/\s+/g, " ");
}

function stripAllSpaces(s: string): string {
  return String(s || "").replace(/\s+/g, "");
}

function digitsOnly(s: string): string {
  return String(s || "").replace(/[^\d]/g, "");
}

export function parseContactChannel(input: string): ParsedContactChannel | null {
  const raw = normalizeSpaces(input);
  if (!raw) return null;

  const compact = stripAllSpaces(raw);
  const lower = compact.toLowerCase();

  const email = lower.match(/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i);
  if (email) {
    return { kind: "email", normalized: `email:${lower}`, display: raw };
  }

  const mobileDigits = digitsOnly(compact);
  if (mobileDigits.length >= 7 && mobileDigits.length <= 15) {
    const normalizedDigits = mobileDigits.startsWith("86") && mobileDigits.length === 13 ? mobileDigits.slice(2) : mobileDigits;
    return { kind: "mobile", normalized: `mobile:${normalizedDigits}`, display: raw };
  }

  const wechatExplicit = lower.match(/^(wechat|wx|weixin)[:：]?(.+)$/i);
  if (wechatExplicit) {
    const id = String(wechatExplicit[2] || "").trim().replace(/^@/, "");
    const idCompact = stripAllSpaces(id);
    if (idCompact) return { kind: "wechat", normalized: `wechat:${idCompact}`, display: `wechat: ${idCompact}` };
  }

  const wechatIdLike = lower.match(/^[a-z][-_a-z0-9]{4,19}$/i);
  if (wechatIdLike) {
    return { kind: "wechat", normalized: `wechat:${lower}`, display: `wechat: ${lower}` };
  }

  return { kind: "other", normalized: raw, display: raw };
}

