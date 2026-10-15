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

    let isUpdating = false;
    let lastReportedProgress = 0;

    const updateModal = document.getElementById('updateModal');
    const btnHideUpdateModal = document.getElementById('btnHideUpdateModal');
    if (btnHideUpdateModal && updateModal) {
      btnHideUpdateModal.addEventListener('click', () => {
        updateModal.style.display = 'none';
      });
      updateModal.addEventListener('click', (e) => {
        if (e.target === updateModal) updateModal.style.display = 'none';
      });
    }

    btnCheckUpdate.addEventListener('click', async () => {
      if (isUpdating) {
        if (updateModal) updateModal.style.display = 'flex';
        UI.showToast('Descarga en curso...');
        return;
      }

      btnCheckUpdate.style.transform = 'rotate(360deg)';
      btnCheckUpdate.style.transition = 'transform 0.6s ease';
      setTimeout(() => {
        btnCheckUpdate.style.transform = '';
        btnCheckUpdate.style.transition = '';
      }, 600);

      const info = await Updater.checkUpdate();
      if (info.hasUpdate) {
        isUpdating = true;
        lastReportedProgress = 0;

        const badge = document.getElementById('updateVersionBadge');
        const bar = document.getElementById('updateProgressBar');
        const pText = document.getElementById('updatePercentText');
        const sText = document.getElementById('updateStatusText');
        const bText = document.getElementById('updateBytesText');
        const ringBar = document.getElementById('updateRingBar');
        const wrapper = document.getElementById('updateWrapper');

        if (badge) badge.textContent = `v${info.current} → v${info.latest}`;
        if (bar) bar.style.width = '0%';
        if (pText) pText.textContent = '0%';
        if (sText) {
          sText.textContent = 'Descargando actualización...';
          sText.style.color = 'var(--text-main)';
        }
        if (bText) bText.textContent = 'Conectando con GitHub...';
        if (wrapper) wrapper.classList.add('downloading');
        if (ringBar) ringBar.style.strokeDashoffset = '106.81';
        if (updateModal) updateModal.style.display = 'flex';

        Downloader.installUpdate(info.downloadUrl);
      } else if (info.error) {
        UI.showToast('Sin conexión a GitHub');
      } else {
        UI.showToast(`v${info.current} al día`);
      }
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
      } else if (target.id === 'btnDownloadShortVideo') {
        Downloader.downloadFile(media.videoUrl, `${prefix}_4s.mp4`, 'video/mp4');
        UI.showToast('Descargando video 4s...');
      } else if (target.id === 'btnDownloadImage') {
        const curImg = (media.images && media.images[UI.currentImageIndex]) || media.cover;
        const imgIndex = (UI.currentImageIndex || 0) + 1;
        Downloader.downloadFile(curImg, `${prefix}_foto_${imgIndex}.jpg`, 'image/jpeg');
        UI.showToast('Descargando Foto');
      } else if (target.id === 'btnDownloadImageWithMusic') {
        const curImg = (media.images && media.images[UI.currentImageIndex]) || media.cover;
        if (!curImg) {
          UI.showToast('No se encontró imagen');
          return;
        }
        if (!media.musicUrl) {
          UI.showToast('Sin música disponible');
          return;
        }
        UI.showToast('Iniciando video con audio completo...');
        target.disabled = true;
        const outName = `${prefix}_audio_completo.mp4`;
        VideoGenerator.generateAndSave(
          curImg,
          media.musicUrl,
          outName,
          (progress, text) => {
            const p = Math.round((Number(progress) || 0) * 100);
            if (p % 15 === 0 || p >= 95) {
              UI.showToast(text || `Generando video: ${p}%`);
            }
          }
        ).then((finalName) => {
          UI.showToast(`Video completo descargado: ${finalName || outName}`);
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

let globalMaxUpdateProgress = 0;

window.onUpdateProgress = (progress, percent, dlMb, totalMb) => {
  const pVal = Number(progress) || 0;
  globalMaxUpdateProgress = Math.max(globalMaxUpdateProgress, Math.min(1, pVal));
  const pInt = percent != null ? Math.max(0, Math.min(100, Math.round(percent))) : Math.round(globalMaxUpdateProgress * 100);

  const modal = document.getElementById('updateModal');
  const bar = document.getElementById('updateProgressBar');
  const pText = document.getElementById('updatePercentText');
  const sText = document.getElementById('updateStatusText');
  const bText = document.getElementById('updateBytesText');
  const ringBar = document.getElementById('updateRingBar');
  const wrapper = document.getElementById('updateWrapper');

  if (wrapper) wrapper.classList.add('downloading');
  if (ringBar) {
    const circum = 106.81;
    ringBar.style.strokeDashoffset = circum * (1 - globalMaxUpdateProgress);
  }

  if (bar) bar.style.width = `${pInt}%`;
  if (pText) pText.textContent = `${pInt}%`;
  if (sText) {
    if (pInt >= 100) {
      sText.textContent = 'Verificando APK e iniciando instalador...';
      sText.style.color = '#25f4ee';
    } else {
      sText.textContent = 'Descargando actualización...';
      sText.style.color = 'var(--text-main)';
    }
  }
  if (bText) {
    if (dlMb != null && totalMb != null && totalMb > 0) {
      bText.textContent = `${Number(dlMb).toFixed(1)} MB / ${Number(totalMb).toFixed(1)} MB`;
    } else {
      bText.textContent = `${pInt}% descargado`;
    }
  }
};

window.onUpdateComplete = () => {
  globalMaxUpdateProgress = 1;
  const modal = document.getElementById('updateModal');
  const bar = document.getElementById('updateProgressBar');
  const pText = document.getElementById('updatePercentText');
  const sText = document.getElementById('updateStatusText');
  const ringBar = document.getElementById('updateRingBar');
  const wrapper = document.getElementById('updateWrapper');

  if (bar) bar.style.width = '100%';
  if (pText) pText.textContent = '100%';
  if (sText) {
    sText.textContent = '¡Descarga completa! Abriendo instalador...';
    sText.style.color = '#25f4ee';
  }
  if (ringBar) ringBar.style.strokeDashoffset = '0';

  setTimeout(() => {
    if (modal) modal.style.display = 'none';
    if (wrapper) wrapper.classList.remove('downloading');
    if (ringBar) ringBar.style.strokeDashoffset = '106.81';
    globalMaxUpdateProgress = 0;
  }, 2000);
};

window.onUpdateError = (err) => {
  globalMaxUpdateProgress = 0;
  const bar = document.getElementById('updateProgressBar');
  const sText = document.getElementById('updateStatusText');
  const ringBar = document.getElementById('updateRingBar');
  const wrapper = document.getElementById('updateWrapper');

  if (bar) bar.style.width = '0%';
  if (sText) {
    sText.textContent = `Error: ${err || 'No se pudo descargar'}`;
    sText.style.color = '#fe2c55';
  }
  if (wrapper) wrapper.classList.remove('downloading');
  if (ringBar) ringBar.style.strokeDashoffset = '106.81';
  UI.showToast(err || 'Error al actualizar app');
};

let lastYtToastTime = 0;
let lastYtPercent = -1;
window.onYtDlpProgress = (progress) => {
  const pInt = Math.round((Number(progress) || 0) * 100);
  const now = Date.now();
  if (pInt !== lastYtPercent && (now - lastYtToastTime > 1200 || pInt >= 100 || pInt === 0)) {
    lastYtToastTime = now;
    lastYtPercent = pInt;
    UI.showToast(`Descargando: ${pInt}%`);
  }
};
window.onYtDlpComplete = (filename) => {
  lastYtPercent = -1;
  UI.showToast(`Guardado: ${filename}`);
};
window.onYtDlpError = (err) => {
  lastYtPercent = -1;
  UI.showToast(err || 'Error en descarga');
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
