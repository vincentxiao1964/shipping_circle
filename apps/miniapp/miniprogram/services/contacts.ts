import { requestJson } from "./api";

export type ContactMatch = {
  id: string;
  companyId?: string;
  companyName: string;
  business: string;
  contactName: string;
  contactTitle: string;
  contactChannel: string;
  clue: string;
  status?: string;
  verifiedAt: number;
  successCount: number;
  failCount?: number;
  lastFailureAt?: number;
  lastFailureReason?: string;
};

export type ContactMatchGroup = {
  business: string;
  contacts: ContactMatch[];
};

export async function matchContacts(input: {
  companyId?: string;
  companyName: string;
  businesses?: string[];
  limit?: number;
}): Promise<ContactMatchGroup[]> {
  const companyId = String(input.companyId || "").trim();
  const companyName = String(input.companyName || "").trim();
  const businesses = Array.isArray(input.businesses) ? input.businesses.map((x) => String(x || "").trim()).filter(Boolean) : [];
  const limit = Math.min(Math.max(1, Number(input.limit ?? 5)), 20);
  if (!companyId && !companyName) return [];
  const qs =
    `?companyId=${encodeURIComponent(companyId)}` +
    `&company=${encodeURIComponent(companyName)}` +
    `&businesses=${encodeURIComponent(businesses.join(","))}` +
    `&limit=${encodeURIComponent(String(limit))}`;
  try {
    const res = await requestJson<{ items: ContactMatchGroup[] }>("GET", `/contacts/match${qs}`);
    return Array.isArray(res?.items) ? res.items : [];
  } catch {
    return [];
  }
}

export async function confirmContact(id: string): Promise<boolean> {
  const cid = String(id || "").trim();
  if (!cid) return false;
  try {
    await requestJson("POST", `/contacts/${encodeURIComponent(cid)}/feedback`, { action: "confirm" });
    return true;
  } catch {
    return false;
  }
}

export async function invalidateContact(id: string, reason: string): Promise<"ok" | "conflict" | "failed"> {
  const cid = String(id || "").trim();
  if (!cid) return "failed";
  try {
    await requestJson("POST", `/contacts/${encodeURIComponent(cid)}/feedback`, { action: "invalid", reason: String(reason || "") });
    return "ok";
  } catch (e) {
    const statusCode = (e as any)?.statusCode as number | undefined;
    if (statusCode === 409) return "conflict";
    return "failed";
  }
}

export async function updateContact(input: {
  id: string;
  contactChannel?: string;
  contactName?: string;
  contactTitle?: string;
  clue?: string;
}): Promise<"ok" | "conflict" | "failed"> {
  const cid = String(input.id || "").trim();
  if (!cid) return "failed";
  try {
    await requestJson("POST", `/contacts/${encodeURIComponent(cid)}/feedback`, {
      action: "update",
      contactChannel: String(input.contactChannel || ""),
      contactName: String(input.contactName || ""),
      contactTitle: String(input.contactTitle || ""),
      clue: String(input.clue || "")
    });
    return "ok";
  } catch (e) {
    const statusCode = (e as any)?.statusCode as number | undefined;
    if (statusCode === 409) return "conflict";
    return "failed";
  }
}
