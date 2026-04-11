import { getToken } from "../../services/api";
import {
  batchConfirmContacts,
  batchInvalidateContacts,
  batchReplaceContactChannel,
  confirmContact,
  invalidateContact,
  listContactsByCompany,
  updateContact,
  type ContactListItem
} from "../../services/contacts";
import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = [
  "contact.manageTitle",
  "contact.manageEmpty",
  "contact.manageHint",
  "contact.filter.todo",
  "contact.filter.verified",
  "contact.filter.all",
  "contact.selectAll",
  "contact.clearSelect",
  "contact.selectedCount",
  "contact.batchConfirm",
  "contact.batchInvalid",
  "contact.batchReplace",
  "contact.batchReplaceFromTitle",
  "contact.batchReplaceFromPlaceholder",
  "contact.batchReplaceToTitle",
  "contact.batchReplaceToPlaceholder",
  "contact.batchReplaced",
  "contact.copy",
  "contact.copied",
  "contact.stale",
  "contact.candidate",
  "contact.confirm",
  "contact.update",
  "contact.markInvalid",
  "contact.confirmed",
  "contact.updated",
  "contact.invalidMarked",
  "contact.updateTitle",
  "contact.updatePlaceholder",
  "contact.invalidReasonUnreachable",
  "contact.invalidReasonMismatch",
  "contact.invalidReasonLeft",
  "contact.invalidReasonRefused",
  "contact.invalidReasonOther",
  "common.failed"
] as const satisfies readonly MessageKey[];

type Group = { business: string; items: ContactListItem[] };

