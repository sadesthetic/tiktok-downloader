import { TikTokApi } from './api.js';
import { Downloader } from './downloader.js';
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
    const btnClearHistory = document.getElementById('btnClearHistory');
    const historyPanel = document.getElementById('historyPanel');

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
        const wrapper = document.getElementById('updateWrapper');
        const bar = document.getElementById('updateRingBar');
        if (wrapper) wrapper.classList.add('downloading');
        if (bar) bar.style.strokeDashoffset = '106.81';
        Downloader.installUpdate(info.downloadUrl);
      } else if (info.error) {
        UI.showToast('Sin conexión');
      } else {
        if (now - lastUpdateClick < 2000) {
          const wrapper = document.getElementById('updateWrapper');
          const bar = document.getElementById('updateRingBar');
          if (wrapper) wrapper.classList.add('downloading');
          if (bar) bar.style.strokeDashoffset = '106.81';
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

    btnClearHistory.addEventListener('click', () => {
      Storage.clear();
      UI.renderHistory();
      UI.showToast('Historial limpio');
    });

    document.getElementById('actionBar').addEventListener('click', (e) => {
      const target = e.target.closest('button');
      if (!target || !UI.currentMedia) return;

      const media = UI.currentMedia;
      const prefix = media.id || 'media';
      if (target.id === 'btnDownloadVideo') {
        if (media.isYtDlp && window.AndroidBridge && typeof window.AndroidBridge.ytDlpDownload === 'function') {
          window.AndroidBridge.ytDlpDownload(media.rawUrl || media.id, 'mp4');
          UI.showToast('Descargando MP4 con yt-dlp...');
        } else {
          Downloader.downloadFile(media.videoUrl, `${prefix}.mp4`, 'video/mp4');
          UI.showToast('Descargando MP4');
        }
      } else if (target.id === 'btnDownloadImage') {
        const curImg = media.images[UI.currentImageIndex];
        Downloader.downloadFile(curImg, `${prefix}_${UI.currentImageIndex + 1}.jpg`, 'image/jpeg');
        UI.showToast('Descargando Imagen');
      } else if (target.id === 'btnDownloadImageWithMusic') {
        const curImg = media.images[UI.currentImageIndex];
        if (!media.musicUrl) {
          UI.showToast('Sin música disponible');
          return;
        }
        UI.showToast('Generando video...');
        target.disabled = true;
        VideoGenerator.generateAndSave(
          curImg,
          media.musicUrl,
          `${prefix}_${UI.currentImageIndex + 1}_audio.mp4`
        ).then(() => {
          UI.showToast('Video descargado');
        }).catch((err) => {
          UI.showToast(err.message || 'Error al generar video');
        }).finally(() => {
          target.disabled = false;
        });
      } else if (target.id === 'btnDownloadAllImages') {
        Downloader.downloadImages(media.images, prefix);
        UI.showToast(`Descargando ${media.images.length} imágenes`);
      } else if (target.id === 'btnDownloadAudio') {
        if (media.isYtDlp && window.AndroidBridge && typeof window.AndroidBridge.ytDlpDownload === 'function') {
          window.AndroidBridge.ytDlpDownload(media.rawUrl || media.id, 'mp3');
          UI.showToast('Descargando MP3 con yt-dlp...');
        } else {
          Downloader.downloadFile(media.musicUrl, `${prefix}_audio.mp3`, 'audio/mpeg');
          UI.showToast('Descargando Audio');
        }
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

window.onUpdateProgress = (progress) => {
  const wrapper = document.getElementById('updateWrapper');
  const bar = document.getElementById('updateRingBar');
  if (wrapper) wrapper.classList.add('downloading');
  if (bar) {
    const circum = 106.81;
    bar.style.strokeDashoffset = circum * (1 - Math.max(0, Math.min(1, progress)));
  }
};

window.onUpdateComplete = () => {
  const wrapper = document.getElementById('updateWrapper');
  const bar = document.getElementById('updateRingBar');
  if (bar) bar.style.strokeDashoffset = '0';
  setTimeout(() => {
    if (wrapper) wrapper.classList.remove('downloading');
    if (bar) bar.style.strokeDashoffset = '106.81';
  }, 1200);
};

window.onUpdateError = (err) => {
  const wrapper = document.getElementById('updateWrapper');
  const bar = document.getElementById('updateRingBar');
  if (wrapper) wrapper.classList.remove('downloading');
  if (bar) bar.style.strokeDashoffset = '106.81';
  UI.showToast(err || 'Error al actualizar');
};

window.onYtDlpProgress = (progress) => {
  UI.showToast(`Descargando: ${Math.round(progress * 100)}%`);
};
window.onYtDlpComplete = (filename) => {
  UI.showToast(`Guardado: ${filename}`);
};
window.onYtDlpError = (err) => {
  UI.showToast(err || 'Error en descarga');
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
