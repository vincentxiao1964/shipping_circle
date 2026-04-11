import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";
import { getToken } from "../../services/api";
import { getUserId } from "../../services/auth";
import { listNotifications, markAllNotificationsRead, markNotificationRead, type NotificationItem } from "../../services/notifications";

const I18N_KEYS = [
  "messages.title",
  "messages.empty",
  "messages.markAllRead",
  "messages.system",
  "messages.comment",
  "messages.like",
  "messages.follow",
  "messages.intro",
  "messages.introResult",
  "messages.requestPing",
  "messages.openRequest",
  "messages.introduceNow",
  "common.failed",
  "common.refresh",
  "common.read",
  "common.unread"
] as const satisfies readonly MessageKey[];

type NotificationViewItem = NotificationItem & {
  typeLabel: string;
  readLabel: string;
  postId: string;
  fromUserId: string;
  requestId: string;
  introId: string;
  canQuickIntroduce: boolean;
};

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    items: [] as NotificationViewItem[],
    loading: false
  },
  onLoad() {
    syncPageI18n(this, I18N_KEYS);
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("messages.title") });
    this.loadNotifications();
  },
  onTapRefresh() {
    this.loadNotifications();
  },
  onTapMarkAllRead() {
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    markAllNotificationsRead()
      .then(() => this.loadNotifications())
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      });
  },
  onTapItem(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    const type = (e.currentTarget as any)?.dataset?.type as string | undefined;
    const postId = (e.currentTarget as any)?.dataset?.postId as string | undefined;
    const fromUserId = (e.currentTarget as any)?.dataset?.fromUserId as string | undefined;
    const requestId = (e.currentTarget as any)?.dataset?.requestId as string | undefined;
    if (!id || !type) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    const doNav = () => {
      if ((type === "comment" || type === "like") && postId) {
        wx.navigateTo({ url: `/pages/post-detail/index?id=${encodeURIComponent(postId)}` });
        return;
      }
      if (type === "follow" && fromUserId) {
        wx.navigateTo({ url: `/pages/user/index?id=${encodeURIComponent(fromUserId)}` });
        return;
      }
      if ((type === "intro" || type === "introResult") && requestId) {
        wx.navigateTo({ url: `/pages/request-detail/index?id=${encodeURIComponent(requestId)}` });
      }
      if (type === "requestPing" && requestId) {
        wx.navigateTo({ url: `/pages/request-detail/index?id=${encodeURIComponent(requestId)}` });
      }
    };
    markNotificationRead(id)
      .then((readAt) => {
        if (typeof readAt === "number") {
          const next = this.data.items.map((it) =>
            it.id === id ? { ...it, readAt, readLabel: t("common.read") } : it
          );
          this.setData({ items: next });
        }
      })
      .finally(doNav);
  },
  loadNotifications() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    listNotifications()
      .then((items) => {
        const me = getUserId() ?? "";
        const viewItems: NotificationViewItem[] = items.map((n) => ({
          ...n,
          typeLabel: this.getTypeLabel(n.type),
          readLabel: n.readAt ? t("common.read") : t("common.unread"),
          postId: n.data?.postId || "",
          fromUserId: n.data?.fromUserId || "",
          requestId: n.data?.requestId || "",
          introId: n.data?.introId || "",
          canQuickIntroduce: n.type === "requestPing" && Boolean(n.data?.requestId) && Boolean(me) && String(n.data?.fromUserId || "") !== me
        }));
        this.setData({ items: viewItems });
      })
      .catch(() => {
        this.setData({ items: [] });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },
  getTypeLabel(type: NotificationItem["type"]) {
    if (type === "comment") return t("messages.comment");
    if (type === "like") return t("messages.like");
    if (type === "follow") return t("messages.follow");
    if (type === "intro") return t("messages.intro");
    if (type === "introResult") return t("messages.introResult");
    if (type === "requestPing") return t("messages.requestPing");
    return t("messages.system");
  },

  onTapOpenRequest(e: WechatMiniprogram.BaseEvent) {
    const requestId = (e.currentTarget as any)?.dataset?.requestId as string | undefined;
    if (!requestId) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    wx.navigateTo({ url: `/pages/request-detail/index?id=${encodeURIComponent(requestId)}` });
  },

  onTapQuickIntroduce(e: WechatMiniprogram.BaseEvent) {
    const requestId = (e.currentTarget as any)?.dataset?.requestId as string | undefined;
    if (!requestId) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    wx.navigateTo({ url: `/pages/request-detail/index?id=${encodeURIComponent(requestId)}&action=introduce` });
  }
});
