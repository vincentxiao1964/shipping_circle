import { listCompaniesPage, toggleCompanyFollow, type CompanyListItem } from "../../services/companies";
import { getToken } from "../../services/api";
import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = [
  "company.searchTitle",
  "company.searchPlaceholder",
  "company.searchHint",
  "company.empty",
  "company.create",
  "company.createRequest",
  "company.follow",
  "company.unfollow",
  "common.failed",
  "common.noMore",
  "common.refresh"
] as const satisfies readonly MessageKey[];

const PAGE_LIMIT = 10;

type CompanyRow = CompanyListItem & { followersText: string };

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    q: "",
    items: [] as CompanyRow[],
    cursor: null as string | null,
    hasMore: true,
    loading: false,
    hintVisible: true
  },
  onLoad() {
    syncPageI18n(this, I18N_KEYS);
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("company.searchTitle") });
    this.loadFirstPage();
  },
  onPullDownRefresh() {
    Promise.resolve(this.loadFirstPage()).finally(() => wx.stopPullDownRefresh());
  },
  onUnload() {
    const timer = (this as any)._debounce as any;
    if (timer) clearTimeout(timer);
  },
  onReachBottom() {
    this.loadMore();
  },
  onInput(e: WechatMiniprogram.Input) {
    this.setData({ q: e.detail.value });
    const timer = (this as any)._debounce as any;
    if (timer) clearTimeout(timer);
    (this as any)._debounce = setTimeout(() => {
      this.loadFirstPage();
    }, 250);
  },
  onTapRefresh() {
    this.loadFirstPage();
  },
  onTapCreate() {
    wx.navigateTo({ url: "/pages/company-create/index" });
  },
  onTapCompany(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    wx.navigateTo({ url: `/pages/company-detail/index?id=${encodeURIComponent(id)}` });
  },
  onTapCreateRequest(e: WechatMiniprogram.BaseEvent) {
    const companyId = (e.currentTarget as any)?.dataset?.companyId as string | undefined;
    const companyName = (e.currentTarget as any)?.dataset?.companyName as string | undefined;
    const business = (e.currentTarget as any)?.dataset?.business as string | undefined;
    wx.navigateTo({
      url: `/pages/request-create/index?companyId=${encodeURIComponent(companyId || "")}&companyName=${encodeURIComponent(companyName || "")}&business=${encodeURIComponent(business || "")}`
    });
  },
  onTapFollowCompany(e: WechatMiniprogram.BaseEvent) {
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
        const next = this.data.items.map((c) =>
          c.id === id
            ? {
                ...c,
                followedByMe: r.following,
                followerCount: r.followerCount,
                followersText: t("company.followersCount", { count: r.followerCount })
              }
            : c
        );
        this.setData({ items: next });
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },
  loadFirstPage() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    const q = this.data.q.trim();
    const hintVisible = q.length === 0;
    this.setData({ hintVisible });

    return listCompaniesPage({ q, limit: PAGE_LIMIT })
      .then((page) => {
        const items: CompanyRow[] = page.items.map((c) => ({
          ...c,
          followersText: t("company.followersCount", { count: typeof c.followerCount === "number" ? c.followerCount : 0 })
        }));
        this.setData({ items, cursor: page.nextCursor, hasMore: page.hasMore });
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
    if (!this.data.hasMore) {
      wx.showToast({ title: t("common.noMore"), icon: "none" });
      return;
    }
    this.setData({ loading: true });
    const q = this.data.q.trim();
    const cursor = this.data.cursor ?? undefined;

    listCompaniesPage({ q, limit: PAGE_LIMIT, cursor })
      .then((page) => {
        const more: CompanyRow[] = page.items.map((c) => ({
          ...c,
          followersText: t("company.followersCount", { count: typeof c.followerCount === "number" ? c.followerCount : 0 })
        }));
        this.setData({ items: [...this.data.items, ...more], cursor: page.nextCursor, hasMore: page.hasMore });
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  }
});
