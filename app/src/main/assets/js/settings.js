import { FloatingButton } from './floatingButton.js';
import { Storage } from './storage.js';

export class Settings {
  static modal = null;
  static toggleBtn = null;
  static chkExp = null;
  static chkFloat = null;

  static init() {
    this.modal = document.getElementById('settingsModal');
    this.toggleBtn = document.getElementById('btnSettings');
    this.chkExp = document.getElementById('chkExperimental');
    this.chkFloat = document.getElementById('chkFloating');
    const closeBtn = document.getElementById('btnCloseSettings');

    if (this.chkExp) {
      this.chkExp.checked = Storage.isExperimental();
      this.chkExp.addEventListener('change', (e) => {
        Storage.setExperimental(e.target.checked);
      });
    }

    if (this.chkFloat) {
      this.syncFloatingState();
      this.chkFloat.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        if (typeof window.AndroidBridge !== 'undefined' && typeof window.AndroidBridge.setFloatingEnabled === 'function') {
          const success = window.AndroidBridge.setFloatingEnabled(enabled);
          if (!success && enabled) {
            this.chkFloat.checked = false;
          }
        } else {
          if (enabled) FloatingButton.show();
          else FloatingButton.hide();
        }
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

  static syncFloatingState() {
    if (!this.chkFloat) return;
    if (typeof window.AndroidBridge !== 'undefined' && typeof window.AndroidBridge.isFloatingActive === 'function') {
      this.chkFloat.checked = window.AndroidBridge.isFloatingActive();
    } else {
      this.chkFloat.checked = FloatingButton.isVisible;
    }
  }

  static open() {
    if (!this.modal) return;
    if (this.chkExp) this.chkExp.checked = Storage.isExperimental();
    this.syncFloatingState();
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
