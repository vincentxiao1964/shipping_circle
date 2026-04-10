import { getToken } from "../../services/api";
import { getUserId } from "../../services/auth";
import { getRequest, updateRequest, resolveIntroduction, submitIntroduction, type RequestDetail } from "../../services/requests";
import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = [
  "request.detail",
  "request.introductions",
  "request.introduce",
  "request.resolveSuccess",
  "request.resolveFail",
  "request.myRequest",
  "request.editTitle",
  "request.edit",
  "request.close",
  "request.reopen",
  "request.closed",
  "request.companyName",
  "request.tags",
  "request.success",
  "request.fail",
  "common.refresh",
  "common.ok",
  "common.cancel",
  "common.failed",
  "common.notFound"
] as const satisfies readonly MessageKey[];

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    id: "",
    meUserId: "",
    item: null as RequestDetail | null,
    loading: false
  },
  onLoad(query: Record<string, string | undefined>) {
    syncPageI18n(this, I18N_KEYS);
    const id = query.id ? String(query.id) : "";
    this.setData({ id });
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("request.detail") });
    this.setData({ meUserId: getUserId() ?? "" });
    this.load();
  },
  onPullDownRefresh() {
    Promise.resolve(this.load()).finally(() => wx.stopPullDownRefresh());
  },
  onTapRefresh() {
    this.load();
  },
  onTapIntroduce() {
    if (!this.data.item) return;
    if (this.data.item.status === "closed") return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    wx.showModal({
      title: t("request.introduce"),
      editable: true,
      placeholderText: t("request.introduce"),
      success: (r) => {
        if (!r.confirm) return;
        const note = String((r as any).content || "").trim();
        if (!note) return;
        submitIntroduction({ requestId: this.data.item!.id, note })
          .then(() => {
            wx.showToast({ title: t("common.ok"), icon: "success" });
            this.load();
          })
          .catch(() => {
            wx.showToast({ title: t("common.failed"), icon: "none" });
          });
      }
    });
  },
  onTapEdit() {
    if (!this.data.item?.isMine) return;
    wx.navigateTo({ url: `/pages/request-edit/index?id=${encodeURIComponent(this.data.item.id)}` });
  },
  onTapToggleStatus() {
    if (!this.data.item?.isMine) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    const nextStatus = this.data.item.status === "closed" ? "open" : "closed";
    const tags = Array.isArray(this.data.item.tags) ? this.data.item.tags : [];
    const companyName = this.data.item.companyName || "";
    this.setData({ loading: true });
    updateRequest({
      id: this.data.item.id,
      title: this.data.item.title,
      companyName,
      content: this.data.item.content,
      tags,
      status: nextStatus
    })
      .then(() => this.load())
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },
  onTapResolve(e: WechatMiniprogram.BaseEvent) {
    const introId = (e.currentTarget as any)?.dataset?.id as string | undefined;
    const outcome = (e.currentTarget as any)?.dataset?.outcome as "success" | "fail" | undefined;
    if (!introId || (outcome !== "success" && outcome !== "fail")) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    resolveIntroduction({ introId, outcome })
      .then(() => {
        wx.showToast({ title: t("common.ok"), icon: "success" });
        this.load();
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      });
  },
  load() {
    if (this.data.loading) return;
    if (!this.data.id) {
      this.setData({ item: null });
      return;
    }
    this.setData({ loading: true });
    return getRequest(this.data.id)
      .then((item) => {
        this.setData({ item });
      })
      .catch(() => {
        this.setData({ item: null });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  }
});
