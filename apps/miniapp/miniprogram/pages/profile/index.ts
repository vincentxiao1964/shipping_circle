import { setLocale, syncPageI18n, t, type Locale, type MessageKey } from "../../utils/i18n";
import { clearToken, getApiConfig, getToken, setApiBaseUrl } from "../../services/api";
import { clearUser, getUserId } from "../../services/auth";
import { getMe, getUserStats, updateMeDisplayName } from "../../services/users";

const I18N_KEYS = [
  "me.title",
  "me.subtitle",
  "me.language",
  "me.switchLanguage",
  "me.currentLanguage",
  "me.language.zh",
  "me.language.en",
  "me.userId",
  "me.login",
  "me.logout",
  "me.apiBaseUrl",
  "me.apiBaseUrlHint",
  "me.save",
  "me.displayName",
  "me.displayNameHint",
  "me.saveDisplayName",
  "me.points",
  "me.introSuccess",
  "me.introFail",
  "me.skills",
  "common.ok"
] as const satisfies readonly MessageKey[];

Page({
  data: {
    locale: "zh-CN",
    localeVersion: 0,
    i18n: {},
    currentLanguageText: "",
    userId: "",
    isAuthed: false,
    apiBaseUrlInput: "",
    displayNameInput: "",
    points: 0,
    introSuccessCount: 0,
    introFailCount: 0,
    topTags: [] as { tag: string; count: number }[]
  },
  onLoad() {
    this.updateView();
  },
  onShow() {
    this.updateView();
  },
  onTapAuth() {
    if (this.data.isAuthed) {
      clearToken();
      clearUser();
      this.updateView();
      return;
    }
    wx.navigateTo({ url: "/pages/login/index" });
  },
  onTapSwitchLanguage() {
    const options = [t("me.language.zh"), t("me.language.en")];
    wx.showActionSheet({
      itemList: options,
      success: (res) => {
        const locale: Locale = res.tapIndex === 1 ? "en-US" : "zh-CN";
        setLocale(locale);
        this.updateView();
      }
    });
  },
  onInputApiBaseUrl(e: WechatMiniprogram.Input) {
    this.setData({ apiBaseUrlInput: e.detail.value });
  },
  onTapSaveApiBaseUrl() {
    const v = this.data.apiBaseUrlInput.trim();
    if (v) setApiBaseUrl(v);
    wx.showToast({ title: t("common.ok"), icon: "success" });
    this.updateView();
  },
  onInputDisplayName(e: WechatMiniprogram.Input) {
    this.setData({ displayNameInput: e.detail.value });
  },
  onTapSaveDisplayName() {
    if (!this.data.isAuthed) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    const v = this.data.displayNameInput.trim();
    if (!v) return;
    updateMeDisplayName(v).then((u) => {
      if (u?.displayName) wx.setStorageSync("sc_displayName", u.displayName);
      wx.showToast({ title: t("common.ok"), icon: "success" });
      this.updateView();
    });
  },
  updateView() {
    syncPageI18n(this, I18N_KEYS);
    const localeLabel = this.data.locale === "en-US" ? t("me.language.en") : t("me.language.zh");
    const userId = getUserId() ?? "";
    const isAuthed = Boolean(getToken() && userId);
    const { baseUrl } = getApiConfig();
    const storedName = (() => {
      try {
        const v = wx.getStorageSync("sc_displayName");
        return typeof v === "string" ? v : "";
      } catch {
        return "";
      }
    })();
    this.setData({
      currentLanguageText: t("me.currentLanguage", { lang: localeLabel }),
      userId,
      isAuthed,
      apiBaseUrlInput: baseUrl,
      displayNameInput: storedName
    });
    wx.setNavigationBarTitle({ title: t("me.title") });
    if (isAuthed) {
      getMe().then((me) => {
        if (!me?.displayName) return;
        wx.setStorageSync("sc_displayName", me.displayName);
        this.setData({ displayNameInput: me.displayName });
      });
      getUserStats(userId).then((s) => {
        this.setData({
          points: s?.points ?? 0,
          introSuccessCount: s?.introSuccessCount ?? 0,
          introFailCount: s?.introFailCount ?? 0,
          topTags: Array.isArray(s?.topTags) ? s!.topTags! : []
        });
      });
    }
  }
});
