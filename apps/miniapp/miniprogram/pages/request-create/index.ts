import { createRequest, listPopularTags } from "../../services/requests";
import { getToken } from "../../services/api";
import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = [
  "request.createTitle",
  "request.title",
  "request.companyName",
  "request.tags",
  "request.tagsPick",
  "request.tagsCustom",
  "request.businessRequired",
  "request.content",
  "request.publish",
  "common.ok",
  "common.failed"
] as const satisfies readonly MessageKey[];

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    title: "",
    companyName: "",
    tagsInput: "",
    businesses: [] as string[],
    content: "",
    loading: false
  },
  onLoad(query: Record<string, string | undefined>) {
    syncPageI18n(this, I18N_KEYS);
    const companyName = query.companyName ? String(query.companyName) : "";
    const business = query.business ? String(query.business) : "";
    const tagsInput = business ? business : this.data.tagsInput;
    this.setData({
      companyName,
      tagsInput,
      businesses: parseBusinesses(tagsInput)
    });
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("request.createTitle") });
    if (!getToken()) wx.navigateTo({ url: "/pages/login/index" });
  },
  onInputTitle(e: WechatMiniprogram.Input) {
    this.setData({ title: e.detail.value });
  },
  onInputCompanyName(e: WechatMiniprogram.Input) {
    this.setData({ companyName: e.detail.value });
  },
  onInputContent(e: WechatMiniprogram.Input) {
    this.setData({ content: e.detail.value });
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
  onTapPublish() {
    if (this.data.loading) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    const title = this.data.title.trim();
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
    createRequest({ title, companyName, content, tags })
      .then((item) => {
        wx.showToast({ title: t("common.ok"), icon: "success" });
        wx.redirectTo({ url: `/pages/request-detail/index?id=${encodeURIComponent(item.id)}` });
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      })
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
