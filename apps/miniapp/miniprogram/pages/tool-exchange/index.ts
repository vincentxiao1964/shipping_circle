import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = [
  "tool.exchange.title",
  "tool.exchange.amount",
  "tool.exchange.rate",
  "tool.exchange.result",
  "tool.exchange.tip",
  "common.clear"
] as const satisfies readonly MessageKey[];

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    amount: "",
    rate: "",
    result: 0
  },
  onLoad() {
    syncPageI18n(this, I18N_KEYS);
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("tool.exchange.title") });
    this.recalc();
  },
  onInputAmount(e: WechatMiniprogram.Input) {
    this.setData({ amount: e.detail.value });
    this.recalc();
  },
  onInputRate(e: WechatMiniprogram.Input) {
    this.setData({ rate: e.detail.value });
    this.recalc();
  },
  onTapClear() {
    this.setData({ amount: "", rate: "", result: 0 });
  },
  recalc() {
    const amount = parseNum(this.data.amount);
    const rate = parseNum(this.data.rate);
    this.setData({ result: round2(amount * rate) });
  }
});

function parseNum(s: string) {
  const v = Number(String(s || "").trim());
  return Number.isFinite(v) ? v : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
