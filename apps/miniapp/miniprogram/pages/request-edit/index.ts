import { getToken } from "../../services/api";
import { getRequest, listPopularTags, updateRequest } from "../../services/requests";
import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = [
  "request.editTitle",
  "request.title",
  "request.companyName",
  "request.tags",
  "request.tagsPick",
  "request.tagsCustom",
  "request.businessRequired",
  "request.content",
  "request.save",
  "common.ok",
  "common.failed"
] as const satisfies readonly MessageKey[];

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    id: "",
    title: "",
    companyId: "",
    companyName: "",
    tagsInput: "",
    businesses: [] as string[],
    content: "",
    status: "open" as "open" | "closed",
    loading: false
  },
  onLoad(query: Record<string, string | undefined>) {
    syncPageI18n(this, I18N_KEYS);
    const id = query.id ? String(query.id) : "";
    this.setData({ id });
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("request.editTitle") });
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    this.load();
  },
  onInputTitle(e: WechatMiniprogram.Input) {
    this.setData({ title: e.detail.value });
  },
  onInputCompanyName(e: WechatMiniprogram.Input) {
    this.setData({ companyName: e.detail.value, companyId: "" });
  },
  onInputTags(e: WechatMiniprogram.Input) {
    const tagsInput = e.detail.value;
    this.setData({ tagsInput, businesses: parseBusinesses(tagsInput) });
  },
  onTapRemoveBusiness(e: WechatMiniprogram.BaseEvent) {
    const business = (e.currentTarget as any)?.dataset?.business as string | undefined;
    if (!business) return;
    const next = this.data.businesses.filter((x) => x !== business);
    this.setData({ businesses: next, tagsInput: toTagsInput(next) });
  },
  addBusiness(business: string) {
    const b = String(business || "").trim();
    if (!b) return;
    const next = [...this.data.businesses];
    if (!next.includes(b)) next.push(b);
    const limited = next.slice(0, 10);
    this.setData({ businesses: limited, tagsInput: toTagsInput(limited) });
  },
  onTapPickTags() {
    listPopularTags({ limit: 12 })
      .then((items) => {
        const options = [t("request.tagsCustom"), ...items.map((x) => `${x.tag} (${x.count})`)];
        wx.showActionSheet({
          itemList: options,
          success: (res) => {
            if (res.tapIndex === 0) {
              wx.showModal({
                title: t("request.tagsCustom"),
                editable: true,
                placeholderText: t("request.tags"),
                success: (r) => {
                  if (!r.confirm) return;
                  const value = String((r as any).content || "").trim();
                  this.addBusiness(value);
                }
              });
              return;
            }
            const chosen = items[res.tapIndex - 1];
            if (!chosen?.tag) return;
            this.addBusiness(chosen.tag);
          }
        });
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      });
  },
  onInputContent(e: WechatMiniprogram.Input) {
    this.setData({ content: e.detail.value });
  },
  onTapSave() {
    if (this.data.loading) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    const title = this.data.title.trim();
    const companyId = this.data.companyId.trim();
    const companyName = this.data.companyName.trim();
    const content = this.data.content.trim();
    const tags = parseBusinesses(this.data.tagsInput);
    if (tags.length === 0) {
      wx.showToast({ title: t("request.businessRequired"), icon: "none" });
      return;
    }
    if (!content) {
      wx.showToast({ title: t("common.failed"), icon: "none" });
      return;
    }
    this.setData({ loading: true });
    updateRequest({ id: this.data.id, title, companyId, companyName, content, tags, status: this.data.status })
      .then(() => {
        wx.showToast({ title: t("common.ok"), icon: "success" });
        wx.redirectTo({ url: `/pages/request-detail/index?id=${encodeURIComponent(this.data.id)}` });
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },
  load() {
    if (this.data.loading) return;
    if (!this.data.id) return;
    this.setData({ loading: true });
    return getRequest(this.data.id)
      .then((r) => {
        if (!r) return;
        this.setData({
          title: r.title,
          companyId: r.companyId || "",
          companyName: r.companyName || "",
          content: r.content,
          tagsInput: Array.isArray(r.tags) ? r.tags.join(", ") : "",
          businesses: Array.isArray(r.tags) ? parseBusinesses(r.tags.join(", ")) : [],
          status: r.status === "closed" ? "closed" : "open"
        });
      })
      .catch(() => {})
      .finally(() => {
        this.setData({ loading: false });
      });
  }
});

function parseBusinesses(tagsInput: string): string[] {
  const raw = String(tagsInput || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const uniq: string[] = [];
  for (const x of raw) {
    if (!uniq.includes(x)) uniq.push(x);
    if (uniq.length >= 10) break;
  }
  return uniq;
}

function toTagsInput(items: string[]) {
  return (items || []).filter(Boolean).slice(0, 10).join(", ");
}
