import { TikTokApi } from './api.js';
import { Downloader } from './downloader.js';
import { FloatingButton } from './floatingButton.js';
import { Settings } from './settings.js';
import { Storage } from './storage.js';
import { UI } from './ui.js';
import { Updater } from './updater.js';
import { VideoGenerator } from './videoGenerator.js';

class App {
  static init() {
    UI.initIcons();
    Settings.init();
    UI.renderHistory((id) => this.processUrl(`https://www.tiktok.com/@user/video/${id}`));

    const input = document.getElementById('urlInput');
    const btnSubmit = document.getElementById('btnSubmit');
    const btnPaste = document.getElementById('btnPaste');
    const btnCheckUpdate = document.getElementById('btnCheckUpdate');
    const btnToggleHistory = document.getElementById('btnToggleHistory');
    const btnClearHistory = document.getElementById('btnClearHistory');
    const historyPanel = document.getElementById('historyPanel');

    FloatingButton.init(
      () => App.quickDownloadCurrent(),
      () => Settings.syncFloatingState()
    );

    let lastUpdateClick = 0;
    btnCheckUpdate.addEventListener('click', async () => {
      const now = Date.now();
      btnCheckUpdate.style.transform = 'rotate(360deg)';
      btnCheckUpdate.style.transition = 'transform 0.6s ease';
      setTimeout(() => {
        btnCheckUpdate.style.transform = '';
        btnCheckUpdate.style.transition = '';
      }, 600);

      const info = await Updater.checkUpdate();
      if (info.hasUpdate) {
        Downloader.installUpdate(info.downloadUrl);
      } else if (info.error) {
        UI.showToast('Sin conexión');
      } else {
        if (now - lastUpdateClick < 2000) {
          Downloader.installUpdate(info.downloadUrl);
        } else {
          UI.showToast(`v${info.current} al día`);
        }
      }
      lastUpdateClick = now;
    });


    btnPaste.addEventListener('click', async () => {
      let text = '';
      if (Downloader.isNative() && window.AndroidBridge && window.AndroidBridge.getClipboard) {
        text = window.AndroidBridge.getClipboard();
      }
      if (!text && navigator.clipboard && navigator.clipboard.readText) {
        try {
          text = await navigator.clipboard.readText();
        } catch {}
      }
      if (text) {
        input.value = text;
        App.processUrl(text);
      } else {
        UI.showToast('Portapapeles vacío');
      }
    });

    btnSubmit.addEventListener('click', () => {
      App.processUrl(input.value);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') App.processUrl(input.value);
    });

    window.handleSharedUrl = (url) => {
      if (!url) return;
      input.value = url;
      App.processUrl(url);
    };

    try {
      if (Downloader.isNative() && window.AndroidBridge && window.AndroidBridge.getSharedUrl) {
        const initialShared = window.AndroidBridge.getSharedUrl();
        if (initialShared) {
          window.handleSharedUrl(initialShared);
        }
      }
    } catch {}

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
      } else if (target.id === 'btnDownloadImageWithMusic') {
        const curImg = media.images[UI.currentImageIndex];
        if (!media.musicUrl) {
          UI.showToast('Sin música disponible');
          return;
        }
        UI.showToast('Generando video con música...');
        target.disabled = true;
        VideoGenerator.generateAndSave(
          curImg,
          media.musicUrl,
          `tiktok_${media.id}_${UI.currentImageIndex + 1}_music.mp4`
        ).then(() => {
          UI.showToast('Video con música descargado');
        }).catch((err) => {
          UI.showToast(err.message || 'Error al generar video');
        }).finally(() => {
          target.disabled = false;
        });
      } else if (target.id === 'btnDownloadAllImages') {
        Downloader.downloadImages(media.images, `tiktok_${media.id}`);
        UI.showToast(`Descargando ${media.images.length} imágenes`);
      } else if (target.id === 'btnDownloadAudio') {
        Downloader.downloadFile(media.musicUrl, `tiktok_${media.id}.mp3`, 'audio/mpeg');
        UI.showToast('Descargando Audio');
      }
    });
  }

  static quickDownloadCurrent() {
    const media = UI.currentMedia;
    if (!media) {
      let text = '';
      if (Downloader.isNative() && window.AndroidBridge && window.AndroidBridge.getClipboard) {
        text = window.AndroidBridge.getClipboard();
      }
      if (text) {
        this.processUrl(text).then(() => {
          if (UI.currentMedia) this.quickDownloadCurrent();
        });
        return;
      }
      UI.showToast('Carga un TikTok primero');
      return;
    }

    if (media.isImages && media.images?.length) {
      const idx = UI.currentImageIndex;
      const curImg = media.images[idx];
      Downloader.downloadFile(curImg, `tiktok_${media.id}_${idx + 1}.jpg`, 'image/jpeg');
      UI.showToast(`Foto ${idx + 1} descargada`);
    } else if (media.videoUrl) {
      Downloader.downloadFile(media.videoUrl, `tiktok_${media.id}.mp4`, 'video/mp4');
      UI.showToast('MP4 descargado');
    }
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
