import { adminListContactConflicts, adminMergeContacts, adminNormalizeChannels, type ContactConflictGroup } from "../../services/admin";
import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = [
  "admin.title",
  "admin.adminKey",
  "admin.adminKeyHint",
  "admin.saveKey",
  "admin.normalizeDryRun",
  "admin.normalizeRun",
  "admin.normalizeApply",
  "admin.conflicts",
  "admin.refreshConflicts",
  "admin.merge",
  "admin.keep",
  "admin.remove",
  "admin.done",
  "common.failed",
  "common.ok"
] as const satisfies readonly MessageKey[];

function getStoredAdminKey(): string {
  try {
    const v = wx.getStorageSync("sc_admin_key");
    return typeof v === "string" ? v.trim() : "";
  } catch {
    return "";
  }
}

function setStoredAdminKey(key: string) {
  wx.setStorageSync("sc_admin_key", key);
}

function pickKeepId(group: ContactConflictGroup): string {
  const arr = Array.isArray(group?.contacts) ? group.contacts.slice() : [];
  arr.sort((a, b) => {
    const aVerified = a.status === "verified" || (a.verifiedAt || 0) > 0;
    const bVerified = b.status === "verified" || (b.verifiedAt || 0) > 0;
    if (aVerified !== bVerified) return aVerified ? -1 : 1;
    const aScore = (a.successCount || 0) * 10 - (a.failCount || 0) * 2 + (a.endorsedCount || 0);
    const bScore = (b.successCount || 0) * 10 - (b.failCount || 0) * 2 + (b.endorsedCount || 0);
    if (aScore !== bScore) return bScore - aScore;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  return arr[0]?.id || (Array.isArray(group.ids) ? group.ids[0] : "") || "";
}

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    adminKeyInput: "",
    dryRun: true,
    lastNormalizeText: "",
    loading: false,
    conflicts: [] as (ContactConflictGroup & { keepId: string })[]
  },
  onLoad() {
    syncPageI18n(this, I18N_KEYS);
    this.setData({ adminKeyInput: getStoredAdminKey() });
    wx.setNavigationBarTitle({ title: t("admin.title") });
    this.refreshConflicts();
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("admin.title") });
  },
  onPullDownRefresh() {
    Promise.resolve()
      .then(() => this.refreshConflicts())
      .finally(() => wx.stopPullDownRefresh());
  },
  onInputAdminKey(e: WechatMiniprogram.Input) {
    this.setData({ adminKeyInput: e.detail.value });
  },
  onTapSaveKey() {
    const k = String(this.data.adminKeyInput || "").trim();
    setStoredAdminKey(k);
    wx.showToast({ title: t("common.ok"), icon: "success" });
  },
  onTapToggleDryRun() {
    this.setData({ dryRun: !this.data.dryRun });
  },
  onTapNormalizeRun() {
    if (this.data.loading) return;
    const key = getStoredAdminKey() || String(this.data.adminKeyInput || "").trim();
    if (!key) return;
    this.setData({ loading: true, lastNormalizeText: "" });
    adminNormalizeChannels(key, true)
      .then((res) => {
        if (!res) throw new Error("failed");
        const line = `dryRun=true users=${res.usersUpdated || 0} requests=${res.requestsUpdated || 0} intros=${res.introductionsUpdated || 0} contacts=${res.contactsUpdated || 0} conflicts=${res.contactConflictCount || 0}`;
        this.setData({ lastNormalizeText: line });
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      })
      .finally(() => this.setData({ loading: false }));
  },
  onTapNormalizeApply() {
    if (this.data.loading) return;
    const key = getStoredAdminKey() || String(this.data.adminKeyInput || "").trim();
    if (!key) return;
    wx.showModal({
      title: t("admin.normalizeApply"),
      content: "dryRun=false",
      success: (r) => {
        if (!r.confirm) return;
        this.setData({ loading: true, lastNormalizeText: "" });
        adminNormalizeChannels(key, false)
          .then((res) => {
            if (!res) throw new Error("failed");
            const line = `dryRun=false users=${res.usersUpdated || 0} requests=${res.requestsUpdated || 0} intros=${res.introductionsUpdated || 0} contacts=${res.contactsUpdated || 0} conflicts=${res.contactConflictCount || 0}`;
            this.setData({ lastNormalizeText: line });
            this.refreshConflicts();
          })
          .catch(() => {
            wx.showToast({ title: t("common.failed"), icon: "none" });
          })
          .finally(() => this.setData({ loading: false }));
      }
    });
  },
  refreshConflicts() {
    const key = getStoredAdminKey() || String(this.data.adminKeyInput || "").trim();
    if (!key) {
      this.setData({ conflicts: [] });
      return Promise.resolve();
    }
    return adminListContactConflicts(key, 50).then((items) => {
      const list = items.map((g) => ({ ...g, keepId: pickKeepId(g) }));
      this.setData({ conflicts: list });
    });
  },
  onTapMergeGroup(e: WechatMiniprogram.BaseEvent) {
    if (this.data.loading) return;
    const key = getStoredAdminKey() || String(this.data.adminKeyInput || "").trim();
    if (!key) return;
    const groupKey = (e.currentTarget as any)?.dataset?.key as string | undefined;
    if (!groupKey) return;
    const group = (this.data.conflicts || []).find((g) => g.key === groupKey);
    if (!group) return;
    const keepId = group.keepId;
    const removeIds = (Array.isArray(group.ids) ? group.ids : []).filter((id) => id !== keepId);
    if (!keepId || removeIds.length === 0) return;
    wx.showModal({
      title: t("admin.merge"),
      content: `${t("admin.keep")}: ${keepId}\n${t("admin.remove")}: ${removeIds.length}`,
      success: (r) => {
        if (!r.confirm) return;
        this.setData({ loading: true });
        adminMergeContacts(key, keepId, removeIds)
          .then((ok) => {
            if (!ok) throw new Error("failed");
            wx.showToast({ title: t("admin.done"), icon: "success" });
            this.refreshConflicts();
          })
          .catch(() => {
            wx.showToast({ title: t("common.failed"), icon: "none" });
          })
          .finally(() => this.setData({ loading: false }));
      }
    });
  },
  onTapPickKeep(e: WechatMiniprogram.BaseEvent) {
    const groupKey = (e.currentTarget as any)?.dataset?.groupKey as string | undefined;
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!groupKey || !id) return;
    const next = (this.data.conflicts || []).map((g) => (g.key === groupKey ? { ...g, keepId: id } : g));
    this.setData({ conflicts: next });
  }
});

