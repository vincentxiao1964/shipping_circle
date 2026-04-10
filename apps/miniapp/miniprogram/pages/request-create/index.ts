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
    content: "",
    loading: false
  },
  onLoad(query: Record<string, string | undefined>) {
    syncPageI18n(this, I18N_KEYS);
    const companyName = query.companyName ? String(query.companyName) : "";
    const business = query.business ? String(query.business) : "";
    this.setData({
      companyName,
      tagsInput: business ? business : this.data.tagsInput
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
    this.setData({ tagsInput: e.detail.value });
  },
  onTapPickTags() {
    listPopularTags({ limit: 12 })
      .then((items) => {
        const options = [t("request.tagsCustom"), ...items.map((x) => `${x.tag} (${x.count})`)];
        wx.showActionSheet({
          itemList: options,
          success: (res) => {
            if (res.tapIndex === 0) return;
            const chosen = items[res.tapIndex - 1];
            if (!chosen?.tag) return;
            const existing = this.data.tagsInput
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean);
            if (!existing.includes(chosen.tag)) existing.push(chosen.tag);
            this.setData({ tagsInput: existing.slice(0, 10).join(", ") });
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
    const tags = this.data.tagsInput
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 10);
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
