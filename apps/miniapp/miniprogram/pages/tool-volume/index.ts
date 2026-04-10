import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

const I18N_KEYS = [
  "tool.volume.title",
  "tool.volume.lengthCm",
  "tool.volume.widthCm",
  "tool.volume.heightCm",
  "tool.volume.pieces",
  "tool.volume.cbm",
  "tool.volume.volumetricKg",
  "tool.volume.tip",
  "common.clear"
] as const satisfies readonly MessageKey[];

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    lengthCm: "",
    widthCm: "",
    heightCm: "",
    pieces: "1",
    cbm: 0,
    volumetricKg: 0
  },
  onLoad() {
    syncPageI18n(this, I18N_KEYS);
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("tool.volume.title") });
    this.recalc();
  },
  onInputLength(e: WechatMiniprogram.Input) {
    this.setData({ lengthCm: e.detail.value });
    this.recalc();
  },
  onInputWidth(e: WechatMiniprogram.Input) {
    this.setData({ widthCm: e.detail.value });
    this.recalc();
  },
  onInputHeight(e: WechatMiniprogram.Input) {
    this.setData({ heightCm: e.detail.value });
    this.recalc();
  },
  onInputPieces(e: WechatMiniprogram.Input) {
    this.setData({ pieces: e.detail.value });
    this.recalc();
  },
  onTapClear() {
    this.setData({
      lengthCm: "",
      widthCm: "",
      heightCm: "",
      pieces: "1",
      cbm: 0,
      volumetricKg: 0
    });
  },
  recalc() {
    const l = parseNum(this.data.lengthCm);
    const w = parseNum(this.data.widthCm);
    const h = parseNum(this.data.heightCm);
    const pcs = Math.max(1, Math.floor(parseNum(this.data.pieces)));

    const cbm = round4((l * w * h * pcs) / 1_000_000);
    const volumetricKg = round2((l * w * h * pcs) / 6000);
    this.setData({ cbm, volumetricKg });
  }
});

function parseNum(s: string) {
  const v = Number(String(s || "").trim());
  return Number.isFinite(v) ? v : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
