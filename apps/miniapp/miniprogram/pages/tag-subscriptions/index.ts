import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";
import { getToken } from "../../services/api";
import { listPopularTags, type TagCount } from "../../services/requests";
import { getMyTagSubscriptions, updateMyTagSubscriptions } from "../../services/users";

const I18N_KEYS = [
  "subs.title",
  "subs.subtitle",
  "subs.my",
  "subs.popular",
  "subs.addCustom",
  "subs.empty",
  "home.filter.placeholder",
  "common.refresh",
  "common.ok",
  "common.failed"
] as const satisfies readonly MessageKey[];

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    loading: false,
    myTags: [] as string[],
    popularTags: [] as TagCount[]
  },
  onLoad() {
    syncPageI18n(this, I18N_KEYS);
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("subs.title") });
    this.load();
  },
  onTapRefresh() {
    this.load();
  },
  load() {
    if (this.data.loading) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    this.setData({ loading: true });
    Promise.all([getMyTagSubscriptions(), listPopularTags({ limit: 20 })])
      .then(([myTags, popular]) => {
        this.setData({ myTags: myTags.slice(0, 50), popularTags: popular });
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      })
      .finally(() => this.setData({ loading: false }));
  },
  onTapAddCustom() {
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    wx.showModal({
      title: t("subs.addCustom"),
      editable: true,
      placeholderText: t("home.filter.placeholder"),
      success: (r) => {
        if (!r.confirm) return;
        const tag = String((r as any).content || "").trim();
        if (!tag) return;
        this.toggleTag(tag);
      }
    });
  },
  onTapToggle(e: WechatMiniprogram.BaseEvent) {
    const tag = (e.currentTarget as any)?.dataset?.tag as string | undefined;
    if (!tag) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    this.toggleTag(tag);
  },
  toggleTag(tag: string) {
    const k = String(tag || "").trim();
    if (!k) return;
    const set = new Set(this.data.myTags.map((x) => String(x || "").trim()).filter(Boolean));
    if (set.has(k)) set.delete(k);
    else set.add(k);
    const next = Array.from(set.values()).slice(0, 50);
    this.setData({ myTags: next });
    updateMyTagSubscriptions(next)
      .then((items) => {
        this.setData({ myTags: items.slice(0, 50) });
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      });
  }
});
