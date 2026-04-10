import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = [
  "tools.title",
  "tools.subtitle",
  "tools.entry.search",
  "tools.entry.companyFollowing",
  "tools.entry.intros",
  "tools.entry.score"
] as const satisfies readonly MessageKey[];

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {}
  },
  onLoad() {
    syncPageI18n(this, I18N_KEYS);
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("tools.title") });
  },
  onTapEntry(e: WechatMiniprogram.BaseEvent) {
    const key = (e.currentTarget as any)?.dataset?.key as string | undefined;
    if (!key) return;
    const map: Record<string, string> = {
      search: "/pages/search/index",
      companyFollowing: "/pages/company-following/index",
      intros: "/pages/my-introductions/index",
      score: "/pages/profile/index"
    };
    const url = map[key];
    if (!url) return;
    wx.navigateTo({ url });
  }
});
