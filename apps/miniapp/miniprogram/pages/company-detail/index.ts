import { getCompany } from "../../services/companies";
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
      url: `/pages/request-create/index?companyName=${encodeURIComponent(this.data.item.name)}&business=${encodeURIComponent(business || "")}`
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
            followerCount: r.followerCount
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
        this.setData({ item });
        if (item?.name) {
          return listRequestsPage({ limit: 10, company: item.name }).then((page) => {
            this.setData({ related: page.items });
          });
        }
      })
      .catch(() => {
        this.setData({ item: null });
        wx.showToast({ title: t("common.failed"), icon: "none" });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  }
});
