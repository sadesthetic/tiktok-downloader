export class FloatingButton {
  static el = null;
  static progressEl = null;
  static isVisible = false;
  static onDownload = null;
  static onClose = null;

  static init(onDownload, onClose) {
    this.onDownload = onDownload;
    this.onClose = onClose;
    this.createDom();
    this.bindEvents();
  }

  static createDom() {
    if (this.el) return;
    const div = document.createElement('div');
    div.id = 'floatingQuickBtn';
    div.className = 'floating-quick-btn';
    div.innerHTML = `
      <svg class="floating-ring" viewBox="0 0 60 60">
        <circle class="ring-bg" cx="30" cy="30" r="26" />
        <circle class="ring-fill" id="floatingRingFill" cx="30" cy="30" r="26" />
      </svg>
      <div class="floating-btn-content" id="floatingBtnContent">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3v13M6 11l6 6 6-6"/>
          <line x1="4" y1="21" x2="20" y2="21"/>
        </svg>
      </div>
    `;
    document.body.appendChild(div);
    this.el = div;
    this.progressEl = div.querySelector('#floatingRingFill');
  }

  static show() {
    if (!this.el) return;
    this.el.style.display = 'flex';
    requestAnimationFrame(() => {
      this.el.classList.add('visible');
      this.el.classList.remove('vanishing');
    });
    this.isVisible = true;
  }

  static hide() {
    if (!this.el) return;
    this.el.classList.add('vanishing');
    this.el.classList.remove('visible');
    setTimeout(() => {
      this.el.style.display = 'none';
      this.el.classList.remove('vanishing');
    }, 300);
    this.isVisible = false;
    if (this.onClose) this.onClose();
  }

  static toggle() {
    if (this.isVisible) this.hide();
    else this.show();
    return this.isVisible;
  }

  static bindEvents() {
    const el = this.el;
    const progressEl = this.progressEl;
    const circumference = 2 * Math.PI * 26;
    progressEl.style.strokeDasharray = `${circumference}`;
    progressEl.style.strokeDashoffset = `${circumference}`;

    let isDown = false;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let holdStartTime = 0;
    let animId = null;

    const resetHold = () => {
      if (animId) cancelAnimationFrame(animId);
      animId = null;
      progressEl.style.strokeDashoffset = `${circumference}`;
    };

    const onPointerDown = (e) => {
      isDown = true;
      isDragging = false;
      const rect = el.getBoundingClientRect();
      startX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
      startY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
      initialLeft = rect.left;
      initialTop = rect.top;

      holdStartTime = performance.now();
      const holdDuration = 5000;

      const step = () => {
        if (!isDown) return;
        const elapsed = performance.now() - holdStartTime;
        const progress = Math.min(elapsed / holdDuration, 1);
        progressEl.style.strokeDashoffset = `${circumference * (1 - progress)}`;

        if (elapsed >= holdDuration) {
          isDown = false;
          resetHold();
          if (navigator.vibrate) navigator.vibrate(50);
          this.hide();
          return;
        }
        animId = requestAnimationFrame(step);
      };
      animId = requestAnimationFrame(step);
    };

    const onPointerMove = (e) => {
      if (!isDown) return;
      const curX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
      const curY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
      const dx = curX - startX;
      const dy = curY - startY;

      if (!isDragging && Math.hypot(dx, dy) > 6) {
        isDragging = true;
      }

      if (isDragging) {
        const btnW = el.offsetWidth || 56;
        const btnH = el.offsetHeight || 56;
        const newLeft = Math.max(10, Math.min(window.innerWidth - btnW - 10, initialLeft + dx));
        const newTop = Math.max(10, Math.min(window.innerHeight - btnH - 10, initialTop + dy));
        el.style.left = `${newLeft}px`;
        el.style.top = `${newTop}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      }
    };

    const onPointerUp = () => {
      if (!isDown) return;
      isDown = false;
      resetHold();

      if (!isDragging) {
        el.classList.add('pulse');
        setTimeout(() => el.classList.remove('pulse'), 200);
        if (this.onDownload) this.onDownload();
      }
    };

    el.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    el.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);
    window.addEventListener('touchcancel', () => {
      isDown = false;
      resetHold();
    });
  }
}
