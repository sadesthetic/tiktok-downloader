import { Storage } from './storage.js';
import { UI } from './ui.js';

export class Settings {
  static modal = null;
  static toggleBtn = null;
  static chkExp = null;
  static btnUpdateYt = null;
  static ytdlpVersionLabel = null;
  static ytdlpStatusText = null;
  static isUpdating = false;

  static init() {
    this.modal = document.getElementById('settingsModal');
    this.toggleBtn = document.getElementById('btnSettings');
    this.chkExp = document.getElementById('chkExperimental');
    this.btnUpdateYt = document.getElementById('btnUpdateYtDlp');
    this.ytdlpVersionLabel = document.getElementById('ytdlpVersionLabel');
    this.ytdlpStatusText = document.getElementById('ytdlpStatusText');
    const closeBtn = document.getElementById('btnCloseSettings');

    if (this.chkExp) {
      this.chkExp.checked = Storage.isExperimental();
      this.chkExp.addEventListener('change', (e) => {
        Storage.setExperimental(e.target.checked);
      });
    }

    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', () => this.open());
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) this.close();
      });
    }

    if (this.btnUpdateYt) {
      this.btnUpdateYt.addEventListener('click', () => this.handleUpdateYtDlp());
    }

    window.onYtDlpUpdateComplete = (status, version) => {
      this.onUpdateComplete(status, version);
    };

    window.onYtDlpUpdateError = (error) => {
      this.onUpdateError(error);
    };
  }

  static refreshYtDlpVersion() {
    if (!this.ytdlpVersionLabel) return;
    try {
      if (window.AndroidBridge && typeof window.AndroidBridge.getYtDlpVersion === 'function') {
        const ver = window.AndroidBridge.getYtDlpVersion();
        if (ver && ver !== 'Error' && ver !== 'Desconocida') {
          this.ytdlpVersionLabel.textContent = `Versión: ${ver}`;
          return;
        }
      }
    } catch {}
    this.ytdlpVersionLabel.textContent = 'Versión: Disponible (Nativo)';
  }

  static handleUpdateYtDlp() {
    if (this.isUpdating) return;
    this.isUpdating = true;

    if (this.btnUpdateYt) {
      this.btnUpdateYt.disabled = true;
      this.btnUpdateYt.classList.add('is-loading');
      const textSpan = document.getElementById('btnUpdateYtDlpText');
      if (textSpan) textSpan.textContent = 'Verificando...';
    }
    this.showStatus('Buscando actualización...', 'info');

    if (window.AndroidBridge && typeof window.AndroidBridge.updateYtDlp === 'function') {
      window.AndroidBridge.updateYtDlp();
    } else {
      setTimeout(() => {
        this.onUpdateComplete('ALREADY_UP_TO_DATE', 'Web Simulado');
      }, 1000);
    }
  }

  static onUpdateComplete(status, version) {
    this.isUpdating = false;
    if (this.btnUpdateYt) {
      this.btnUpdateYt.disabled = false;
      this.btnUpdateYt.classList.remove('is-loading');
      const textSpan = document.getElementById('btnUpdateYtDlpText');
      if (textSpan) textSpan.textContent = 'Verificar actualización';
    }

    if (version && this.ytdlpVersionLabel) {
      this.ytdlpVersionLabel.textContent = `Versión: ${version}`;
    }

    if (status === 'DONE') {
      this.showStatus(`¡Actualizado a versión ${version}!`, 'success');
      UI.showToast(`yt-dlp actualizado a ${version}`);
    } else {
      this.showStatus(`yt-dlp está al día (${version || 'última versión'})`, 'info');
      UI.showToast('yt-dlp ya está al día');
    }
  }

  static onUpdateError(error) {
    this.isUpdating = false;
    if (this.btnUpdateYt) {
      this.btnUpdateYt.disabled = false;
      this.btnUpdateYt.classList.remove('is-loading');
      const textSpan = document.getElementById('btnUpdateYtDlpText');
      if (textSpan) textSpan.textContent = 'Reintentar verificación';
    }
    this.showStatus(`Error: ${error || 'Fallo de red'}`, 'error');
    UI.showToast('Error al actualizar yt-dlp');
  }

  static showStatus(text, type) {
    if (!this.ytdlpStatusText) return;
    this.ytdlpStatusText.textContent = text;
    this.ytdlpStatusText.className = `setting-status ${type}`;
    this.ytdlpStatusText.style.display = 'block';
  }

  static open() {
    if (!this.modal) return;
    if (this.chkExp) this.chkExp.checked = Storage.isExperimental();
    this.refreshYtDlpVersion();
    this.modal.style.display = 'flex';
    requestAnimationFrame(() => this.modal.classList.add('show'));
  }

  static close() {
    if (!this.modal) return;
    this.modal.classList.remove('show');
    setTimeout(() => {
      this.modal.style.display = 'none';
      if (this.ytdlpStatusText) this.ytdlpStatusText.style.display = 'none';
    }, 200);
  }
}
