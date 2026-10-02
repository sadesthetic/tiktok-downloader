(() => {
  // app/src/main/assets/js/experimentalApi.js
  var ExperimentalApi = class {
    static isYouTube(url) {
      return /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]+)/i.test(url);
    }
    static isInstagram(url) {
      return /(?:instagram\.com\/(?:p|reel|tv)\/)([\w-]+)/i.test(url);
    }
    static async fetchMedia(url) {
      if (this.isYouTube(url)) return this.fetchYouTube(url);
      if (this.isInstagram(url)) return this.fetchInstagram(url);
      throw new Error("URL no soportada");
    }
    static async fetchYouTube(url) {
      const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]+)/i);
      const videoId = match ? match[1] : Date.now().toString();
      let title = "YouTube Video";
      let authorName = "YouTube";
      let cover = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      try {
        const infoRes = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
        if (infoRes.ok) {
          const info = await infoRes.json();
          if (info.title) title = info.title;
          if (info.author_name) authorName = info.author_name;
          if (info.thumbnail_url) cover = info.thumbnail_url;
        }
      } catch {
      }
      const directUrl = await this.resolveStream(url, "1080");
      return {
        id: videoId,
        title,
        cover,
        isImages: false,
        images: [],
        videoUrl: directUrl || url,
        musicUrl: directUrl || url,
        author: {
          name: authorName,
          handle: "",
          avatar: cover
        }
      };
    }
    static async fetchInstagram(url) {
      const match = url.match(/(?:instagram\.com\/(?:p|reel|tv)\/)([\w-]+)/i);
      const shortcode = match ? match[1] : Date.now().toString();
      const cover = `https://instagram.com/p/${shortcode}/media/?size=l`;
      const directUrl = await this.resolveStream(url, "1080");
      return {
        id: shortcode,
        title: "Instagram Video",
        cover,
        isImages: false,
        images: [],
        videoUrl: directUrl || cover,
        musicUrl: directUrl || cover,
        author: {
          name: "Instagram",
          handle: `@${shortcode}`,
          avatar: cover
        }
      };
    }
    static async resolveStream(targetUrl, format = "1080") {
      try {
        const res = await fetch(`https://p.savenow.to/ajax/download.php?format=${format}&url=${encodeURIComponent(targetUrl)}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.id) return null;
        for (let i = 0; i < 6; i++) {
          await new Promise((r) => setTimeout(r, 1200));
          try {
            const progRes = await fetch(`https://p.savenow.to/ajax/progress.php?id=${data.id}`);
            if (progRes.ok) {
              const prog = await progRes.json();
              if (prog.download_url) return prog.download_url;
            }
          } catch {
          }
        }
      } catch {
      }
      return null;
    }
  };

  // app/src/main/assets/js/storage.js
  var KEY = "tt_history_v1";
  var Storage = class {
    static getItems() {
      try {
        const data = localStorage.getItem(KEY);
        return data ? JSON.parse(data) : [];
      } catch {
        return [];
      }
    }
    static saveItem(item) {
      try {
        let items = this.getItems().filter((i) => i.id !== item.id);
        items.unshift({
          id: item.id,
          title: item.title,
          cover: item.cover,
          isImages: item.isImages,
          author: item.author.name,
          date: Date.now()
        });
        if (items.length > 20) items = items.slice(0, 20);
        localStorage.setItem(KEY, JSON.stringify(items));
      } catch {
      }
    }
    static deleteItem(id) {
      try {
        const items = this.getItems().filter((i) => i.id !== id);
        localStorage.setItem(KEY, JSON.stringify(items));
      } catch {
      }
    }
    static clear() {
      try {
        localStorage.removeItem(KEY);
      } catch {
      }
    }
    static isExperimental() {
      try {
        return localStorage.getItem("tt_exp_mode") === "true";
      } catch {
        return false;
      }
    }
    static setExperimental(enabled) {
      try {
        localStorage.setItem("tt_exp_mode", enabled ? "true" : "false");
      } catch {
      }
    }
  };

  // app/src/main/assets/js/api.js
  var TikTokApi = class {
    static cleanUrl(text) {
      if (!text) return null;
      const match = text.match(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?tiktok\.com\/[^\s"')<>]+/i);
      return match ? match[0].replace(/[.,;:!?]+$/, "") : null;
    }
    static async fetchMedia(url) {
      const validUrl = this.cleanUrl(url);
      if (!validUrl) {
        if (Storage.isExperimental()) {
          if (ExperimentalApi.isYouTube(url) || ExperimentalApi.isInstagram(url)) {
            return ExperimentalApi.fetchMedia(url.trim());
          }
        }
        throw new Error("URL inv\xE1lida");
      }
      let json = null;
      try {
        const formData = new FormData();
        formData.append("url", validUrl);
        formData.append("hd", "1");
        const res = await fetch("https://www.tikwm.com/api/", {
          method: "POST",
          body: formData
        });
        if (res.ok) json = await res.json();
      } catch {
      }
      if (!json || json.code !== 0 || !json.data) {
        const resGet = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(validUrl)}&hd=1`);
        if (resGet.ok) json = await resGet.json();
      }
      if (!json || json.code !== 0 || !json.data) {
        throw new Error(json?.msg || "No se pudo procesar");
      }
      const d = json.data;
      const isImages = Array.isArray(d.images) && d.images.length > 0;
      const fixUrl = (u) => {
        if (!u) return "";
        return u.startsWith("http") ? u : `https://www.tikwm.com${u}`;
      };
      return {
        id: d.id,
        title: d.title || "",
        cover: fixUrl(d.cover || d.origin_cover),
        isImages,
        images: isImages ? d.images.map(fixUrl) : [],
        videoUrl: fixUrl(d.hdplay || d.play),
        musicUrl: fixUrl(d.music),
        author: {
          name: d.author?.nickname || "TikTok User",
          handle: d.author?.unique_id ? `@${d.author.unique_id}` : "",
          avatar: fixUrl(d.author?.avatar)
        }
      };
    }
  };

  // app/src/main/assets/js/downloader.js
  var Downloader = class {
    static isNative() {
      return typeof window.AndroidBridge !== "undefined" && typeof window.AndroidBridge.download === "function";
    }
    static async downloadFile(url, filename, mimeType = "video/mp4") {
      if (this.isNative()) {
        window.AndroidBridge.download(url, filename, mimeType);
        return;
      }
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Network error");
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } catch {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    }
    static async saveBlob(blob, filename, mimeType = "video/mp4") {
      if (this.isNative() && typeof window.AndroidBridge.saveChunkInit === "function") {
        window.AndroidBridge.saveChunkInit(filename);
        const CHUNK_SIZE = 256 * 1024;
        let offset = 0;
        while (offset < blob.size) {
          const slice = blob.slice(offset, offset + CHUNK_SIZE);
          const buffer = await slice.arrayBuffer();
          let binary = "";
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
      if (this.isNative() && typeof window.AndroidBridge.saveBase64 === "function") {
        const reader = new FileReader();
        reader.onloadend = () => {
          window.AndroidBridge.saveBase64(reader.result, filename, mimeType);
        };
        reader.readAsDataURL(blob);
        return;
      }
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }
    static async downloadImages(images, prefix = "tiktok_photo") {
      for (let i = 0; i < images.length; i++) {
        const filename = `${prefix}_${i + 1}.jpg`;
        await this.downloadFile(images[i], filename, "image/jpeg");
        if (images.length > 1) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    }
    static openExternal(url) {
      if (this.isNative() && typeof window.AndroidBridge.openUrl === "function") {
        window.AndroidBridge.openUrl(url);
      } else {
        window.open(url, "_blank");
      }
    }
    static installUpdate(url) {
      if (this.isNative() && typeof window.AndroidBridge.installUpdate === "function") {
        window.AndroidBridge.installUpdate(url);
      } else {
        this.openExternal(url);
      }
    }
  };

  // app/src/main/assets/js/floatingButton.js
  var FloatingButton = class {
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
      const div = document.createElement("div");
      div.id = "floatingQuickBtn";
      div.className = "floating-quick-btn";
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
      this.progressEl = div.querySelector("#floatingRingFill");
    }
    static show() {
      if (!this.el) return;
      this.el.style.display = "flex";
      requestAnimationFrame(() => {
        this.el.classList.add("visible");
        this.el.classList.remove("vanishing");
      });
      this.isVisible = true;
    }
    static hide() {
      if (!this.el) return;
      this.el.classList.add("vanishing");
      this.el.classList.remove("visible");
      setTimeout(() => {
        this.el.style.display = "none";
        this.el.classList.remove("vanishing");
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
        const holdDuration = 5e3;
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
          el.style.right = "auto";
          el.style.bottom = "auto";
        }
      };
      const onPointerUp = () => {
        if (!isDown) return;
        isDown = false;
        resetHold();
        if (!isDragging) {
          el.classList.add("pulse");
          setTimeout(() => el.classList.remove("pulse"), 200);
          if (this.onDownload) this.onDownload();
        }
      };
      el.addEventListener("mousedown", onPointerDown);
      window.addEventListener("mousemove", onPointerMove);
      window.addEventListener("mouseup", onPointerUp);
      el.addEventListener("touchstart", onPointerDown, { passive: true });
      window.addEventListener("touchmove", onPointerMove, { passive: true });
      window.addEventListener("touchend", onPointerUp);
      window.addEventListener("touchcancel", () => {
        isDown = false;
        resetHold();
      });
    }
  };

  // app/src/main/assets/js/settings.js
  var Settings = class {
    static modal = null;
    static toggleBtn = null;
    static chkExp = null;
    static chkFloat = null;
    static init() {
      this.modal = document.getElementById("settingsModal");
      this.toggleBtn = document.getElementById("btnSettings");
      this.chkExp = document.getElementById("chkExperimental");
      this.chkFloat = document.getElementById("chkFloating");
      const closeBtn = document.getElementById("btnCloseSettings");
      if (this.chkExp) {
        this.chkExp.checked = Storage.isExperimental();
        this.chkExp.addEventListener("change", (e) => {
          Storage.setExperimental(e.target.checked);
        });
      }
      if (this.chkFloat) {
        this.syncFloatingState();
        this.chkFloat.addEventListener("change", (e) => {
          const enabled = e.target.checked;
          if (typeof window.AndroidBridge !== "undefined" && typeof window.AndroidBridge.setFloatingEnabled === "function") {
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
        this.toggleBtn.addEventListener("click", () => this.open());
      }
      if (closeBtn) {
        closeBtn.addEventListener("click", () => this.close());
      }
      if (this.modal) {
        this.modal.addEventListener("click", (e) => {
          if (e.target === this.modal) this.close();
        });
      }
    }
    static syncFloatingState() {
      if (!this.chkFloat) return;
      if (typeof window.AndroidBridge !== "undefined" && typeof window.AndroidBridge.isFloatingActive === "function") {
        this.chkFloat.checked = window.AndroidBridge.isFloatingActive();
      } else {
        this.chkFloat.checked = FloatingButton.isVisible;
      }
    }
    static open() {
      if (!this.modal) return;
      if (this.chkExp) this.chkExp.checked = Storage.isExperimental();
      this.syncFloatingState();
      this.modal.style.display = "flex";
      requestAnimationFrame(() => this.modal.classList.add("show"));
    }
    static close() {
      if (!this.modal) return;
      this.modal.classList.remove("show");
      setTimeout(() => {
        this.modal.style.display = "none";
      }, 200);
    }
  };

  // app/src/main/assets/js/icons.js
  var Icons = {
    clipboard: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`,
    arrowRight: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
    download: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    video: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`,
    image: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
    music: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
    videoMusic: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="9 8 15 12 9 16 9 8"/><path d="M20 5v6a2 2 0 1 1-2-2h2"/></svg>`,
    floating: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>`,
    chevronLeft: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
    chevronRight: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
    history: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    trash: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    refresh: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
    settings: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    close: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    brand: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/></svg>`
  };

  // app/src/main/assets/js/ui.js
  var UI = class {
    static currentMedia = null;
    static currentImageIndex = 0;
    static initIcons() {
      const set = (id, svg) => {
        const el = document.getElementById(id);
        if (el && !el.children.length) el.innerHTML = svg;
      };
      set("brandIcon", Icons.brand);
      set("btnPaste", Icons.clipboard);
      set("btnSubmit", Icons.arrowRight);
      set("btnCheckUpdate", Icons.refresh);
      set("btnToggleFloating", Icons.floating);
      set("btnToggleHistory", Icons.history);
      set("btnSettings", Icons.settings);
      set("btnCloseSettings", Icons.close);
      set("btnClearHistory", Icons.trash);
    }
    static showToast(msg) {
      const toast = document.getElementById("toast");
      toast.textContent = msg;
      toast.classList.add("show");
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        toast.classList.remove("show");
      }, 2500);
    }
    static setLoader(active) {
      const loader = document.getElementById("loader");
      loader.classList.toggle("active", active);
      document.getElementById("btnSubmit").disabled = active;
    }
    static renderResult(data) {
      this.currentMedia = data;
      this.currentImageIndex = 0;
      const card = document.getElementById("resultCard");
      document.getElementById("authorAvatar").src = data.author.avatar || data.cover;
      document.getElementById("authorName").textContent = data.author.name;
      document.getElementById("authorId").textContent = data.author.handle;
      document.getElementById("cardCaption").textContent = data.title;
      const viewer = document.getElementById("mediaViewer");
      const content = document.getElementById("mediaContent") || viewer;
      const badge = document.getElementById("mediaBadge");
      const actions = document.getElementById("actionBar");
      content.innerHTML = "";
      actions.innerHTML = "";
      viewer.querySelectorAll(".gallery-nav").forEach((el) => el.remove());
      if (data.isImages) {
        if (badge) {
          badge.style.display = "flex";
          badge.innerHTML = `${Icons.image} <span>1 / ${data.images.length}</span>`;
        }
        const img = document.createElement("img");
        img.id = "activeImage";
        img.className = "media-image";
        img.src = data.images[0];
        content.appendChild(img);
        if (data.images.length > 1) {
          const btnPrev = document.createElement("button");
          btnPrev.className = "gallery-nav prev";
          btnPrev.innerHTML = Icons.chevronLeft;
          btnPrev.onclick = () => this.navigateGallery(-1);
          const btnNext = document.createElement("button");
          btnNext.className = "gallery-nav next";
          btnNext.innerHTML = Icons.chevronRight;
          btnNext.onclick = () => this.navigateGallery(1);
          viewer.appendChild(btnPrev);
          viewer.appendChild(btnNext);
        }
        const btnDlCurrent = document.createElement("button");
        btnDlCurrent.className = "btn-primary";
        btnDlCurrent.id = "btnDownloadImage";
        btnDlCurrent.innerHTML = `${Icons.download} <span>Descargar Imagen</span>`;
        const subRow = document.createElement("div");
        subRow.className = "action-row";
        if (data.images.length > 1) {
          const btnDlAll = document.createElement("button");
          btnDlAll.className = "btn-secondary";
          btnDlAll.id = "btnDownloadAllImages";
          btnDlAll.innerHTML = `${Icons.download} <span>Todas (${data.images.length})</span>`;
          subRow.appendChild(btnDlAll);
        }
        if (data.musicUrl) {
          const btnWithMusic = document.createElement("button");
          btnWithMusic.className = "btn-secondary";
          btnWithMusic.id = "btnDownloadImageWithMusic";
          btnWithMusic.innerHTML = `${Icons.videoMusic} <span>Con m\xFAsica</span>`;
          subRow.appendChild(btnWithMusic);
          const btnMusic = document.createElement("button");
          btnMusic.className = "btn-secondary";
          btnMusic.id = "btnDownloadAudio";
          btnMusic.innerHTML = `${Icons.music} <span>Audio</span>`;
          subRow.appendChild(btnMusic);
        }
        actions.appendChild(btnDlCurrent);
        if (subRow.children.length > 0) actions.appendChild(subRow);
      } else {
        if (badge) {
          badge.style.display = "flex";
          badge.innerHTML = `${Icons.video} <span>MP4</span>`;
        }
        const video = document.createElement("video");
        video.className = "media-video";
        video.src = data.videoUrl;
        video.poster = data.cover;
        video.controls = true;
        video.playsInline = true;
        content.appendChild(video);
        const btnDlVideo = document.createElement("button");
        btnDlVideo.className = "btn-primary";
        btnDlVideo.id = "btnDownloadVideo";
        btnDlVideo.innerHTML = `${Icons.download} <span>Descargar MP4</span>`;
        const subRow = document.createElement("div");
        subRow.className = "action-row";
        if (data.musicUrl) {
          const btnMusic = document.createElement("button");
          btnMusic.className = "btn-secondary";
          btnMusic.id = "btnDownloadAudio";
          btnMusic.innerHTML = `${Icons.music} <span>Audio</span>`;
          subRow.appendChild(btnMusic);
        }
        actions.appendChild(btnDlVideo);
        if (subRow.children.length > 0) actions.appendChild(subRow);
      }
      card.classList.add("active");
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    static navigateGallery(dir) {
      if (!this.currentMedia || !this.currentMedia.images.length) return;
      const total = this.currentMedia.images.length;
      this.currentImageIndex = (this.currentImageIndex + dir + total) % total;
      const img = document.getElementById("activeImage");
      if (img) img.src = this.currentMedia.images[this.currentImageIndex];
      const badge = document.getElementById("mediaBadge");
      if (badge) badge.innerHTML = `${Icons.image} <span>${this.currentImageIndex + 1} / ${total}</span>`;
    }
    static renderHistory(onSelect) {
      const list = document.getElementById("historyList");
      const items = Storage.getItems();
      list.innerHTML = "";
      if (items.length === 0) {
        document.getElementById("historyPanel").style.display = "none";
        return;
      }
      document.getElementById("historyPanel").style.display = "flex";
      items.forEach((item) => {
        const el = document.createElement("div");
        el.className = "history-item";
        const thumb = document.createElement("img");
        thumb.className = "history-thumb";
        thumb.src = item.cover;
        const details = document.createElement("div");
        details.className = "history-details";
        details.innerHTML = `
        <div class="history-caption">${item.title || "TikTok"}</div>
        <div class="history-sub">${item.author} \u2022 ${item.isImages ? "Foto" : "MP4"}</div>
      `;
        const delBtn = document.createElement("button");
        delBtn.className = "icon-btn";
        delBtn.innerHTML = Icons.trash;
        delBtn.onclick = (e) => {
          e.stopPropagation();
          Storage.deleteItem(item.id);
          this.renderHistory(onSelect);
        };
        el.appendChild(thumb);
        el.appendChild(details);
        el.appendChild(delBtn);
        el.onclick = () => onSelect(item.id);
        list.appendChild(el);
      });
    }
  };

  // app/src/main/assets/js/updater.js
  var Updater = class {
    static CURRENT_VERSION = "1.0.6";
    static REMOTE_MANIFEST_URL = "https://raw.githubusercontent.com/sadesthetic/tiktok-downloader/main/version.json";
    static async checkUpdate() {
      try {
        const url = `${this.REMOTE_MANIFEST_URL}?t=${Date.now()}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const isNewer = this.compare(data.version, this.CURRENT_VERSION) > 0;
        return {
          hasUpdate: isNewer,
          current: this.CURRENT_VERSION,
          latest: data.version,
          downloadUrl: data.downloadUrl || "https://raw.githubusercontent.com/sadesthetic/tiktok-downloader/main/TikTokDownloader.apk"
        };
      } catch {
        return {
          hasUpdate: false,
          error: true,
          current: this.CURRENT_VERSION,
          latest: this.CURRENT_VERSION
        };
      }
    }
    static compare(v1, v2) {
      const p1 = (v1 || "0").split(".").map(Number);
      const p2 = (v2 || "0").split(".").map(Number);
      for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const n1 = p1[i] || 0;
        const n2 = p2[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
      }
      return 0;
    }
  };

  // app/src/main/assets/js/videoGenerator.js
  var VideoGenerator = class {
    static async generateAndSave(imageUrl, musicUrl, filename, onProgress) {
      const [img, audioData] = await Promise.all([
        this.loadImage(imageUrl),
        this.loadAudio(musicUrl)
      ]);
      const { buffer: audioBuffer, ctx: audioCtx } = audioData;
      const canvas = document.createElement("canvas");
      let w = img.naturalWidth || 720;
      let h = img.naturalHeight || 1280;
      const maxDim = 1080;
      const scale = Math.min(maxDim / Math.max(w, h), 1);
      w = Math.floor(w * scale / 2) * 2;
      h = Math.floor(h * scale / 2) * 2;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      const canvasStream = canvas.captureStream(24);
      const stream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks()
      ]);
      const mimeTypes = [
        "video/mp4;codecs=avc1,mp4a.40.2",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm"
      ];
      const mimeType = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      const duration = Math.min(audioBuffer.duration || 10, 15);
      return new Promise((resolve, reject) => {
        let animId;
        const startTime = performance.now();
        const drawLoop = () => {
          ctx.drawImage(img, 0, 0, w, h);
          const elapsed = (performance.now() - startTime) / 1e3;
          if (onProgress) onProgress(Math.min(elapsed / duration, 1));
          if (elapsed < duration) {
            animId = requestAnimationFrame(drawLoop);
          }
        };
        recorder.onstop = async () => {
          cancelAnimationFrame(animId);
          audioCtx.close().catch(() => {
          });
          const blob = new Blob(chunks, { type: mimeType });
          const ext = mimeType.includes("mp4") ? "mp4" : "webm";
          const finalName = filename.replace(/\.(mp4|webm)$/, `.${ext}`);
          await Downloader.saveBlob(blob, finalName, mimeType);
          resolve(finalName);
        };
        recorder.onerror = (e) => {
          cancelAnimationFrame(animId);
          audioCtx.close().catch(() => {
          });
          reject(e.error || new Error("Error al grabar video"));
        };
        recorder.start(100);
        source.start(0);
        drawLoop();
        setTimeout(() => {
          if (recorder.state === "recording") {
            source.stop();
            recorder.stop();
          }
        }, duration * 1e3);
      });
    }
    static async loadImage(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Error al descargar imagen");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Error al procesar imagen"));
        };
        img.src = objectUrl;
      });
    }
    static async loadAudio(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Error al descargar audio");
      const arrayBuffer = await res.arrayBuffer();
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      const buffer = await new Promise((resolve, reject) => {
        ctx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
      });
      return { buffer, ctx };
    }
  };

  // app/src/main/assets/js/main.js
  var App = class _App {
    static init() {
      UI.initIcons();
      Settings.init();
      UI.renderHistory((id) => this.processUrl(`https://www.tiktok.com/@user/video/${id}`));
      const input = document.getElementById("urlInput");
      const btnSubmit = document.getElementById("btnSubmit");
      const btnPaste = document.getElementById("btnPaste");
      const btnCheckUpdate = document.getElementById("btnCheckUpdate");
      const btnToggleHistory = document.getElementById("btnToggleHistory");
      const btnClearHistory = document.getElementById("btnClearHistory");
      const historyPanel = document.getElementById("historyPanel");
      FloatingButton.init(
        () => _App.quickDownloadCurrent(),
        () => Settings.syncFloatingState()
      );
      let lastUpdateClick = 0;
      btnCheckUpdate.addEventListener("click", async () => {
        const now = Date.now();
        btnCheckUpdate.style.transform = "rotate(360deg)";
        btnCheckUpdate.style.transition = "transform 0.6s ease";
        setTimeout(() => {
          btnCheckUpdate.style.transform = "";
          btnCheckUpdate.style.transition = "";
        }, 600);
        const info = await Updater.checkUpdate();
        if (info.hasUpdate) {
          Downloader.installUpdate(info.downloadUrl);
        } else if (info.error) {
          UI.showToast("Sin conexi\xF3n");
        } else {
          if (now - lastUpdateClick < 2e3) {
            Downloader.installUpdate(info.downloadUrl);
          } else {
            UI.showToast(`v${info.current} al d\xEDa`);
          }
        }
        lastUpdateClick = now;
      });
      btnPaste.addEventListener("click", async () => {
        let text = "";
        if (Downloader.isNative() && window.AndroidBridge && window.AndroidBridge.getClipboard) {
          text = window.AndroidBridge.getClipboard();
        }
        if (!text && navigator.clipboard && navigator.clipboard.readText) {
          try {
            text = await navigator.clipboard.readText();
          } catch {
          }
        }
        if (text) {
          input.value = text;
          _App.processUrl(text);
        } else {
          UI.showToast("Portapapeles vac\xEDo");
        }
      });
      btnSubmit.addEventListener("click", () => {
        _App.processUrl(input.value);
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") _App.processUrl(input.value);
      });
      window.handleSharedUrl = (url) => {
        if (!url) return;
        input.value = url;
        _App.processUrl(url);
      };
      try {
        if (Downloader.isNative() && window.AndroidBridge && window.AndroidBridge.getSharedUrl) {
          const initialShared = window.AndroidBridge.getSharedUrl();
          if (initialShared) {
            window.handleSharedUrl(initialShared);
          }
        }
      } catch {
      }
      btnToggleHistory.addEventListener("click", () => {
        const isHidden = historyPanel.style.display === "none";
        historyPanel.style.display = isHidden ? "flex" : "none";
      });
      btnClearHistory.addEventListener("click", () => {
        Storage.clear();
        UI.renderHistory();
        UI.showToast("Historial limpio");
      });
      document.getElementById("actionBar").addEventListener("click", (e) => {
        const target = e.target.closest("button");
        if (!target || !UI.currentMedia) return;
        const media = UI.currentMedia;
        if (target.id === "btnDownloadVideo") {
          Downloader.downloadFile(media.videoUrl, `tiktok_${media.id}.mp4`, "video/mp4");
          UI.showToast("Descargando MP4");
        } else if (target.id === "btnDownloadImage") {
          const curImg = media.images[UI.currentImageIndex];
          Downloader.downloadFile(curImg, `tiktok_${media.id}_${UI.currentImageIndex + 1}.jpg`, "image/jpeg");
          UI.showToast("Descargando Imagen");
        } else if (target.id === "btnDownloadImageWithMusic") {
          const curImg = media.images[UI.currentImageIndex];
          if (!media.musicUrl) {
            UI.showToast("Sin m\xFAsica disponible");
            return;
          }
          UI.showToast("Generando video con m\xFAsica...");
          target.disabled = true;
          VideoGenerator.generateAndSave(
            curImg,
            media.musicUrl,
            `tiktok_${media.id}_${UI.currentImageIndex + 1}_music.mp4`
          ).then(() => {
            UI.showToast("Video con m\xFAsica descargado");
          }).catch((err) => {
            UI.showToast(err.message || "Error al generar video");
          }).finally(() => {
            target.disabled = false;
          });
        } else if (target.id === "btnDownloadAllImages") {
          Downloader.downloadImages(media.images, `tiktok_${media.id}`);
          UI.showToast(`Descargando ${media.images.length} im\xE1genes`);
        } else if (target.id === "btnDownloadAudio") {
          Downloader.downloadFile(media.musicUrl, `tiktok_${media.id}.mp3`, "audio/mpeg");
          UI.showToast("Descargando Audio");
        }
      });
    }
    static quickDownloadCurrent() {
      const media = UI.currentMedia;
      if (!media) {
        let text = "";
        if (Downloader.isNative() && window.AndroidBridge && window.AndroidBridge.getClipboard) {
          text = window.AndroidBridge.getClipboard();
        }
        if (text) {
          this.processUrl(text).then(() => {
            if (UI.currentMedia) this.quickDownloadCurrent();
          });
          return;
        }
        UI.showToast("Carga un TikTok primero");
        return;
      }
      if (media.isImages && media.images?.length) {
        const idx = UI.currentImageIndex;
        const curImg = media.images[idx];
        Downloader.downloadFile(curImg, `tiktok_${media.id}_${idx + 1}.jpg`, "image/jpeg");
        UI.showToast(`Foto ${idx + 1} descargada`);
      } else if (media.videoUrl) {
        Downloader.downloadFile(media.videoUrl, `tiktok_${media.id}.mp4`, "video/mp4");
        UI.showToast("MP4 descargado");
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
        UI.showToast(err.message || "Error al procesar enlace");
      } finally {
        UI.setLoader(false);
      }
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => App.init());
  } else {
    App.init();
  }
})();
