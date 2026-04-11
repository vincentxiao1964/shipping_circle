import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";
import { getToken } from "../../services/api";
import { getRequest, submitClaimQuoteStructured } from "../../services/requests";

const I18N_KEYS = [
  "quote.title",
  "quote.currency",
  "quote.amount",
  "quote.allIn",
  "quote.validDays",
  "quote.note",
  "quote.noteHint",
  "quote.submit",
  "request.priceHint",
  "request.quoteRange",
  "common.ok",
  "common.failed"
] as const satisfies readonly MessageKey[];

const DEFAULT_CURRENCIES = [
  { code: "USD", label: "USD" },
  { code: "CNY", label: "CNY" },
  { code: "EUR", label: "EUR" }
];

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    loading: false,
    requestId: "",
    claimId: "",
    requestTitle: "",
    priceHintText: "",
    quoteRangeText: "",
    currencyOptions: DEFAULT_CURRENCIES,
    currencyIndex: 0,
    amount: "",
    allIn: true,
    validDays: "7",
    note: ""
  },
  onLoad(query: Record<string, string | undefined>) {
    syncPageI18n(this, I18N_KEYS);
    const requestId = String(query.requestId || "").trim();
    const claimId = String(query.claimId || "").trim();
    const requestTitle = query.requestTitle ? decodeURIComponent(String(query.requestTitle)) : "";
    this.setData({ requestId, claimId, requestTitle });
    if (requestId) {
      getRequest(requestId)
        .then((r) => {
          if (!r) return;
          const title = String(r.title || "");
          const nextTitle = this.data.requestTitle ? this.data.requestTitle : title;
          const priceHintText = this.formatMoneyRange(r.priceHint);
          const quoteRangeText = this.formatMoneyRange(r.quoteRange);
          const desiredCurrency = String((r.priceHint as any)?.currency || "").trim();
          const idx = desiredCurrency ? this.data.currencyOptions.findIndex((x) => x.code === desiredCurrency) : -1;
          const currencyIndex = idx >= 0 ? idx : this.data.currencyIndex;
          let amount = this.data.amount;
          if (!String(amount || "").trim() && r.priceHint && Number(r.priceHint.min) > 0 && Number(r.priceHint.max) > 0) {
            const mid = Math.round(((Number(r.priceHint.min) + Number(r.priceHint.max)) / 2) * 100) / 100;
            amount = String(mid);
          }
          this.setData({ requestTitle: nextTitle, priceHintText, quoteRangeText, currencyIndex, amount });
        })
        .catch(() => {});
    }
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("quote.title") });
  },
  onPickCurrency(e: WechatMiniprogram.PickerChange) {
    const idx = Number(e.detail.value || 0);
    const n = Number.isFinite(idx) ? Math.min(Math.max(0, idx), this.data.currencyOptions.length - 1) : 0;
    this.setData({ currencyIndex: n });
  },
  onInputAmount(e: WechatMiniprogram.Input) {
    this.setData({ amount: e.detail.value });
  },
  onToggleAllIn(e: WechatMiniprogram.SwitchChange) {
    this.setData({ allIn: Boolean(e.detail.value) });
  },
  onInputValidDays(e: WechatMiniprogram.Input) {
    this.setData({ validDays: e.detail.value });
  },
  onInputNote(e: WechatMiniprogram.Input) {
    this.setData({ note: e.detail.value });
  },
  onTapSubmit() {
    if (this.data.loading) return;
    if (!getToken()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    const requestId = String(this.data.requestId || "").trim();
    const claimId = String(this.data.claimId || "").trim();
    if (!requestId || !claimId) return;

    const currency = String(this.data.currencyOptions[this.data.currencyIndex]?.code || "").trim();
    const amount = Number(String(this.data.amount || "").trim());
    const allIn = Boolean(this.data.allIn);
    const validDays = Number(String(this.data.validDays || "").trim());
    const note = String(this.data.note || "").trim();
    if (!currency || !Number.isFinite(amount) || amount <= 0) {
      wx.showToast({ title: t("common.failed"), icon: "none" });
      return;
    }

    this.setData({ loading: true });
    submitClaimQuoteStructured(requestId, claimId, { currency, amount, allIn, validDays, note })
      .then((ok) => {
        if (!ok) throw new Error("failed");
        wx.showToast({ title: t("common.ok"), icon: "success" });
        wx.navigateBack();
      })
      .catch(() => {
        wx.showToast({ title: t("common.failed"), icon: "none" });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },
  formatMoneyRange(range: any) {
    if (!range) return "";
    const currency = String(range.currency || "").trim();
    const min = Number(range.min || 0);
    const max = Number(range.max || 0);
    const count = Number(range.count || 0);
    if (!currency || !Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) return "";
    const text = min === max ? `${currency} ${min}` : `${currency} ${min}-${max}`;
    return count > 0 ? `${text} (n=${count})` : text;
  }
});
