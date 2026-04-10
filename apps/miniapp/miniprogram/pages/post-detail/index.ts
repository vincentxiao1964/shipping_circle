import { addComment, getPost, toggleLike, type PostDetail } from "../../services/posts";
import { getToken } from "../../services/api";
import { getUserId } from "../../services/auth";
import { toggleFollow } from "../../services/follows";
import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = [
  "post.detail",
  "post.comment",
  "post.addComment",
  "post.like",
  "post.unlike",
  "post.likesLabel",
  "user.follow",
  "user.unfollow",
  "common.ok",
  "common.failed",
  "common.notFound"
] as const satisfies readonly MessageKey[];

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    id: "",
    post: null as PostDetail | null,
    meUserId: "",
    commentInput: "",
    loading: false
  },
  onLoad(query: Record<string, string | undefined>) {
    syncPageI18n(this, I18N_KEYS);
    const id = query.id ? String(query.id) : "";
    this.setData({ id });
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("post.detail") });
    this.setData({ meUserId: getUserId() ?? "" });
    this.loadPost();
  },
  onTapAuthor() {
    if (!this.data.post?.authorId) return;
    wx.navigateTo({ url: `/pages/user/index?id=${encodeURIComponent(this.data.post.authorId)}` });
  },
  onTapLike() {
    if (!this.data.post) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    toggleLike(this.data.post.id)
      .then((r) => {
        this.setData({
          post: {
            ...this.data.post!,
            likedByMe: r.liked,
            likeCount: r.likeCount
          }
        });
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      });
  },
  onTapFollow() {
    if (!this.data.post) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    if (!this.data.post.authorId || this.data.post.authorId === this.data.meUserId) return;
    toggleFollow(this.data.post.authorId)
      .then(() => this.loadPost())
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      });
  },
  onInputComment(e: WechatMiniprogram.Input) {
    this.setData({ commentInput: e.detail.value });
  },
  onTapAddComment() {
    if (!this.data.post) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    const content = this.data.commentInput.trim();
    if (!content) return;
    addComment(this.data.post.id, content)
      .then(() => {
        this.setData({ commentInput: "" });
        wx.showToast({ title: t("common.ok"), icon: "success" });
        this.loadPost();
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      });
  },
  loadPost() {
    if (this.data.loading) return;
    if (!this.data.id) {
      this.setData({ post: null });
      return;
    }
    this.setData({ loading: true });
    getPost(this.data.id)
      .then((post) => {
        this.setData({ post });
      })
      .catch(() => {
        this.setData({ post: null });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  }
});
