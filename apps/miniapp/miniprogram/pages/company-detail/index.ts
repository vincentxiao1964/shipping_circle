import { getCompany } from "../../services/companies";
import { matchContacts, type ContactMatchGroup } from "../../services/contacts";
import { listRequestsPage, type RequestListItem } from "../../services/requests";
import { getToken } from "../../services/api";
import { toggleCompanyFollow } from "../../services/companies";
import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = [
  "company.detailTitle",
  "company.tags",
  "company.roles",
  "company.createRequest",
  "company.relatedRequests",
  "company.follow",
  "company.unfollow",
  "company.followersCount",
  "contact.sectionTitle",
  "contact.empty",
  "contact.copy",
  "contact.copied",
  "contact.stale",
  "contact.candidate",
  "common.refresh",
  "common.failed",
  "common.notFound"
] as const satisfies readonly MessageKey[];

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    id: "",
    item: null as any,
    related: [] as RequestListItem[],
    contactGroups: [] as ContactMatchGroup[],
    contactLoading: false,
    loading: false
  },
  onLoad(query: Record<string, string | undefined>) {
    syncPageI18n(this, I18N_KEYS);
    const id = query.id ? String(query.id) : "";
    this.setData({ id });
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("company.detailTitle") });
    this.load();
  },
  onPullDownRefresh() {
    Promise.resolve(this.load()).finally(() => wx.stopPullDownRefresh());
  },
  onTapRefresh() {
    this.load();
  },
  onTapRequest(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    wx.navigateTo({ url: `/pages/request-detail/index?id=${encodeURIComponent(id)}` });
  },
  onTapCreateRequest(e: WechatMiniprogram.BaseEvent) {
    const business = (e.currentTarget as any)?.dataset?.business as string | undefined;
    if (!this.data.item) return;
    wx.navigateTo({
      url: `/pages/request-create/index?companyId=${encodeURIComponent(this.data.item.id)}&companyName=${encodeURIComponent(this.data.item.name)}&business=${encodeURIComponent(business || "")}`
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
  onTapToggleFollow() {
    if (!this.data.item?.id) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    this.setData({ loading: true });
    toggleCompanyFollow(this.data.item.id)
      .then((r) => {
        if (!r) return;
        this.setData({
          item: {
            ...this.data.item,
            followedByMe: r.following,
            followerCount: r.followerCount,
            followersText: t("company.followersCount", { count: r.followerCount })
          }
        });
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
    return getCompany(this.data.id)
      .then((item) => {
        const followerCount = typeof item?.followerCount === "number" ? item.followerCount : 0;
        this.setData({ item: item ? { ...item, followersText: t("company.followersCount", { count: followerCount }) } : item });
        if (item?.name) {
          return Promise.all([
            listRequestsPage({ limit: 10, company: item.name }).then((page) => {
              this.setData({ related: page.items });
            }),
            this.loadContacts(item)
          ]).then(() => {});
        }
      })
      .catch(() => {
        this.setData({ item: null });
        wx.showToast({ title: t("common.failed"), icon: "none" });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },
  loadContacts(item: any) {
    if (!item?.name) {
      this.setData({ contactGroups: [] });
      return Promise.resolve();
    }
    if (!getToken()) {
      this.setData({ contactGroups: [] });
      return Promise.resolve();
    }
    if (this.data.contactLoading) return Promise.resolve();
    this.setData({ contactLoading: true });
    const businesses = Array.isArray(item.roles) ? item.roles.map((r: any) => String(r?.business || "").trim()).filter(Boolean) : [];
    return matchContacts({ companyId: item.id, companyName: item.name, businesses, limit: 5 })
      .then((groups) => {
        this.setData({ contactGroups: groups });
      })
      .finally(() => {
        this.setData({ contactLoading: false });
      });
  }
});
