import { getToken } from "../../services/api";
import { toggleFollow, getIsFollowing, syncFollowingFromRemote } from "../../services/follows";
import { listPostsPage, toggleLike, type PostListItem } from "../../services/posts";
import { getUserId } from "../../services/auth";
import { getUserById, getUserStats, type UserProfile } from "../../services/users";
import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = [
  "user.profile",
  "user.posts",
  "user.follow",
  "user.unfollow",
  "user.followers",
  "user.following",
  "user.followersCount",
  "user.followingCount",
  "post.commentsLabel",
  "post.likesLabel",
  "post.like",
  "post.unlike",
  "post.empty",
  "common.failed",
  "common.noMore",
  "common.refresh"
] as const satisfies readonly MessageKey[];

const PAGE_LIMIT = 10;

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    id: "",
    meUserId: "",
    profile: null as UserProfile | null,
    isFollowing: false,
    followerCount: 0,
    followingCount: 0,
    followerCountText: "",
    followingCountText: "",
    posts: [] as PostListItem[],
    cursor: null as string | null,
    hasMore: true,
    loading: false
  },
  onLoad(query: Record<string, string | undefined>) {
    syncPageI18n(this, I18N_KEYS);
    const id = query.id ? String(query.id) : "";
    this.setData({ id, meUserId: getUserId() ?? "" });
    this.updateCountTexts(0, 0);
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("user.profile") });
    this.refreshProfileAndFirstPage();
  },
  onPullDownRefresh() {
    Promise.resolve(this.refreshProfileAndFirstPage()).finally(() => wx.stopPullDownRefresh());
  },
  onReachBottom() {
    this.loadMore();
  },
  onTapRefresh() {
    this.refreshProfileAndFirstPage();
  },
  onTapFollowers() {
    if (!this.data.id) return;
    wx.navigateTo({ url: `/pages/followers/index?id=${encodeURIComponent(this.data.id)}` });
  },
  onTapFollowing() {
    if (!this.data.id) return;
    if (this.data.id === this.data.meUserId) {
      wx.navigateTo({ url: "/pages/following/index" });
      return;
    }
    wx.navigateTo({ url: `/pages/following-list/index?id=${encodeURIComponent(this.data.id)}` });
  },
  onTapFollow() {
    if (!this.data.profile) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    if (this.data.profile.id === this.data.meUserId) return;
    this.setData({ loading: true });
    toggleFollow(this.data.profile.id)
      .then(() => syncFollowingFromRemote())
      .then(() => {
        const id = this.data.profile!.id;
        this.setData({ isFollowing: getIsFollowing(id) });
        return this.refreshStats();
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },
  onTapPost(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    wx.navigateTo({ url: `/pages/post-detail/index?id=${encodeURIComponent(id)}` });
  },
  onTapLike(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    toggleLike(id)
      .then((r) => {
        const next = this.data.posts.map((p) => (p.id === id ? { ...p, likedByMe: r.liked, likeCount: r.likeCount } : p));
        this.setData({ posts: next });
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      });
  },
  refreshProfileAndFirstPage() {
    if (!this.data.id) return;
    if (getToken()) {
      syncFollowingFromRemote().finally(() => {
        this.setData({ isFollowing: getIsFollowing(this.data.id) });
      });
    } else {
      this.setData({ isFollowing: getIsFollowing(this.data.id) });
    }
    return getUserById(this.data.id)
      .then((profile) => {
        this.setData({ profile });
      })
      .catch(() => {
        this.setData({ profile: null });
      })
      .finally(() => {
        this.refreshStats();
        this.loadFirstPage();
      });
  },
  refreshStats() {
    if (!this.data.id) return Promise.resolve();
    return getUserStats(this.data.id).then((stats) => {
      if (!stats) return;
      this.setData({ followerCount: stats.followerCount, followingCount: stats.followingCount });
      this.updateCountTexts(stats.followerCount, stats.followingCount);
    });
  },
  updateCountTexts(followerCount: number, followingCount: number) {
    this.setData({
      followerCountText: t("user.followersCount", { count: followerCount }),
      followingCountText: t("user.followingCount", { count: followingCount })
    });
  },
  loadFirstPage() {
    if (this.data.loading) return;
    if (!this.data.id) return;
    this.setData({ loading: true });
    return listPostsPage({ feed: "all", limit: PAGE_LIMIT, authorId: this.data.id })
      .then((page) => {
        this.setData({
          posts: page.items,
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
    if (!this.data.id) return;
    if (!this.data.hasMore) {
      wx.showToast({ title: t("common.noMore"), icon: "none" });
      return;
    }
    this.setData({ loading: true });
    listPostsPage({ feed: "all", limit: PAGE_LIMIT, cursor: this.data.cursor ?? undefined, authorId: this.data.id })
      .then((page) => {
        this.setData({
          posts: [...this.data.posts, ...page.items],
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
