import { getToken } from "../../services/api";
import { listMyIntroductionsPage, type MyIntroductionListItem } from "../../services/requests";
import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = ["intro.mineTitle", "intro.empty", "request.resolveSuccess", "request.resolveFail", "common.failed", "common.noMore", "common.refresh"] as const satisfies readonly MessageKey[];

const PAGE_LIMIT = 20;

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    items: [] as MyIntroductionListItem[],
    cursor: null as string | null,
    hasMore: true,
    loading: false
  },
  onLoad() {
    syncPageI18n(this, I18N_KEYS);
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("intro.mineTitle") });
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
  onTapItem(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    wx.navigateTo({ url: `/pages/request-detail/index?id=${encodeURIComponent(id)}` });
  },
  loadFirstPage() {
    if (this.data.loading) return;
    if (!getToken()) return;
    this.setData({ loading: true });
    return listMyIntroductionsPage({ limit: PAGE_LIMIT })
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
    listMyIntroductionsPage({ limit: PAGE_LIMIT, cursor: this.data.cursor ?? undefined })
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

