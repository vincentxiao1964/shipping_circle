import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";
import { getToken } from "../../services/api";
import { listPopularTags, listRequestsPage, type RequestListItem } from "../../services/requests";

const I18N_KEYS = [
  "home.title",
  "home.subtitle",
  "home.tab.square",
  "home.tab.mine",
  "home.filter.all",
  "home.filter.tag",
  "home.filter.placeholder",
  "home.filter.custom",
  "request.create",
  "company.searchTitle",
  "common.refresh",
  "common.noMore",
  "request.introCount",
  "request.priceHint",
  "request.closed",
  "request.empty",
  "common.failed"
] as const satisfies readonly MessageKey[];

const PAGE_LIMIT = 10;

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    items: [] as RequestListItem[],
    tab: "square" as "square" | "mine",
    tag: "",
    cursor: null as string | null,
    hasMore: true,
    loading: false
  },
  onLoad() {
    syncPageI18n(this, I18N_KEYS);
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("home.title") });
    this.loadFirstPage();
  },
  onPullDownRefresh() {
    Promise.resolve(this.loadFirstPage()).finally(() => wx.stopPullDownRefresh());
  },
  onReachBottom() {
    this.loadMore();
  },
  onTapCreateRequest() {
    const token = getToken();
    if (!token) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    wx.navigateTo({ url: "/pages/request-create/index" });
  },
  onTapItem(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    wx.navigateTo({ url: `/pages/request-detail/index?id=${encodeURIComponent(id)}` });
  },
  onTapSearch() {
    wx.navigateTo({ url: "/pages/search/index" });
  },
  onTapTabSquare() {
    if (this.data.tab === "square") return;
    this.setData({ tab: "square", tag: "" });
    this.loadFirstPage();
  },
  onTapTabMine() {
    if (this.data.tab === "mine") return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    this.setData({ tab: "mine", tag: "" });
    this.loadFirstPage();
  },
  onTapFilterAll() {
    if (!this.data.tag) return;
    this.setData({ tag: "" });
    this.loadFirstPage();
  },
  onTapFilterTag() {
    if (this.data.tab !== "square") return;
    listPopularTags({ limit: 10 })
      .then((items) => {
        const options = [t("home.filter.custom"), ...items.map((x) => `${x.tag} (${x.count})`)];
        wx.showActionSheet({
          itemList: options,
          success: (res) => {
            if (res.tapIndex === 0) {
              wx.showModal({
                title: t("home.filter.tag"),
                editable: true,
                placeholderText: t("home.filter.placeholder"),
                success: (r) => {
                  if (!r.confirm) return;
                  const tag = String((r as any).content || "").trim();
                  this.setData({ tag });
                  this.loadFirstPage();
                }
              });
              return;
            }
            const chosen = items[res.tapIndex - 1];
            if (!chosen?.tag) return;
            this.setData({ tag: chosen.tag });
            this.loadFirstPage();
          }
        });
      })
      .catch(() => {
        wx.showModal({
          title: t("home.filter.tag"),
          editable: true,
          placeholderText: t("home.filter.placeholder"),
          success: (r) => {
            if (!r.confirm) return;
            const tag = String((r as any).content || "").trim();
            this.setData({ tag });
            this.loadFirstPage();
          }
        });
      });
  },
  onTapRefresh() {
    this.loadFirstPage();
  },
  formatMoneyRange(range: any) {
    if (!range) return "";
    const currency = String(range.currency || "").trim();
    const min = Number(range.min || 0);
    const max = Number(range.max || 0);
    const count = Number(range.count || 0);
    if (!currency || !Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) return "";
    const text = min === max ? `${currency} ${min}` : `${currency} ${min}-${max}`;
    return count > 0 ? `${text} (n=${count})` : text;
  },
  loadFirstPage() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    return listRequestsPage({
      limit: PAGE_LIMIT,
      mine: this.data.tab === "mine",
      tag: this.data.tab === "square" ? this.data.tag : ""
    })
      .then((page) => {
        this.setData({
          items: page.items,
          cursor: page.nextCursor,
          hasMore: page.hasMore
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
    if (!this.data.hasMore) {
      wx.showToast({ title: t("common.noMore"), icon: "none" });
      return;
    }
    this.setData({ loading: true });
    listRequestsPage({
      limit: PAGE_LIMIT,
      cursor: this.data.cursor ?? undefined,
      mine: this.data.tab === "mine",
      tag: this.data.tab === "square" ? this.data.tag : ""
    })
      .then((page) => {
        this.setData({
          items: [...this.data.items, ...page.items],
          cursor: page.nextCursor,
          hasMore: page.hasMore
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
