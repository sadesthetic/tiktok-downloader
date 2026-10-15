export class Updater {
  static get CURRENT_VERSION() {
    return (window.AndroidBridge && window.AndroidBridge.getAppVersion)
      ? window.AndroidBridge.getAppVersion()
      : '1.2.0';
  }

  static get CURRENT_VERSION_CODE() {
    return (window.AndroidBridge && window.AndroidBridge.getAppVersionCode)
      ? window.AndroidBridge.getAppVersionCode()
      : 13;
  }

  static GITHUB_API_URL = 'https://api.github.com/repos/sadesthetic/tiktok-downloader/contents/version.json';
  static RAW_URL = 'https://raw.githubusercontent.com/sadesthetic/tiktok-downloader/main/version.json';

  static async fetchManifest() {
    const ts = Date.now();
    // 1. Intentar primero con la API de GitHub (directo al árbol de Git, 0s cache de CDN)
    try {
      const resApi = await fetch(`${this.GITHUB_API_URL}?ref=main&_t=${ts}`, {
        headers: {
          'Accept': 'application/vnd.github.v3.raw',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        cache: 'no-store'
      });
      if (resApi.ok) {
        const text = await resApi.text();
        return JSON.parse(text);
      }
    } catch {}

    // 2. Fallback a raw con encabezados anti-cache y parámetro único
    const resRaw = await fetch(`${this.RAW_URL}?_nocache=${ts}`, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      },
      cache: 'no-store'
    });
    if (!resRaw.ok) throw new Error(`HTTP ${resRaw.status}`);
    return await resRaw.json();
  }

  static async checkUpdate() {
    try {
      const current = this.CURRENT_VERSION;
      const currentCode = this.CURRENT_VERSION_CODE;
      const data = await this.fetchManifest();

      // Comparación por versionCode numérico (más fiable) y por semver
      let isNewer = false;
      if (typeof data.versionCode === 'number' && currentCode > 0) {
        isNewer = data.versionCode > currentCode;
      }
      if (!isNewer) {
        isNewer = this.compare(data.version, current) > 0;
      }

      const rawUrl = data.downloadUrl || 'https://raw.githubusercontent.com/sadesthetic/tiktok-downloader/main/TikTokDownloader.apk';
      const downloadUrl = rawUrl.includes('?') ? `${rawUrl}&_t=${Date.now()}` : `${rawUrl}?_t=${Date.now()}`;
      
      return {
        hasUpdate: isNewer,
        current,
        latest: data.version,
        latestCode: data.versionCode,
        downloadUrl
      };
    } catch {
      return {
        hasUpdate: false,
        error: true,
        current: this.CURRENT_VERSION,
        latest: this.CURRENT_VERSION
      };
    }
  }

  static compare(v1, v2) {
    const p1 = (v1 || '0').split('.').map(Number);
    const p2 = (v2 || '0').split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const n1 = p1[i] || 0;
      const n2 = p2[i] || 0;
      if (n1 > n2) return 1;
      if (n1 < n2) return -1;
    }
    return 0;
  }
}
