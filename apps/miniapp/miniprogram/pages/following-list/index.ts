import { getToken } from "../../services/api";
import { getUserId } from "../../services/auth";
import { getIsFollowing, syncFollowingFromRemote, toggleFollow } from "../../services/follows";
import { getUserFollowingPage, type UserProfile } from "../../services/users";
import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = ["followingList.title", "followingList.empty", "common.failed", "common.noMore", "common.refresh", "user.follow", "user.unfollow"] as const satisfies readonly MessageKey[];

const PAGE_LIMIT = 20;

type UserRow = UserProfile & {
  isFollowing: boolean;
  canFollow: boolean;
};

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    id: "",
    meUserId: "",
    items: [] as UserRow[],
    cursor: null as string | null,
    hasMore: true,
    loading: false
  },
  onLoad(query: Record<string, string | undefined>) {
    syncPageI18n(this, I18N_KEYS);
    const id = query.id ? String(query.id) : "";
    this.setData({ id, meUserId: getUserId() ?? "" });
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("followingList.title") });
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
  onTapUser(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    wx.navigateTo({ url: `/pages/user/index?id=${encodeURIComponent(id)}` });
  },
  onTapFollow(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    this.setData({ loading: true });
    toggleFollow(id)
      .then(() => syncFollowingFromRemote())
      .then(() => {
        const next = this.data.items.map((u) => (u.id === id ? { ...u, isFollowing: getIsFollowing(id) } : u));
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
    if (!this.data.id) return;
    this.setData({ loading: true });
    return getUserFollowingPage({ id: this.data.id, limit: PAGE_LIMIT })
      .then((page) => {
        const me = this.data.meUserId;
        const rows: UserRow[] = (page?.items ?? []).map((u) => ({
          ...u,
          isFollowing: getIsFollowing(u.id),
          canFollow: Boolean(u.id && u.id !== me)
        }));
        this.setData({
          items: rows,
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
    if (!this.data.id) return;
    if (!this.data.hasMore) {
      wx.showToast({ title: t("common.noMore"), icon: "none" });
      return;
    }
    this.setData({ loading: true });
    getUserFollowingPage({ id: this.data.id, limit: PAGE_LIMIT, cursor: this.data.cursor ?? undefined })
      .then((page) => {
        const me = this.data.meUserId;
        const rows: UserRow[] = (page?.items ?? []).map((u) => ({
          ...u,
          isFollowing: getIsFollowing(u.id),
          canFollow: Boolean(u.id && u.id !== me)
        }));
        this.setData({
          items: [...this.data.items, ...rows],
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
