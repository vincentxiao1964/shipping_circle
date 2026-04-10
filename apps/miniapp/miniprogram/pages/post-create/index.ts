import { createPost } from "../../services/posts";
import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = ["post.create", "post.title", "post.content", "post.publish", "common.ok", "post.untitled", "post.emptyContent", "common.failed"] as const satisfies readonly MessageKey[];

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    title: "",
    content: ""
  },
  onLoad() {
    syncPageI18n(this, I18N_KEYS);
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("post.create") });
  },
  onInputTitle(e: WechatMiniprogram.Input) {
    this.setData({ title: e.detail.value });
  },
  onInputContent(e: WechatMiniprogram.Input) {
    this.setData({ content: e.detail.value });
  },
  onTapPublish() {
    const title = this.data.title.trim() || t("post.untitled");
    const content = this.data.content.trim();
    if (!content) {
      wx.showToast({ title: t("post.emptyContent"), icon: "none" });
      return;
    }
    createPost({ title, content })
      .then((post) => {
        wx.showToast({ title: t("common.ok"), icon: "success" });
        wx.redirectTo({ url: `/pages/post-detail/index?id=${encodeURIComponent(post.id)}` });
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      });
  }
});
