import { getToken } from "../../services/api";
import { getUserId } from "../../services/auth";
import { confirmContact, invalidateContact, matchContacts, updateContact, type ContactMatchGroup } from "../../services/contacts";
import { getIsFollowing, toggleFollow } from "../../services/follows";
import { getRecommendedIntroducers, getRequest, pingIntroducer, updateRequest, resolveIntroduction, submitIntroduction, type RequestDetail } from "../../services/requests";
import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = [
  "request.detail",
  "request.introductions",
  "request.introduce",
  "intro.requestHintTitle",
  "intro.requestHintContent",
  "intro.contactName",
  "intro.contactTitle",
  "intro.contactChannel",
  "intro.clue",
  "intro.submit",
  "intro.required",
  "contact.sectionTitle",
  "contact.empty",
  "contact.copy",
  "contact.copied",
  "contact.stale",
  "contact.candidate",
  "contact.confirm",
  "contact.update",
  "contact.markInvalid",
  "contact.confirmed",
  "contact.updated",
  "contact.invalidMarked",
  "contact.updateTitle",
  "contact.updatePlaceholder",
  "contact.invalidReasonTitle",
  "contact.invalidReasonUnreachable",
  "contact.invalidReasonMismatch",
  "contact.invalidReasonLeft",
  "contact.invalidReasonRefused",
  "contact.invalidReasonOther",
  "request.resolveSuccess",
  "request.resolveFail",
  "intro.failReasonTitle",
  "intro.failReasonUnreachable",
  "intro.failReasonMismatch",
  "intro.failReasonLeft",
  "intro.failReasonRefused",
  "intro.failReasonOther",
  "request.myRequest",
  "request.editTitle",
  "request.edit",
  "request.close",
  "request.reopen",
  "request.closed",
  "request.companyName",
  "request.tags",
  "request.recommendIntro",
  "request.viewProfile",
  "request.ping",
  "request.pingSent",
  "user.follow",
  "user.unfollow",
  "request.ownerContactChannel",
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
    recommend: [] as { id: string; displayName: string; score: number; successCount: number; isFollowing: boolean }[],
    contactGroups: [] as ContactMatchGroup[],
    contactLoading: false,
    loading: false,
    pendingAction: "" as "" | "introduce"
  },
  onLoad(query: Record<string, string | undefined>) {
    syncPageI18n(this, I18N_KEYS);
    const id = query.id ? String(query.id) : "";
    const action = query.action === "introduce" ? "introduce" : "";
    this.setData({ id, pendingAction: action });
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
  onTapCopyContact(e: WechatMiniprogram.BaseEvent) {
    const channel = (e.currentTarget as any)?.dataset?.channel as string | undefined;
    if (!channel) return;
    wx.setClipboardData({
      data: channel,
      success: () => {
        wx.showToast({ title: t("contact.copied"), icon: "success" });
      }
    });
  },
  onTapIntroduce() {
    if (!this.data.item) return;
    if (this.data.item.status === "closed") return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    const company = String(this.data.item.companyName || "").trim();
    const tagsText = Array.isArray(this.data.item.tags) ? this.data.item.tags.map((x) => String(x || "").trim()).filter(Boolean).join(", ") : "";
    let contactName = "";
    let contactTitle = "";
    let contactChannel = "";
    let clue = "";

    const ask = (title: string, placeholderText: string, valueSetter: (v: string) => void) =>
      new Promise<void>((resolve) => {
        wx.showModal({
          title,
          editable: true,
          placeholderText,
          success: (r) => {
            if (!r.confirm) return resolve();
            const v = String((r as any).content || "").trim();
            valueSetter(v);
            resolve();
          },
          fail: () => resolve()
        });
      });

    Promise.resolve()
      .then(
        () =>
          new Promise<void>((resolve) => {
            if (!company && !tagsText) return resolve();
            wx.showModal({
              title: t("intro.requestHintTitle"),
              content: t("intro.requestHintContent", { company: company || "-", tags: tagsText || "-" }),
              showCancel: false,
              success: () => resolve(),
              fail: () => resolve()
            });
          })
      )
      .then(() => ask(t("intro.contactName"), t("intro.contactName"), (v) => (contactName = v)))
      .then(() => ask(t("intro.contactTitle"), t("intro.contactTitle"), (v) => (contactTitle = v)))
      .then(() => ask(t("intro.contactChannel"), t("intro.contactChannel"), (v) => (contactChannel = v)))
      .then(() => ask(t("intro.clue"), t("intro.clue"), (v) => (clue = v)))
      .then(() => {
        if (!contactChannel) {
          wx.showToast({ title: t("intro.required"), icon: "none" });
          return;
        }
        return submitIntroduction({
          requestId: this.data.item!.id,
          contactName,
          contactTitle,
          contactChannel,
          clue
        })
          .then(() => {
            wx.showToast({ title: t("common.ok"), icon: "success" });
            this.load();
          })
          .catch(() => {
            wx.showToast({ title: t("common.failed"), icon: "none" });
          });
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
    const companyId = this.data.item.companyId || "";
    const companyName = this.data.item.companyName || "";
    const ownerContactChannel = this.data.item.ownerContactChannel || "";
    this.setData({ loading: true });
    updateRequest({
      id: this.data.item.id,
      title: this.data.item.title,
      companyId,
      companyName,
      ownerContactChannel,
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
  onTapContactConfirm(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    confirmContact(id)
      .then((ok) => {
        if (!ok) throw new Error("failed");
        wx.showToast({ title: t("contact.confirmed"), icon: "success" });
        this.load();
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      });
  },
  onTapContactUpdate(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    const channel = (e.currentTarget as any)?.dataset?.channel as string | undefined;
    if (!id) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    wx.showModal({
      title: t("contact.updateTitle"),
      editable: true,
      placeholderText: channel || t("contact.updatePlaceholder"),
      success: (r) => {
        if (!r.confirm) return;
        const v = String((r as any).content || "").trim();
        if (!v) return;
        updateContact({ id, contactChannel: v })
          .then((res) => {
            if (res !== "ok") throw new Error("failed");
            wx.showToast({ title: t("contact.updated"), icon: "success" });
            this.load();
          })
          .catch(() => {
            wx.showToast({ title: t("common.failed"), icon: "none" });
          });
      }
    });
  },
  onTapContactInvalid(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    const reasons = [
      { label: t("contact.invalidReasonUnreachable"), code: "unreachable" },
      { label: t("contact.invalidReasonMismatch"), code: "mismatch" },
      { label: t("contact.invalidReasonLeft"), code: "left" },
      { label: t("contact.invalidReasonRefused"), code: "refused" },
      { label: t("contact.invalidReasonOther"), code: "other" }
    ];
    wx.showActionSheet({
      itemList: reasons.map((x) => x.label),
      success: (r) => {
        const reason = reasons[r.tapIndex]?.code || "";
        invalidateContact(id, reason)
          .then((res) => {
            if (res !== "ok") throw new Error("failed");
            wx.showToast({ title: t("contact.invalidMarked"), icon: "success" });
            this.load();
          })
          .catch(() => {
            wx.showToast({ title: t("common.failed"), icon: "none" });
          });
      }
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
    if (outcome === "success") {
      resolveIntroduction({ introId, outcome })
        .then(() => {
          wx.showToast({ title: t("common.ok"), icon: "success" });
          this.load();
        })
        .catch(() => {
          wx.showToast({ title: t("common.failed"), icon: "none" });
        });
      return;
    }

    const reasons = [
      { label: t("intro.failReasonUnreachable"), code: "unreachable" },
      { label: t("intro.failReasonMismatch"), code: "mismatch" },
      { label: t("intro.failReasonLeft"), code: "left" },
      { label: t("intro.failReasonRefused"), code: "refused" },
      { label: t("intro.failReasonOther"), code: "other" }
    ];
    wx.showActionSheet({
      itemList: reasons.map((x) => x.label),
      success: (res) => {
        const chosen = reasons[res.tapIndex];
        const reason = chosen?.code || "";
        resolveIntroduction({ introId, outcome, reason })
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
        return this.loadContacts(item);
      })
      .then(() => {
        if (!getToken()) {
          this.setData({ recommend: [] });
          return;
        }
        if (!this.data.item?.isMine) {
          this.setData({ recommend: [] });
          return;
        }
        return getRecommendedIntroducers(this.data.id, 5)
          .then((rec) => {
            const next = rec.map((u) => ({ ...u, isFollowing: getIsFollowing(u.id) }));
            this.setData({ recommend: next });
          })
          .catch(() => {
            this.setData({ recommend: [] });
          });
      })
      .then(() => {
        if (this.data.pendingAction === "introduce") {
          this.setData({ pendingAction: "" });
          this.onTapIntroduce();
        }
      })
      .catch(() => {
        this.setData({ item: null });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },
  onTapViewUser(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    wx.navigateTo({ url: `/pages/user/index?id=${encodeURIComponent(id)}` });
  },
  onTapToggleFollowUser(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    toggleFollow(id)
      .then((following) => {
        const next = (this.data.recommend || []).map((u) => (u.id === id ? { ...u, isFollowing: following } : u));
        this.setData({ recommend: next });
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      });
  },
  onTapPingUser(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    if (!this.data.item?.isMine) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    pingIntroducer(this.data.id, id)
      .then((res) => {
        if (!res) throw new Error("failed");
        wx.showToast({ title: t("request.pingSent"), icon: "success" });
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      });
  },
  loadContacts(item: RequestDetail | null) {
    if (!item?.companyId && !item?.companyName) {
      this.setData({ contactGroups: [] });
      return Promise.resolve();
    }
    if (!getToken()) {
      this.setData({ contactGroups: [] });
      return Promise.resolve();
    }
    if (this.data.contactLoading) return Promise.resolve();
    this.setData({ contactLoading: true });
    const businesses = Array.isArray(item.tags) ? item.tags.map((x) => String(x || "").trim()).filter(Boolean) : [];
    return matchContacts({ companyId: item.companyId || "", companyName: item.companyName || "", businesses, limit: 5 })
      .then((groups) => {
        this.setData({ contactGroups: groups });
      })
      .finally(() => {
        this.setData({ contactLoading: false });
      });
  }
});
