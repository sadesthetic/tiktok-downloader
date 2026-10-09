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
      const shortcode = match ? match[1] : null;
      if (!shortcode) throw new Error("Enlace de Instagram inv\xE1lido");
      const hosts = ["eeinstagram.com", "ddinstagram.com"];
      let lastErr = null;
      for (const host of hosts) {
        try {
          let title = "Instagram";
          let authorName = `@${shortcode}`;
          try {
            const metaRes = await fetch(`https://${host}/p/${shortcode}/`, {
              headers: { "User-Agent": "facebookexternalhit/1.1 (compatible; Discordbot/2.0; +https://discordapp.com)" },
              signal: AbortSignal.timeout(6e3)
            });
            if (metaRes.ok) {
              const html = await metaRes.text();
              const desc = html.match(/property=["']og:description["'][^>]+content=["']([^"']+)["']/)?.[1];
              const author = html.match(/name=["']twitter:title["'][^>]+content=["']([^"']+)["']/)?.[1];
              if (desc && desc !== "Post not found") title = desc;
              if (author) authorName = author;
            }
          } catch {
          }
          const mediaRes = await fetch(`https://${host}/videos/${shortcode}/1`, {
            redirect: "follow",
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(8e3)
          });
          if (!mediaRes.ok && mediaRes.status !== 302 && mediaRes.status !== 200) {
            throw new Error("Contenido no disponible");
          }
          const finalUrl = mediaRes.url;
          const ctype = (mediaRes.headers.get("content-type") || "").toLowerCase();
          const isVideo = ctype.includes("video") || finalUrl.includes(".mp4");
          if (isVideo) {
            return {
              id: shortcode,
              title,
              cover: finalUrl,
              isImages: false,
              images: [],
              videoUrl: finalUrl,
              musicUrl: finalUrl,
              author: {
                name: authorName,
                handle: authorName.startsWith("@") ? authorName : `@${shortcode}`,
                avatar: finalUrl
              }
            };
          }
          const images = [finalUrl];
          for (let i = 2; i <= 20; i++) {
            try {
              const nextRes = await fetch(`https://${host}/images/${shortcode}/${i}`, {
                redirect: "follow",
                headers: { "User-Agent": "Mozilla/5.0" },
                signal: AbortSignal.timeout(4e3)
              });
              const nUrl = nextRes.url;
              const nType = (nextRes.headers.get("content-type") || "").toLowerCase();
              if (nUrl.includes("cdninstagram.com") && (nType.includes("image") || nType.includes("jpeg") || nType.includes("webp"))) {
                images.push(nUrl);
              } else {
                break;
              }
            } catch {
              break;
            }
          }
          return {
            id: shortcode,
            title,
            cover: images[0],
            isImages: true,
            images,
            videoUrl: "",
            musicUrl: "",
            author: {
              name: authorName,
              handle: authorName.startsWith("@") ? authorName : `@${shortcode}`,
              avatar: images[0]
            }
          };
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error("No se pudo descargar el contenido de Instagram");
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
      const match = text.match(/https?:\/\/[^\s"')<>]+/i);
      return match ? match[0].replace(/[.,;:!?]+$/, "") : null;
    }
    static isTikTok(url) {
      return /https?:\/\/(?:[a-zA-Z0-9-]+\.)?tiktok\.com\//i.test(url);
    }
    static async fetchMedia(rawText) {
      const validUrl = this.cleanUrl(rawText);
      if (!validUrl) throw new Error("URL inv\xE1lida");
      if (this.isTikTok(validUrl)) {
        try {
          return await this.fetchTikTok(validUrl);
        } catch {
        }
      }
      let ytDlpError = null;
      if (window.AndroidBridge && typeof window.AndroidBridge.ytDlpGetInfo === "function") {
        try {
          const jsonStr = window.AndroidBridge.ytDlpGetInfo(validUrl);
          const info = JSON.parse(jsonStr);
          if (info) {
            if (!info.error) {
              return {
                id: info.id || Date.now().toString(),
                title: info.title || "Video",
                cover: info.cover || "",
                isImages: false,
                images: [],
                videoUrl: info.url || "",
                musicUrl: "",
                isYtDlp: true,
                rawUrl: validUrl,
                author: {
                  name: info.uploader || "yt-dlp",
                  handle: "",
                  avatar: info.cover || ""
                }
              };
            } else {
              ytDlpError = info.error;
            }
          }
        } catch (e) {
          ytDlpError = e.message;
        }
      }
      if (ExperimentalApi.isYouTube(validUrl) || ExperimentalApi.isInstagram(validUrl)) {
        try {
          return await ExperimentalApi.fetchMedia(validUrl);
        } catch (expErr) {
          if (ytDlpError) {
            throw new Error("Error al extraer video. Actualiza yt-dlp en Configuraci\xF3n.");
          }
          throw expErr;
        }
      }
      if (ytDlpError) {
        throw new Error("Error de yt-dlp. Actualiza el motor en Configuraci\xF3n.");
      }
      throw new Error("No se pudo procesar el enlace");
    }
    static async fetchTikTok(validUrl) {
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
        musicUrl: fixUrl(d.music_info?.play || d.music),
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

  // app/src/main/assets/js/icons.js
  var Icons = {
    clipboard: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`,
    arrowRight: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
    download: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    video: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`,
    image: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
    music: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
    videoMusic: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="9 8 15 12 9 16 9 8"/><path d="M20 5v6a2 2 0 1 1-2-2h2"/></svg>`,
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
          badge.innerHTML = `${Icons.video} <span>${data.isYtDlp ? "yt-dlp" : "MP4"}</span>`;
        }
        if (data.videoUrl) {
          const video = document.createElement("video");
          video.className = "media-video";
          video.src = data.videoUrl;
          video.poster = data.cover;
          video.controls = true;
          video.playsInline = true;
          content.appendChild(video);
        } else if (data.cover) {
          const img = document.createElement("img");
          img.className = "media-image";
          img.src = data.cover;
          content.appendChild(img);
        }
        const btnDlVideo = document.createElement("button");
        btnDlVideo.className = "btn-primary";
        btnDlVideo.id = "btnDownloadVideo";
        btnDlVideo.innerHTML = `${Icons.download} <span>Descargar MP4</span>`;
        const subRow = document.createElement("div");
        subRow.className = "action-row";
        const btnMusic = document.createElement("button");
        btnMusic.className = "btn-secondary";
        btnMusic.id = "btnDownloadAudio";
        btnMusic.innerHTML = `${Icons.music} <span>Descargar MP3</span>`;
        subRow.appendChild(btnMusic);
        actions.appendChild(btnDlVideo);
        actions.appendChild(subRow);
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

  // app/src/main/assets/js/settings.js
  var Settings = class {
    static modal = null;
    static toggleBtn = null;
    static chkExp = null;
    static btnUpdateYt = null;
    static ytdlpVersionLabel = null;
    static ytdlpStatusText = null;
    static isUpdating = false;
    static init() {
      this.modal = document.getElementById("settingsModal");
      this.toggleBtn = document.getElementById("btnSettings");
      this.chkExp = document.getElementById("chkExperimental");
      this.btnUpdateYt = document.getElementById("btnUpdateYtDlp");
      this.ytdlpVersionLabel = document.getElementById("ytdlpVersionLabel");
      this.ytdlpStatusText = document.getElementById("ytdlpStatusText");
      const closeBtn = document.getElementById("btnCloseSettings");
      if (this.chkExp) {
        this.chkExp.checked = Storage.isExperimental();
        this.chkExp.addEventListener("change", (e) => {
          Storage.setExperimental(e.target.checked);
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
      if (this.btnUpdateYt) {
        this.btnUpdateYt.addEventListener("click", () => this.handleUpdateYtDlp());
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
        if (window.AndroidBridge && typeof window.AndroidBridge.getYtDlpVersion === "function") {
          const ver = window.AndroidBridge.getYtDlpVersion();
          if (ver && ver !== "Error" && ver !== "Desconocida") {
            this.ytdlpVersionLabel.textContent = `Versi\xF3n: ${ver}`;
            return;
          }
        }
      } catch {
      }
      this.ytdlpVersionLabel.textContent = "Versi\xF3n: Disponible (Nativo)";
    }
    static handleUpdateYtDlp() {
      if (this.isUpdating) return;
      this.isUpdating = true;
      if (this.btnUpdateYt) {
        this.btnUpdateYt.disabled = true;
        this.btnUpdateYt.classList.add("is-loading");
        const textSpan = document.getElementById("btnUpdateYtDlpText");
        if (textSpan) textSpan.textContent = "Verificando...";
      }
      this.showStatus("Buscando actualizaci\xF3n...", "info");
      if (window.AndroidBridge && typeof window.AndroidBridge.updateYtDlp === "function") {
        window.AndroidBridge.updateYtDlp();
      } else {
        setTimeout(() => {
          this.onUpdateComplete("ALREADY_UP_TO_DATE", "Web Simulado");
        }, 1e3);
      }
    }
    static onUpdateComplete(status, version) {
      this.isUpdating = false;
      if (this.btnUpdateYt) {
        this.btnUpdateYt.disabled = false;
        this.btnUpdateYt.classList.remove("is-loading");
        const textSpan = document.getElementById("btnUpdateYtDlpText");
        if (textSpan) textSpan.textContent = "Verificar actualizaci\xF3n";
      }
      if (version && this.ytdlpVersionLabel) {
        this.ytdlpVersionLabel.textContent = `Versi\xF3n: ${version}`;
      }
      if (status === "DONE") {
        this.showStatus(`\xA1Actualizado a versi\xF3n ${version}!`, "success");
        UI.showToast(`yt-dlp actualizado a ${version}`);
      } else {
        this.showStatus(`yt-dlp est\xE1 al d\xEDa (${version || "\xFAltima versi\xF3n"})`, "info");
        UI.showToast("yt-dlp ya est\xE1 al d\xEDa");
      }
    }
    static onUpdateError(error) {
      this.isUpdating = false;
      if (this.btnUpdateYt) {
        this.btnUpdateYt.disabled = false;
        this.btnUpdateYt.classList.remove("is-loading");
        const textSpan = document.getElementById("btnUpdateYtDlpText");
        if (textSpan) textSpan.textContent = "Reintentar verificaci\xF3n";
      }
      this.showStatus(`Error: ${error || "Fallo de red"}`, "error");
      UI.showToast("Error al actualizar yt-dlp");
    }
    static showStatus(text, type) {
      if (!this.ytdlpStatusText) return;
      this.ytdlpStatusText.textContent = text;
      this.ytdlpStatusText.className = `setting-status ${type}`;
      this.ytdlpStatusText.style.display = "block";
    }
    static open() {
      if (!this.modal) return;
      if (this.chkExp) this.chkExp.checked = Storage.isExperimental();
      this.refreshYtDlpVersion();
      this.modal.style.display = "flex";
      requestAnimationFrame(() => this.modal.classList.add("show"));
    }
    static close() {
      if (!this.modal) return;
      this.modal.classList.remove("show");
      setTimeout(() => {
        this.modal.style.display = "none";
        if (this.ytdlpStatusText) this.ytdlpStatusText.style.display = "none";
      }, 200);
    }
  };

  // app/src/main/assets/js/updater.js
  var Updater = class {
    static get CURRENT_VERSION() {
      return window.AndroidBridge && window.AndroidBridge.getAppVersion ? window.AndroidBridge.getAppVersion() : "1.0.10";
    }
    static REMOTE_MANIFEST_URL = "https://raw.githubusercontent.com/sadesthetic/tiktok-downloader/main/version.json";
    static async checkUpdate() {
      try {
        const current = this.CURRENT_VERSION;
        const url = `${this.REMOTE_MANIFEST_URL}?t=${Date.now()}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const isNewer = this.compare(data.version, current) > 0;
        const rawUrl = data.downloadUrl || "https://raw.githubusercontent.com/sadesthetic/tiktok-downloader/main/TikTokDownloader.apk";
        const downloadUrl = rawUrl.includes("?") ? `${rawUrl}&t=${Date.now()}` : `${rawUrl}?t=${Date.now()}`;
        return {
          hasUpdate: isNewer,
          current,
          latest: data.version,
          downloadUrl
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
      const maxDuration = 40;
      const duration = Math.min(audioBuffer.duration || maxDuration, maxDuration);
      return new Promise((resolve, reject) => {
        let animId;
        const startTime = performance.now();
        let frame = 0;
        const drawLoop = () => {
          frame++;
          ctx.drawImage(img, 0, 0, w, h);
          ctx.fillStyle = frame % 2 === 0 ? "rgba(0,0,0,0.004)" : "rgba(0,0,0,0.002)";
          ctx.fillRect(0, 0, 1, 1);
          const elapsed = (performance.now() - startTime) / 1e3;
          if (onProgress) onProgress(Math.min(elapsed / duration, 1));
          if (elapsed < duration) {
            animId = requestAnimationFrame(drawLoop);
          }
        };
        let timer;
        const finish = () => {
          if (recorder.state === "recording") {
            try {
              source.stop();
            } catch {
            }
            recorder.stop();
          }
        };
        source.onended = () => {
          finish();
        };
        recorder.onstop = async () => {
          clearTimeout(timer);
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
          clearTimeout(timer);
          cancelAnimationFrame(animId);
          audioCtx.close().catch(() => {
          });
          reject(e.error || new Error("Error al grabar video"));
        };
        recorder.start(100);
        source.start(0);
        drawLoop();
        timer = setTimeout(finish, (duration + 0.2) * 1e3);
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
      const btnClearHistory = document.getElementById("btnClearHistory");
      const historyPanel = document.getElementById("historyPanel");
      let isUpdating = false;
      let lastReportedProgress = 0;
      const updateModal = document.getElementById("updateModal");
      const btnHideUpdateModal = document.getElementById("btnHideUpdateModal");
      if (btnHideUpdateModal && updateModal) {
        btnHideUpdateModal.addEventListener("click", () => {
          updateModal.style.display = "none";
        });
        updateModal.addEventListener("click", (e) => {
          if (e.target === updateModal) updateModal.style.display = "none";
        });
      }
      btnCheckUpdate.addEventListener("click", async () => {
        if (isUpdating) {
          if (updateModal) updateModal.style.display = "flex";
          UI.showToast("Descarga en curso...");
          return;
        }
        btnCheckUpdate.style.transform = "rotate(360deg)";
        btnCheckUpdate.style.transition = "transform 0.6s ease";
        setTimeout(() => {
          btnCheckUpdate.style.transform = "";
          btnCheckUpdate.style.transition = "";
        }, 600);
        const info = await Updater.checkUpdate();
        if (info.hasUpdate) {
          isUpdating = true;
          lastReportedProgress = 0;
          const badge = document.getElementById("updateVersionBadge");
          const bar = document.getElementById("updateProgressBar");
          const pText = document.getElementById("updatePercentText");
          const sText = document.getElementById("updateStatusText");
          const bText = document.getElementById("updateBytesText");
          const ringBar = document.getElementById("updateRingBar");
          const wrapper = document.getElementById("updateWrapper");
          if (badge) badge.textContent = `v${info.current} \u2192 v${info.latest}`;
          if (bar) bar.style.width = "0%";
          if (pText) pText.textContent = "0%";
          if (sText) {
            sText.textContent = "Descargando actualizaci\xF3n...";
            sText.style.color = "var(--text-main)";
          }
          if (bText) bText.textContent = "Conectando con GitHub...";
          if (wrapper) wrapper.classList.add("downloading");
          if (ringBar) ringBar.style.strokeDashoffset = "106.81";
          if (updateModal) updateModal.style.display = "flex";
          Downloader.installUpdate(info.downloadUrl);
        } else if (info.error) {
          UI.showToast("Sin conexi\xF3n a GitHub");
        } else {
          UI.showToast(`v${info.current} al d\xEDa`);
        }
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
      btnClearHistory.addEventListener("click", () => {
        Storage.clear();
        UI.renderHistory();
        UI.showToast("Historial limpio");
      });
      document.getElementById("actionBar").addEventListener("click", (e) => {
        const target = e.target.closest("button");
        if (!target || !UI.currentMedia) return;
        const media = UI.currentMedia;
        const prefix = media.id || "media";
        if (target.id === "btnDownloadVideo") {
          if (media.isYtDlp && window.AndroidBridge && typeof window.AndroidBridge.ytDlpDownload === "function") {
            window.AndroidBridge.ytDlpDownload(media.rawUrl || media.id, "mp4");
            UI.showToast("Descargando MP4 con yt-dlp...");
          } else {
            Downloader.downloadFile(media.videoUrl, `${prefix}.mp4`, "video/mp4");
            UI.showToast("Descargando MP4");
          }
        } else if (target.id === "btnDownloadImage") {
          const curImg = media.images[UI.currentImageIndex];
          Downloader.downloadFile(curImg, `${prefix}_${UI.currentImageIndex + 1}.jpg`, "image/jpeg");
          UI.showToast("Descargando Imagen");
        } else if (target.id === "btnDownloadImageWithMusic") {
          const curImg = media.images[UI.currentImageIndex];
          if (!media.musicUrl) {
            UI.showToast("Sin m\xFAsica disponible");
            return;
          }
          UI.showToast("Generando video...");
          target.disabled = true;
          VideoGenerator.generateAndSave(
            curImg,
            media.musicUrl,
            `${prefix}_${UI.currentImageIndex + 1}_audio.mp4`
          ).then(() => {
            UI.showToast("Video descargado");
          }).catch((err) => {
            UI.showToast(err.message || "Error al generar video");
          }).finally(() => {
            target.disabled = false;
          });
        } else if (target.id === "btnDownloadAllImages") {
          Downloader.downloadImages(media.images, prefix);
          UI.showToast(`Descargando ${media.images.length} im\xE1genes`);
        } else if (target.id === "btnDownloadAudio") {
          if (media.isYtDlp && window.AndroidBridge && typeof window.AndroidBridge.ytDlpDownload === "function") {
            window.AndroidBridge.ytDlpDownload(media.rawUrl || media.id, "mp3");
            UI.showToast("Descargando MP3 con yt-dlp...");
          } else {
            Downloader.downloadFile(media.musicUrl, `${prefix}_audio.mp3`, "audio/mpeg");
            UI.showToast("Descargando Audio");
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
        UI.showToast(err.message || "Error al procesar enlace");
      } finally {
        UI.setLoader(false);
      }
    }
  };
  var globalMaxUpdateProgress = 0;
  window.onUpdateProgress = (progress, percent, dlMb, totalMb) => {
    const pVal = Number(progress) || 0;
    globalMaxUpdateProgress = Math.max(globalMaxUpdateProgress, Math.min(1, pVal));
    const pInt = percent != null ? Math.max(0, Math.min(100, Math.round(percent))) : Math.round(globalMaxUpdateProgress * 100);
    const modal = document.getElementById("updateModal");
    const bar = document.getElementById("updateProgressBar");
    const pText = document.getElementById("updatePercentText");
    const sText = document.getElementById("updateStatusText");
    const bText = document.getElementById("updateBytesText");
    const ringBar = document.getElementById("updateRingBar");
    const wrapper = document.getElementById("updateWrapper");
    if (wrapper) wrapper.classList.add("downloading");
    if (ringBar) {
      const circum = 106.81;
      ringBar.style.strokeDashoffset = circum * (1 - globalMaxUpdateProgress);
    }
    if (bar) bar.style.width = `${pInt}%`;
    if (pText) pText.textContent = `${pInt}%`;
    if (sText) {
      if (pInt >= 100) {
        sText.textContent = "Verificando APK e iniciando instalador...";
        sText.style.color = "#25f4ee";
      } else {
        sText.textContent = "Descargando actualizaci\xF3n...";
        sText.style.color = "var(--text-main)";
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
    const modal = document.getElementById("updateModal");
    const bar = document.getElementById("updateProgressBar");
    const pText = document.getElementById("updatePercentText");
    const sText = document.getElementById("updateStatusText");
    const ringBar = document.getElementById("updateRingBar");
    const wrapper = document.getElementById("updateWrapper");
    if (bar) bar.style.width = "100%";
    if (pText) pText.textContent = "100%";
    if (sText) {
      sText.textContent = "\xA1Descarga completa! Abriendo instalador...";
      sText.style.color = "#25f4ee";
    }
    if (ringBar) ringBar.style.strokeDashoffset = "0";
    setTimeout(() => {
      if (modal) modal.style.display = "none";
      if (wrapper) wrapper.classList.remove("downloading");
      if (ringBar) ringBar.style.strokeDashoffset = "106.81";
      globalMaxUpdateProgress = 0;
    }, 2e3);
  };
  window.onUpdateError = (err) => {
    globalMaxUpdateProgress = 0;
    const bar = document.getElementById("updateProgressBar");
    const sText = document.getElementById("updateStatusText");
    const ringBar = document.getElementById("updateRingBar");
    const wrapper = document.getElementById("updateWrapper");
    if (bar) bar.style.width = "0%";
    if (sText) {
      sText.textContent = `Error: ${err || "No se pudo descargar"}`;
      sText.style.color = "#fe2c55";
    }
    if (wrapper) wrapper.classList.remove("downloading");
    if (ringBar) ringBar.style.strokeDashoffset = "106.81";
    UI.showToast(err || "Error al actualizar app");
  };
  var lastYtToastTime = 0;
  var lastYtPercent = -1;
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
    UI.showToast(err || "Error en descarga");
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => App.init());
  } else {
    App.init();
  }
})();
