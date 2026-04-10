import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = [
  "tool.freight.title",
  "tool.freight.cbm",
  "tool.freight.weightKg",
  "tool.freight.wmRate",
  "tool.freight.fixedFee",
  "tool.freight.wm",
  "tool.freight.total",
  "tool.freight.tip",
  "common.ok",
  "common.clear"
] as const satisfies readonly MessageKey[];

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    cbm: "",
    weightKg: "",
    wmRate: "",
    fixedFee: "",
    wm: 0,
    total: 0
  },
  onLoad() {
    syncPageI18n(this, I18N_KEYS);
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("tool.freight.title") });
    this.recalc();
  },
  onInputCbm(e: WechatMiniprogram.Input) {
    this.setData({ cbm: e.detail.value });
    this.recalc();
  },
  onInputWeightKg(e: WechatMiniprogram.Input) {
    this.setData({ weightKg: e.detail.value });
    this.recalc();
  },
  onInputWmRate(e: WechatMiniprogram.Input) {
    this.setData({ wmRate: e.detail.value });
    this.recalc();
  },
  onInputFixedFee(e: WechatMiniprogram.Input) {
    this.setData({ fixedFee: e.detail.value });
    this.recalc();
  },
  onTapClear() {
    this.setData({
      cbm: "",
      weightKg: "",
      wmRate: "",
      fixedFee: "",
      wm: 0,
      total: 0
    });
  },
  recalc() {
    const cbm = parseNum(this.data.cbm);
    const weightKg = parseNum(this.data.weightKg);
    const wmRate = parseNum(this.data.wmRate);
    const fixedFee = parseNum(this.data.fixedFee);

    const ton = weightKg / 1000;
    const wm = round2(Math.max(cbm, ton));
    const total = round2(wm * wmRate + fixedFee);
    this.setData({ wm, total });
  }
});

function parseNum(s: string) {
  const v = Number(String(s || "").trim());
  return Number.isFinite(v) ? v : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
