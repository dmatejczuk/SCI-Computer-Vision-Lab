export function deviceName(ua = navigator.userAgent): string {
  const platform = /iPhone/i.test(ua)
    ? 'iPhone'
    : /iPad/i.test(ua)
      ? 'iPad'
      : /Android/i.test(ua)
        ? 'Telefon Android'
        : /Windows/i.test(ua)
          ? 'Komputer Windows'
          : /Macintosh/i.test(ua)
            ? 'Mac'
            : /Linux/i.test(ua)
              ? 'Komputer Linux'
              : 'Moje urządzenie';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox|FxiOS/.test(ua)
      ? 'Firefox'
      : /Chrome|CriOS/.test(ua)
        ? 'Chrome'
        : /Safari/.test(ua)
          ? 'Safari'
          : '';
  return browser ? `${platform} · ${browser}` : platform;
}
