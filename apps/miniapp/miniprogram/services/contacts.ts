import { requestJson } from "./api";

export type ContactMatch = {
  id: string;
  companyName: string;
  business: string;
  contactName: string;
  contactTitle: string;
  contactChannel: string;
  clue: string;
  verifiedAt: number;
  successCount: number;
};

export type ContactMatchGroup = {
  business: string;
  contacts: ContactMatch[];
};

export async function matchContacts(input: { companyName: string; businesses?: string[]; limit?: number }): Promise<ContactMatchGroup[]> {
  const companyName = String(input.companyName || "").trim();
  const businesses = Array.isArray(input.businesses) ? input.businesses.map((x) => String(x || "").trim()).filter(Boolean) : [];
  const limit = Math.min(Math.max(1, Number(input.limit ?? 5)), 20);
  if (!companyName) return [];
  const qs =
    `?company=${encodeURIComponent(companyName)}` +
    `&businesses=${encodeURIComponent(businesses.join(","))}` +
    `&limit=${encodeURIComponent(String(limit))}`;
  try {
    const res = await requestJson<{ items: ContactMatchGroup[] }>("GET", `/contacts/match${qs}`);
    return Array.isArray(res?.items) ? res.items : [];
  } catch {
    return [];
  }
}

