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

  static async saveBlob(blob, filename, mimeType = 'video/mp4') {
    if (this.isNative() && typeof window.AndroidBridge.saveChunkInit === 'function') {
      window.AndroidBridge.saveChunkInit(filename);
      const CHUNK_SIZE = 256 * 1024;
      let offset = 0;
      while (offset < blob.size) {
        const slice = blob.slice(offset, offset + CHUNK_SIZE);
        const buffer = await slice.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        window.AndroidBridge.saveChunkWrite(window.btoa(binary));
        offset += CHUNK_SIZE;
      }
      window.AndroidBridge.saveChunkFinish(filename, mimeType);
      return;
    }

    if (this.isNative() && typeof window.AndroidBridge.saveBase64 === 'function') {
      const reader = new FileReader();
      reader.onloadend = () => {
        window.AndroidBridge.saveBase64(reader.result, filename, mimeType);
      };
      reader.readAsDataURL(blob);
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
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

  static openExternal(url) {
    if (this.isNative() && typeof window.AndroidBridge.openUrl === 'function') {
      window.AndroidBridge.openUrl(url);
    } else {
      window.open(url, '_blank');
    }
  }

  static installUpdate(url) {
    if (this.isNative() && typeof window.AndroidBridge.installUpdate === 'function') {
      window.AndroidBridge.installUpdate(url);
    } else {
      this.openExternal(url);
    }
  }
}
