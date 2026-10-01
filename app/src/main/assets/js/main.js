import { TikTokApi } from './api.js';
import { Downloader } from './downloader.js';
import { Storage } from './storage.js';
import { UI } from './ui.js';

class App {
  static init() {
    UI.initIcons();
    UI.renderHistory((id) => this.processUrl(`https://www.tiktok.com/@user/video/${id}`));

    const input = document.getElementById('urlInput');
    const btnSubmit = document.getElementById('btnSubmit');
    const btnPaste = document.getElementById('btnPaste');
    const btnToggleHistory = document.getElementById('btnToggleHistory');
    const btnClearHistory = document.getElementById('btnClearHistory');
    const historyPanel = document.getElementById('historyPanel');

    btnPaste.addEventListener('click', async () => {
      let text = '';
      if (Downloader.isNative()) {
        text = window.AndroidBridge.getClipboard();
      } else if (navigator.clipboard && navigator.clipboard.readText) {
        try {
          text = await navigator.clipboard.readText();
        } catch {}
      }
      if (text) {
        input.value = text;
        this.processUrl(text);
      }
    });

    btnSubmit.addEventListener('click', () => {
      this.processUrl(input.value);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.processUrl(input.value);
    });

    btnToggleHistory.addEventListener('click', () => {
      const isHidden = historyPanel.style.display === 'none';
      historyPanel.style.display = isHidden ? 'flex' : 'none';
    });

    btnClearHistory.addEventListener('click', () => {
      Storage.clear();
      UI.renderHistory();
      UI.showToast('Historial limpio');
    });

    document.getElementById('actionBar').addEventListener('click', (e) => {
      const target = e.target.closest('button');
      if (!target || !UI.currentMedia) return;

      const media = UI.currentMedia;
      if (target.id === 'btnDownloadVideo') {
        Downloader.downloadFile(media.videoUrl, `tiktok_${media.id}.mp4`, 'video/mp4');
        UI.showToast('Descargando MP4');
      } else if (target.id === 'btnDownloadImage') {
        const curImg = media.images[UI.currentImageIndex];
        Downloader.downloadFile(curImg, `tiktok_${media.id}_${UI.currentImageIndex + 1}.jpg`, 'image/jpeg');
        UI.showToast('Descargando Imagen');
      } else if (target.id === 'btnDownloadAllImages') {
        Downloader.downloadImages(media.images, `tiktok_${media.id}`);
        UI.showToast(`Descargando ${media.images.length} imágenes`);
      } else if (target.id === 'btnDownloadAudio') {
        Downloader.downloadFile(media.musicUrl, `tiktok_${media.id}.mp3`, 'audio/mpeg');
        UI.showToast('Descargando Audio');
      }
    });
  }

  static async processUrl(rawUrl) {
    if (!rawUrl || !rawUrl.trim()) return;
    
    UI.setLoader(true);
    try {
      const data = await TikTokApi.fetchMedia(rawUrl.trim());
      UI.renderResult(data);
      Storage.saveItem(data);
      UI.renderHistory((id) => this.processUrl(`https://www.tiktok.com/@user/video/${id}`));
    } catch (err) {
      UI.showToast(err.message || 'Error al procesar enlace');
    } finally {
      UI.setLoader(false);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => App.init());
