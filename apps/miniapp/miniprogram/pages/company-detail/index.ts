import { addCompanyAlias, getCompany } from "../../services/companies";
import { confirmContact, invalidateContact, matchContacts, updateContact, type ContactMatchGroup } from "../../services/contacts";
import { listRequestsPage, type RequestListItem } from "../../services/requests";
import { getToken } from "../../services/api";
import { toggleCompanyFollow } from "../../services/companies";
import { parseContactChannel } from "../../utils/contact-channel";
import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = [
  "company.detailTitle",
  "company.tags",
  "company.roles",
  "company.createRequest",
  "company.relatedRequests",
  "company.follow",
  "company.unfollow",
  "company.followersCount",
  "company.addAlias",
  "company.addAliasPlaceholder",
  "company.aliasAdded",
  "company.aliasConflict",
  "contact.sectionTitle",
  "contact.empty",
  "contact.copy",
  "contact.copied",
  "contact.stale",
  "contact.candidate",
  "contact.manage",
  "contact.confirm",
  "contact.update",
  "contact.markInvalid",
  "contact.confirmed",
  "contact.updated",
  "contact.invalidMarked",
  "contact.updateTitle",
  "contact.updatePlaceholder",
  "contact.channelAuto",
  "contact.channelInvalid",
  "contact.invalidReasonTitle",
  "contact.invalidReasonUnreachable",
  "contact.invalidReasonMismatch",
  "contact.invalidReasonLeft",
  "contact.invalidReasonRefused",
  "contact.invalidReasonOther",
  "common.refresh",
  "common.failed",
  "common.notFound"
] as const satisfies readonly MessageKey[];

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    id: "",
    item: null as any,
    related: [] as RequestListItem[],
    contactGroups: [] as ContactMatchGroup[],
    contactLoading: false,
    loading: false
  },
  onLoad(query: Record<string, string | undefined>) {
    syncPageI18n(this, I18N_KEYS);
    const id = query.id ? String(query.id) : "";
    this.setData({ id });
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("company.detailTitle") });
    this.load();
  },
  onPullDownRefresh() {
    Promise.resolve(this.load()).finally(() => wx.stopPullDownRefresh());
  },
  onTapRefresh() {
    this.load();
  },
  onTapRequest(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as any)?.dataset?.id as string | undefined;
    if (!id) return;
    wx.navigateTo({ url: `/pages/request-detail/index?id=${encodeURIComponent(id)}` });
  },
  onTapCreateRequest(e: WechatMiniprogram.BaseEvent) {
    const business = (e.currentTarget as any)?.dataset?.business as string | undefined;
    if (!this.data.item) return;
    wx.navigateTo({
      url: `/pages/request-create/index?companyId=${encodeURIComponent(this.data.item.id)}&companyName=${encodeURIComponent(this.data.item.name)}&business=${encodeURIComponent(business || "")}`
    });
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
        if (this.data.item) this.loadContacts(this.data.item);
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
        const parsed = parseContactChannel(v);
        const finalChannel = parsed ? parsed.display : v;
        if (parsed) {
          if (parsed.kind !== "other") wx.showToast({ title: t("contact.channelAuto", { value: parsed.display }), icon: "none" });
          else wx.showToast({ title: t("contact.channelInvalid"), icon: "none" });
        }
        updateContact({ id, contactChannel: finalChannel })
          .then((res) => {
            if (res !== "ok") throw new Error("failed");
            wx.showToast({ title: t("contact.updated"), icon: "success" });
            if (this.data.item) this.loadContacts(this.data.item);
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
            if (this.data.item) this.loadContacts(this.data.item);
          })
          .catch(() => {
            wx.showToast({ title: t("common.failed"), icon: "none" });
          });
      }
    });
  },
  onTapManageContacts() {
    if (!this.data.item?.id) return;
    wx.navigateTo({
      url: `/pages/contact-manage/index?companyId=${encodeURIComponent(this.data.item.id)}&companyName=${encodeURIComponent(this.data.item.name)}`
    });
  },
  onTapToggleFollow() {
    if (!this.data.item?.id) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    this.setData({ loading: true });
    toggleCompanyFollow(this.data.item.id)
      .then((r) => {
        if (!r) return;
        this.setData({
          item: {
            ...this.data.item,
            followedByMe: r.following,
            followerCount: r.followerCount,
            followersText: t("company.followersCount", { count: r.followerCount })
          }
        });
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },
  onTapAddAlias() {
    if (!this.data.item?.id) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    wx.showModal({
      title: t("company.addAlias"),
      editable: true,
      placeholderText: t("company.addAliasPlaceholder"),
      success: (r) => {
        if (!r.confirm) return;
        const alias = String((r as any).content || "").trim();
        if (!alias) return;
        addCompanyAlias(this.data.item.id, alias)
          .then((res) => {
            if (!res) {
              wx.showToast({ title: t("common.failed"), icon: "none" });
              return;
            }
            if (res.conflict) {
              wx.showToast({ title: t("company.aliasConflict"), icon: "none" });
              return;
            }
            wx.showToast({ title: t("company.aliasAdded"), icon: "success" });
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
    if (!this.data.id) return;
    this.setData({ loading: true });
    return getCompany(this.data.id)
      .then((item) => {
        const followerCount = typeof item?.followerCount === "number" ? item.followerCount : 0;
        this.setData({ item: item ? { ...item, followersText: t("company.followersCount", { count: followerCount }) } : item });
        if (item?.name) {
          return Promise.all([
            listRequestsPage({ limit: 10, company: item.name }).then((page) => {
              this.setData({ related: page.items });
            }),
            this.loadContacts(item)
          ]).then(() => {});
        }
      })
      .catch(() => {
        this.setData({ item: null });
        wx.showToast({ title: t("common.failed"), icon: "none" });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },
  loadContacts(item: any) {
    if (!item?.name) {
      this.setData({ contactGroups: [] });
      return Promise.resolve();
    }
    if (!getToken()) {
      this.setData({ contactGroups: [] });
      return Promise.resolve();
    }
    if (this.data.contactLoading) return Promise.resolve();
    this.setData({ contactLoading: true });
    const businesses = Array.isArray(item.roles) ? item.roles.map((r: any) => String(r?.business || "").trim()).filter(Boolean) : [];
    return matchContacts({ companyId: item.id, companyName: item.name, businesses, limit: 5 })
      .then((groups) => {
        this.setData({ contactGroups: groups });
      })
      .finally(() => {
        this.setData({ contactLoading: false });
      });
  }
});
