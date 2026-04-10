import { syncPageI18n, t, type MessageKey } from "../../utils/i18n";

type PortItem = {
  name: string;
  country: string;
  code?: string;
};

const I18N_KEYS = ["tool.ports.title", "tool.ports.search", "tool.ports.empty", "common.refresh"] as const satisfies readonly MessageKey[];

const PORTS: PortItem[] = [
  { name: "Shanghai", country: "CN", code: "CNSHA" },
  { name: "Ningbo", country: "CN", code: "CNNGB" },
  { name: "Shenzhen (Yantian)", country: "CN", code: "CNYTN" },
  { name: "Qingdao", country: "CN", code: "CNTAO" },
  { name: "Tianjin", country: "CN", code: "CNTXG" },
  { name: "Hong Kong", country: "HK", code: "HKHKG" },
  { name: "Singapore", country: "SG", code: "SGSIN" },
  { name: "Rotterdam", country: "NL", code: "NLRTM" },
  { name: "Hamburg", country: "DE", code: "DEHAM" },
  { name: "Felixstowe", country: "GB", code: "GBFXT" },
  { name: "Los Angeles", country: "US", code: "USLAX" },
  { name: "New York", country: "US", code: "USNYC" }
];

Page({
  data: {
    locale: "",
    localeVersion: 0,
    i18n: {},
    q: "",
    items: [] as PortItem[]
  },
  onLoad() {
    syncPageI18n(this, I18N_KEYS);
  },
  onShow() {
    syncPageI18n(this, I18N_KEYS);
    wx.setNavigationBarTitle({ title: t("tool.ports.title") });
    this.apply();
  },
  onInput(e: WechatMiniprogram.Input) {
    this.setData({ q: e.detail.value });
    this.apply();
  },
  onTapRefresh() {
    this.apply();
  },
  apply() {
    const q = String(this.data.q || "").trim().toLowerCase();
    if (!q) {
      this.setData({ items: PORTS });
      return;
    }
    const items = PORTS.filter((p) => `${p.name} ${p.country} ${p.code || ""}`.toLowerCase().includes(q));
    this.setData({ items });
  }
});

