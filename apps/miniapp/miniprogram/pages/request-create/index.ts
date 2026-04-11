import { createRequest, listPopularTags } from "../../services/requests";
import { getToken } from "../../services/api";
import { listCompaniesPage, resolveCompanyByName, type CompanyListItem } from "../../services/companies";
import { getMe } from "../../services/users";
import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = [
  "request.createTitle",
  "request.title",
  "request.companyName",
  "company.create",
  "request.tags",
  "request.tagsPick",
  "request.tagsCustom",
  "request.businessRequired",
  "request.companyMatched",
  "request.companySuggest",
  "request.ownerContactChannel",
  "request.ownerContactChannelHint",
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
    companyId: "",
    companyName: "",
    companySuggestItems: [] as CompanyListItem[],
    companySuggestVisible: false,
    tagsInput: "",
    businesses: [] as string[],
    ownerContactChannel: "",
    content: "",
    loading: false
  },
  onLoad(query: Record<string, string | undefined>) {
    syncPageI18n(this, I18N_KEYS);
    const companyId = query.companyId ? String(query.companyId) : "";
    const companyName = query.companyName ? String(query.companyName) : "";
    const business = query.business ? String(query.business) : "";
    const tagsInput = business ? business : this.data.tagsInput;
    this.setData({
      companyId,
      companyName,
      tagsInput,
      businesses: parseBusinesses(tagsInput)
    });
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("request.createTitle") });
    if (!getToken()) wx.navigateTo({ url: "/pages/login/index" });
    if (getToken() && !this.data.ownerContactChannel) {
      getMe().then((me) => {
        if (!me?.contactChannel) return;
        if (this.data.ownerContactChannel) return;
        this.setData({ ownerContactChannel: me.contactChannel });
      });
    }
  },
  onUnload() {
    const timer = (this as any)._resolveTimer as any;
    if (timer) clearTimeout(timer);
    const t2 = (this as any)._suggestTimer as any;
    if (t2) clearTimeout(t2);
    const t3 = (this as any)._blurHideTimer as any;
    if (t3) clearTimeout(t3);
  },
  onInputTitle(e: WechatMiniprogram.Input) {
    this.setData({ title: e.detail.value });
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
    wx.showToast({ title: t("request.companyMatched", { name: name || this.data.companyName }), icon: "none" });
  },
  onTapCreateCompany() {
    const name = this.data.companyName.trim();
    const businesses = (this.data.businesses || []).filter(Boolean).slice(0, 10).join(",");
    wx.navigateTo({
      url: `/pages/company-create/index?name=${encodeURIComponent(name)}&businesses=${encodeURIComponent(businesses)}&returnTo=back`,
      events: {
        created: (item: any) => {
          const id = String(item?.id || "").trim();
          const cname = String(item?.name || "").trim();
          if (!id) return;
          this.setData({
            companyId: id,
            companyName: cname || this.data.companyName,
            companySuggestVisible: false,
            companySuggestItems: []
          });
          wx.showToast({ title: t("request.companyMatched", { name: cname || this.data.companyName }), icon: "none" });
        }
      }
    });
  },
  onInputContent(e: WechatMiniprogram.Input) {
    this.setData({ content: e.detail.value });
  },
  onInputOwnerContactChannel(e: WechatMiniprogram.Input) {
    this.setData({ ownerContactChannel: e.detail.value });
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
        wx.showToast({ title: t("request.companyMatched", { name: item.name || name }), icon: "none" });
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
    const companyId = this.data.companyId.trim();
    const companyName = this.data.companyName.trim();
    const ownerContactChannel = this.data.ownerContactChannel.trim();
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
    createRequest({ title, companyId, companyName, ownerContactChannel, content, tags })
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
