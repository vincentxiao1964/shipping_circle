import { requestJsonWithHeaders } from "./api";

export type ContactConflictContact = {
  id: string;
  companyId: string;
  companyName: string;
  business: string;
  contactName: string;
  contactTitle: string;
  contactChannel: string;
  status: string;
  verifiedAt: number;
  successCount: number;
  failCount: number;
  lastFailureAt: number;
  lastFailureReason: string;
  endorsedCount: number;
  updatedAt: number;
  createdAt: number;
};

export type ContactConflictGroup = {
  key: string;
  count: number;
  ids: string[];
  contacts: ContactConflictContact[];
};

export async function adminNormalizeChannels(adminKey: string, dryRun: boolean) {
  const key = String(adminKey || "").trim();
  if (!key) return null;
  try {
    return await requestJsonWithHeaders<any>("POST", "/admin/normalizeChannels", { dryRun }, { "x-admin-key": key }, null);
  } catch {
    return null;
  }
}

export async function adminListContactConflicts(adminKey: string, limit = 50): Promise<ContactConflictGroup[]> {
  const key = String(adminKey || "").trim();
  if (!key) return [];
  try {
    const res = await requestJsonWithHeaders<{ items: ContactConflictGroup[] }>(
      "GET",
      `/admin/contacts/conflicts?limit=${encodeURIComponent(String(limit))}`,
      undefined,
      { "x-admin-key": key },
      null
    );
    return Array.isArray(res?.items) ? res.items : [];
  } catch {
    return [];
  }
}

export async function adminMergeContacts(adminKey: string, keepId: string, removeIds: string[]): Promise<boolean> {
  const key = String(adminKey || "").trim();
  const keep = String(keepId || "").trim();
  const removes = Array.isArray(removeIds) ? removeIds.map((x) => String(x || "").trim()).filter(Boolean) : [];
  if (!key || !keep || removes.length === 0) return false;
  try {
    const res = await requestJsonWithHeaders<{ ok: boolean }>(
      "POST",
      "/admin/contacts/merge",
      { keepId: keep, removeIds: removes },
      { "x-admin-key": key },
      null
    );
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

