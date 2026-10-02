import { Storage } from './storage.js';

export class Settings {
  static modal = null;
  static toggleBtn = null;
  static chkExp = null;

  static init() {
    this.modal = document.getElementById('settingsModal');
    this.toggleBtn = document.getElementById('btnSettings');
    this.chkExp = document.getElementById('chkExperimental');
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
  }

  static open() {
    if (!this.modal) return;
    if (this.chkExp) this.chkExp.checked = Storage.isExperimental();
    this.modal.style.display = 'flex';
    requestAnimationFrame(() => this.modal.classList.add('show'));
  }

  static close() {
    if (!this.modal) return;
    this.modal.classList.remove('show');
    setTimeout(() => {
      this.modal.style.display = 'none';
    }, 200);
  }
}
