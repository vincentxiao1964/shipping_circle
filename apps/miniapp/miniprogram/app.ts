import { detectLocale, type Locale } from "./utils/i18n";

App<{
  globalData: {
    locale: Locale;
    localeVersion: number;
  };
}>({
  globalData: {
    locale: detectLocale(),
    localeVersion: 1
  },
  onLaunch() {
    const locale = detectLocale();
    if (locale !== this.globalData.locale) {
      this.globalData.locale = locale;
      this.globalData.localeVersion += 1;
    }
  }
});
