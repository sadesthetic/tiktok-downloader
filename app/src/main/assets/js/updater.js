export class Updater {
  static CURRENT_VERSION = '1.0.3';
  static REMOTE_MANIFEST_URL = 'https://raw.githubusercontent.com/sadesthetic/tiktok-downloader/main/version.json';

  static async checkUpdate() {
    try {
      const url = `${this.REMOTE_MANIFEST_URL}?t=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      const isNewer = this.compare(data.version, this.CURRENT_VERSION) > 0;
      return {
        hasUpdate: isNewer,
        current: this.CURRENT_VERSION,
        latest: data.version,
        downloadUrl: data.downloadUrl || 'https://raw.githubusercontent.com/sadesthetic/tiktok-downloader/main/TikTokDownloader.apk'
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
