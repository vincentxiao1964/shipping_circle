import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";
import { loginWithWeChatCode } from "../../services/auth";
import { syncFollowingFromRemote } from "../../services/follows";

const I18N_KEYS = ["login.title", "login.wechat", "login.tip", "common.ok", "auth.noCode", "auth.loginFailed"] as const satisfies readonly MessageKey[];

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    statusText: ""
  },
  onLoad() {
    syncPageI18n(this, I18N_KEYS);
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("login.title") });
  },
  onTapWeChatLogin() {
    wx.login({
      success: (res) => {
        const code = res.code || "";
        if (!code) {
          wx.showToast({ title: t("auth.noCode"), icon: "none" });
          return;
        }
        loginWithWeChatCode(code)
          .then((loginRes) => {
            this.setData({ statusText: `token: ${loginRes.token.slice(0, 8)}…` });
            Promise.resolve(syncFollowingFromRemote()).finally(() => {
              wx.showToast({ title: t("common.ok"), icon: "success" });
              wx.switchTab({ url: "/pages/profile/index" });
            });
          })
          .catch(() => {
            this.setData({ statusText: `code: ${code}` });
            wx.showToast({ title: t("auth.loginFailed"), icon: "none" });
          });
      },
      fail: () => {
        wx.showToast({ title: t("auth.loginFailed"), icon: "none" });
      }
    });
  }
});
