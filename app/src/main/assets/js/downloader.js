export class Downloader {
  static isNative() {
    return typeof window.AndroidBridge !== 'undefined' && typeof window.AndroidBridge.download === 'function';
  }

  static async downloadFile(url, filename, mimeType = 'video/mp4') {
    if (this.isNative()) {
      window.AndroidBridge.download(url, filename, mimeType);
      return;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Network error');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  static async downloadImages(images, prefix = 'tiktok_photo') {
    for (let i = 0; i < images.length; i++) {
      const filename = `${prefix}_${i + 1}.jpg`;
      await this.downloadFile(images[i], filename, 'image/jpeg');
      if (images.length > 1) {
        await new Promise(r => setTimeout(r, 400));
      }
    }
  }
}