function groupByBusiness(items: ContactListItem[]): Group[] {
  const map = new Map<string, ContactListItem[]>();
  for (const c of items) {
    const key = String(c.business || "").trim() || "-";
    const list = map.get(key) || [];
    list.push(c);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .map(([business, list]) => ({
      business,
      items: list.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    }))
    .sort((a, b) => a.business.localeCompare(b.business));
}

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    companyId: "",
    companyName: "",
    filter: "todo" as "todo" | "verified" | "all",
    loading: false,
    items: [] as ContactListItem[],
    groups: [] as Group[],
    selectedIds: [] as string[],
    selectedText: ""
  },
  onLoad(query: Record<string, string | undefined>) {
    syncPageI18n(this, I18N_KEYS);
    const companyId = query.companyId ? String(query.companyId) : "";
    const companyName = query.companyName ? String(query.companyName) : "";
    this.setData({ companyId, companyName });
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("contact.manageTitle") });
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    this.setData({ selectedText: t("contact.selectedCount", { count: (this.data.selectedIds || []).length }) });
    this.load();
  },
  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },
  onTapFilter(e: WechatMiniprogram.BaseEvent) {
    const filter = (e.currentTarget as any)?.dataset?.filter as "todo" | "verified" | "all" | undefined;
    if (!filter) return;
    if (filter === this.data.filter) return;
    this.setData({ filter });
    this.load();
  },
  onTapToggleSelect(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    const next = (this.data.selectedIds || []).slice();
    const idx = next.indexOf(id);
    if (idx >= 0) next.splice(idx, 1);
    else next.push(id);
    this.setData({ selectedIds: next, selectedText: t("contact.selectedCount", { count: next.length }) });
  },
  onTapSelectAll() {
    const visible = (this.data.items || []).map((x) => x.id).filter(Boolean);
    const selected = new Set(this.data.selectedIds || []);
    const allSelected = visible.length > 0 && visible.every((id) => selected.has(id));
    const next = allSelected ? [] : visible;
    this.setData({ selectedIds: next, selectedText: t("contact.selectedCount", { count: next.length }) });
  },
  onTapClearSelect() {
    this.setData({ selectedIds: [], selectedText: t("contact.selectedCount", { count: 0 }) });
  },
  onTapBatchConfirm() {
    const ids = (this.data.selectedIds || []).slice();
    if (ids.length === 0) return;
    batchConfirmContacts(ids)
      .then((ok) => {
        if (!ok) throw new Error("failed");
        wx.showToast({ title: t("contact.confirmed"), icon: "success" });
        this.setData({ selectedIds: [], selectedText: t("contact.selectedCount", { count: 0 }) });
        this.load();
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      });
  },
  onTapBatchInvalid() {
    const ids = (this.data.selectedIds || []).slice();
    if (ids.length === 0) return;
    const reasons = [
      { label: t("contact.invalidReasonUnreachable"), code: "unreachable" },
      { label: t("contact.invalidReasonMismatch"), code: "mismatch" },
      { label: t("contact.invalidReasonLeft"), code: "left" },
      { label: t("contact.invalidReasonRefused"), code: "refused" },
      { label: t("contact.invalidReasonOther"), code: "other" }
    ];
    wx.showActionSheet({
      itemList: reasons.map((x) => x.label),
      success: (r) => {
        const reason = reasons[r.tapIndex]?.code || "";
        batchInvalidateContacts(ids, reason)
          .then((ok) => {
            if (!ok) throw new Error("failed");
            wx.showToast({ title: t("contact.invalidMarked"), icon: "success" });
            this.setData({ selectedIds: [], selectedText: t("contact.selectedCount", { count: 0 }) });
            this.load();
          })
          .catch(() => {
            wx.showToast({ title: t("common.failed"), icon: "none" });
          });
      }
    });
  },
  onTapBatchReplace() {
    const ids = (this.data.selectedIds || []).slice();
    if (ids.length === 0) return;
    wx.showModal({
      title: t("contact.batchReplaceFromTitle"),
      editable: true,
      placeholderText: t("contact.batchReplaceFromPlaceholder"),
      success: (r1) => {
        if (!r1.confirm) return;
        const from = String((r1 as any).content || "");
        if (!from) return;
        wx.showModal({
          title: t("contact.batchReplaceToTitle"),
          editable: true,
          placeholderText: t("contact.batchReplaceToPlaceholder"),
          success: (r2) => {
            if (!r2.confirm) return;
            const to = String((r2 as any).content || "");
            batchReplaceContactChannel({ ids, from, to })
              .then((ok) => {
                if (!ok) throw new Error("failed");
                wx.showToast({ title: t("contact.batchReplaced"), icon: "success" });
                this.setData({ selectedIds: [], selectedText: t("contact.selectedCount", { count: 0 }) });
                this.load();
              })
              .catch(() => {
                wx.showToast({ title: t("common.failed"), icon: "none" });
              });
          }
        });
      }
    });
  },
  onTapCopyContact(e: WechatMiniprogram.BaseEvent) {
    const channel = (e.currentTarget as any)?.dataset?.channel as string | undefined;
    if (!channel) return;
    wx.setClipboardData({
      data: channel,
      success: () => {
        wx.showToast({ title: t("contact.copied"), icon: "success" });
      }
    });
  },
  onTapContactConfirm(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    confirmContact(id)
      .then((ok) => {
        if (!ok) throw new Error("failed");
        wx.showToast({ title: t("contact.confirmed"), icon: "success" });
        this.load();
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      });
  },
  onTapContactUpdate(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    const channel = (e.currentTarget as any)?.dataset?.channel as string | undefined;
    if (!id) return;
    wx.showModal({
      title: t("contact.updateTitle"),
      editable: true,
      placeholderText: channel || t("contact.updatePlaceholder"),
      success: (r) => {
        if (!r.confirm) return;
        const v = String((r as any).content || "").trim();
        if (!v) return;
        updateContact({ id, contactChannel: v })
          .then((res) => {
            if (res !== "ok") throw new Error("failed");
            wx.showToast({ title: t("contact.updated"), icon: "success" });
            this.load();
          })
          .catch(() => {
            wx.showToast({ title: t("common.failed"), icon: "none" });
          });
      }
    });
  },
  onTapContactInvalid(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    const reasons = [
      { label: t("contact.invalidReasonUnreachable"), code: "unreachable" },
      { label: t("contact.invalidReasonMismatch"), code: "mismatch" },
      { label: t("contact.invalidReasonLeft"), code: "left" },
      { label: t("contact.invalidReasonRefused"), code: "refused" },
      { label: t("contact.invalidReasonOther"), code: "other" }
    ];
    wx.showActionSheet({
      itemList: reasons.map((x) => x.label),
      success: (r) => {
        const reason = reasons[r.tapIndex]?.code || "";
        invalidateContact(id, reason)
          .then((res) => {
            if (res !== "ok") throw new Error("failed");
            wx.showToast({ title: t("contact.invalidMarked"), icon: "success" });
            this.load();
          })
          .catch(() => {
            wx.showToast({ title: t("common.failed"), icon: "none" });
          });
      }
    });
  },
  load() {
    if (!this.data.companyId) {
      this.setData({ items: [], groups: [] });
      return Promise.resolve();
    }
    if (this.data.loading) return Promise.resolve();
    this.setData({ loading: true });
    const statuses =
      this.data.filter === "verified"
        ? ["verified"]
        : this.data.filter === "all"
          ? ["verified", "stale", "candidate"]
          : ["stale", "candidate"];
    return listContactsByCompany({ companyId: this.data.companyId, statuses, limit: 200 })
      .then((items) => {
        const visibleIds = items.map((x) => x.id).filter(Boolean);
        const selected = new Set(this.data.selectedIds || []);
        const nextSelected = visibleIds.filter((id) => selected.has(id));
        this.setData({
          items,
          groups: groupByBusiness(items),
          selectedIds: nextSelected,
          selectedText: t("contact.selectedCount", { count: nextSelected.length })
        });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  }
});
