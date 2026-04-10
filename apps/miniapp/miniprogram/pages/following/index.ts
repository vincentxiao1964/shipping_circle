import { getToken } from "../../services/api";
import { syncFollowingFromRemote, toggleFollow } from "../../services/follows";
import { getUsersByIds, type UserProfile } from "../../services/users";
import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = ["following.title", "following.empty", "user.unfollow", "common.failed", "common.refresh"] as const satisfies readonly MessageKey[];

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    items: [] as UserProfile[],
    loading: false
  },
  onLoad() {
    syncPageI18n(this, I18N_KEYS);
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("following.title") });
    this.load();
  },
  onTapRefresh() {
    this.load();
  },
  onTapUser(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    wx.navigateTo({ url: `/pages/user/index?id=${encodeURIComponent(id)}` });
  },
  onTapUnfollow(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    this.setData({ loading: true });
    toggleFollow(id)
      .then(() => this.load())
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },
  load() {
    if (this.data.loading) return;
    if (!getToken()) {
      this.setData({ items: [] });
      return;
    }
    this.setData({ loading: true });
    syncFollowingFromRemote()
      .then((items) => {
        const ids = items ?? [];
        return getUsersByIds(ids).then((profiles) => {
          const map = new Map(profiles.map((p) => [p.id, p]));
          const ordered = ids.map((id) => map.get(id) ?? { id, displayName: id });
          this.setData({ items: ordered });
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
