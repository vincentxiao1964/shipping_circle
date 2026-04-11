import { setLocale, syncPageI18n, t, type Locale, type MessageKey } from "../../utils/i18n";
import { getApiConfig, getToken, setApiBaseUrl } from "../../services/api";
import { clearUser, getUserId, logoutRemote } from "../../services/auth";
import { listCompaniesPage, resolveCompanyByName, type CompanyListItem } from "../../services/companies";
import { getMe, getUserStats, updateMeDisplayName, updateMeProfile } from "../../services/users";

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
  "me.company",
  "me.companyHint",
  "me.businesses",
  "me.businessesHint",
  "me.titleLabel",
  "me.titleHint",
  "me.contactChannel",
  "me.contactChannelHint",
  "me.visibility",
  "me.visibility.loggedIn",
  "me.visibility.mutual",
  "me.visibility.private",
  "me.saveProfile",
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
    companyId: "",
    companyName: "",
    companySuggestItems: [] as CompanyListItem[],
    companySuggestVisible: false,
    businessesInput: "",
    titleInput: "",
    contactChannelInput: "",
    contactVisibility: "loggedIn" as "loggedIn" | "mutual" | "private",
    contactVisibilityText: "",
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
      logoutRemote().finally(() => {
        clearUser();
        this.updateView();
      });
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
  onInputCompanyName(e: WechatMiniprogram.Input) {
    this.setData({ companyName: e.detail.value, companyId: "" });
    this.scheduleResolveCompany();
    this.scheduleCompanySuggest();
  },
  onBlurCompanyName() {
    this.resolveCompanyNow();
    const t3 = (this as any)._blurHideTimer as any;
    if (t3) clearTimeout(t3);
    (this as any)._blurHideTimer = setTimeout(() => {
      this.setData({ companySuggestVisible: false });
    }, 200);
  },
  onTapSelectCompany(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    const name = (e.currentTarget as any)?.dataset?.name as string | undefined;
    if (!id) return;
    const t3 = (this as any)._blurHideTimer as any;
    if (t3) clearTimeout(t3);
    this.setData({
      companyId: id,
      companyName: name || this.data.companyName,
      companySuggestVisible: false,
      companySuggestItems: []
    });
  },
  onInputBusinesses(e: WechatMiniprogram.Input) {
    this.setData({ businessesInput: e.detail.value });
  },
  onInputTitle(e: WechatMiniprogram.Input) {
    this.setData({ titleInput: e.detail.value });
  },
  onInputContactChannel(e: WechatMiniprogram.Input) {
    this.setData({ contactChannelInput: e.detail.value });
  },
  onTapPickVisibility() {
    const options = [t("me.visibility.loggedIn"), t("me.visibility.mutual"), t("me.visibility.private")];
    wx.showActionSheet({
      itemList: options,
      success: (res) => {
        const v = res.tapIndex === 1 ? "mutual" : res.tapIndex === 2 ? "private" : "loggedIn";
        const label = v === "mutual" ? t("me.visibility.mutual") : v === "private" ? t("me.visibility.private") : t("me.visibility.loggedIn");
        this.setData({ contactVisibility: v, contactVisibilityText: label });
      }
    });
  },
  onTapSaveProfile() {
    if (!this.data.isAuthed) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    const displayName = this.data.displayNameInput.trim();
    if (!displayName) return;
    const companyId = this.data.companyId.trim();
    const companyName = this.data.companyName.trim();
    const businesses = this.data.businessesInput
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 20);
    const title = this.data.titleInput.trim();
    const contactChannel = this.data.contactChannelInput.trim();
    const contactVisibility = this.data.contactVisibility;
    updateMeProfile({ displayName, companyId, companyName, businesses, title, contactChannel, contactVisibility }).then((u) => {
      if (u?.displayName) wx.setStorageSync("sc_displayName", u.displayName);
      wx.showToast({ title: t("common.ok"), icon: "success" });
      this.updateView();
    });
  },
  scheduleResolveCompany() {
    const timer = (this as any)._resolveTimer as any;
    if (timer) clearTimeout(timer);
    (this as any)._resolveTimer = setTimeout(() => this.resolveCompanyNow(), 350);
  },
  resolveCompanyNow() {
    const name = this.data.companyName.trim();
    if (!name) return;
    if (this.data.companyId) return;
    resolveCompanyByName(name)
      .then((item) => {
        if (!item?.id) return;
        if (this.data.companyId) return;
        this.setData({ companyId: item.id, companyName: item.name || this.data.companyName });
      })
      .catch(() => {});
  },
  scheduleCompanySuggest() {
    const timer = (this as any)._suggestTimer as any;
    if (timer) clearTimeout(timer);
    (this as any)._suggestTimer = setTimeout(() => this.loadCompanySuggest(), 250);
  },
  loadCompanySuggest() {
    const q = this.data.companyName.trim();
    if (!q) {
      this.setData({ companySuggestItems: [], companySuggestVisible: false });
      return;
    }
    if (this.data.companyId) {
      this.setData({ companySuggestItems: [], companySuggestVisible: false });
      return;
    }
    listCompaniesPage({ q, limit: 6 })
      .then((page) => {
        const items = Array.isArray(page?.items) ? page.items : [];
        if (this.data.companyId) return;
        if (this.data.companyName.trim() !== q) return;
        this.setData({ companySuggestItems: items, companySuggestVisible: true });
      })
      .catch(() => {
        this.setData({ companySuggestItems: [], companySuggestVisible: true });
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
      displayNameInput: storedName,
      contactVisibilityText: t("me.visibility.loggedIn")
    });
    wx.setNavigationBarTitle({ title: t("me.title") });
    if (isAuthed) {
      getMe().then((me) => {
        if (!me?.displayName) return;
        wx.setStorageSync("sc_displayName", me.displayName);
        const visibility =
          me.contactVisibility === "mutual" ? "mutual" : me.contactVisibility === "private" ? "private" : "loggedIn";
        const label =
          visibility === "mutual" ? t("me.visibility.mutual") : visibility === "private" ? t("me.visibility.private") : t("me.visibility.loggedIn");
        this.setData({
          displayNameInput: me.displayName,
          companyId: me.companyId || "",
          companyName: me.companyName || "",
          businessesInput: Array.isArray(me.businesses) ? me.businesses.join(", ") : "",
          titleInput: me.title || "",
          contactChannelInput: me.contactChannel || "",
          contactVisibility: visibility,
          contactVisibilityText: label
        });
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
