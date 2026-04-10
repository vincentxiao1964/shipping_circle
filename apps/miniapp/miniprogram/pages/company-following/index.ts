import { getToken } from "../../services/api";
import { listMyFollowedCompaniesPage, toggleCompanyFollow, type CompanyListItem } from "../../services/companies";
import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = [
  "company.followingTitle",
  "company.followingEmpty",
  "company.unfollow",
  "company.createRequest",
  "common.failed",
  "common.noMore",
  "common.refresh"
] as const satisfies readonly MessageKey[];

const PAGE_LIMIT = 20;

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    items: [] as CompanyListItem[],
    cursor: null as string | null,
    hasMore: true,
    loading: false
  },
  onLoad() {
    syncPageI18n(this, I18N_KEYS);
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("company.followingTitle") });
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    this.loadFirstPage();
  },
  onPullDownRefresh() {
    Promise.resolve(this.loadFirstPage()).finally(() => wx.stopPullDownRefresh());
  },
  onReachBottom() {
    this.loadMore();
  },
  onTapRefresh() {
    this.loadFirstPage();
  },
  onTapCompany(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    wx.navigateTo({ url: `/pages/company-detail/index?id=${encodeURIComponent(id)}` });
  },
  onTapUnfollow(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    this.setData({ loading: true });
    toggleCompanyFollow(id)
      .then((r) => {
        if (!r) return;
        if (!r.following) {
          this.setData({ items: this.data.items.filter((c) => c.id !== id) });
        }
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },
  onTapCreateRequest(e: WechatMiniprogram.BaseEvent) {
    const companyName = (e.currentTarget as any)?.dataset?.companyName as string | undefined;
    const business = (e.currentTarget as any)?.dataset?.business as string | undefined;
    wx.navigateTo({
      url: `/pages/request-create/index?companyName=${encodeURIComponent(companyName || "")}&business=${encodeURIComponent(business || "")}`
    });
  },
  loadFirstPage() {
    if (this.data.loading) return;
    if (!getToken()) return;
    this.setData({ loading: true });
    return listMyFollowedCompaniesPage({ limit: PAGE_LIMIT })
      .then((page) => {
        this.setData({
          items: page?.items ?? [],
          cursor: page?.nextCursor ?? null,
          hasMore: page?.hasMore ?? false
        });
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },
  loadMore() {
    if (this.data.loading) return;
    if (!getToken()) return;
    if (!this.data.hasMore) {
      wx.showToast({ title: t("common.noMore"), icon: "none" });
      return;
    }
    this.setData({ loading: true });
    listMyFollowedCompaniesPage({ limit: PAGE_LIMIT, cursor: this.data.cursor ?? undefined })
      .then((page) => {
        this.setData({
          items: [...this.data.items, ...(page?.items ?? [])],
          cursor: page?.nextCursor ?? null,
          hasMore: page?.hasMore ?? false
        });
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  }
});
