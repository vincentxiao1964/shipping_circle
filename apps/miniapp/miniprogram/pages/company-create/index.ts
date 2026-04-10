import { getToken } from "../../services/api";
import { createCompany } from "../../services/companies";
import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = [
  "company.createTitle",
  "company.name",
  "company.region",
  "company.tags",
  "company.businesses",
  "company.publish",
  "common.ok",
  "common.failed"
] as const satisfies readonly MessageKey[];

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    name: "",
    region: "",
    tagsInput: "",
    businessesInput: "",
    loading: false
  },
  onLoad() {
    syncPageI18n(this, I18N_KEYS);
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("company.createTitle") });
    if (!getToken()) wx.navigateTo({ url: "/pages/login/index" });
  },
  onInputName(e: WechatMiniprogram.Input) {
    this.setData({ name: e.detail.value });
  },
  onInputRegion(e: WechatMiniprogram.Input) {
    this.setData({ region: e.detail.value });
  },
  onInputTags(e: WechatMiniprogram.Input) {
    this.setData({ tagsInput: e.detail.value });
  },
  onInputBusinesses(e: WechatMiniprogram.Input) {
    this.setData({ businessesInput: e.detail.value });
  },
  onTapPublish() {
    if (this.data.loading) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    const name = this.data.name.trim();
    const region = this.data.region.trim();
    const tags = this.data.tagsInput
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 10);
    const businesses = this.data.businessesInput
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 20);
    const roles = businesses.map((b) => ({ business: b, title: "负责人" }));

    if (!name || roles.length === 0) {
      wx.showToast({ title: t("common.failed"), icon: "none" });
      return;
    }

    this.setData({ loading: true });
    createCompany({ name, region, tags, roles })
      .then((item) => {
        wx.showToast({ title: t("common.ok"), icon: "success" });
        wx.redirectTo({ url: `/pages/company-detail/index?id=${encodeURIComponent(item.id)}` });
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  }
});

