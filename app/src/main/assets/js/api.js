import { ExperimentalApi } from './experimentalApi.js';
import { Storage } from './storage.js';

export class TikTokApi {
  static cleanUrl(text) {
    if (!text) return null;
    const match = text.match(/https?:\/\/[^\s"')<>]+/i);
    return match ? match[0].replace(/[.,;:!?]+$/, '') : null;
  }

  static isTikTok(url) {
    return /https?:\/\/(?:[a-zA-Z0-9-]+\.)?tiktok\.com\//i.test(url);
  }

  static async fetchMedia(rawText) {
    const validUrl = this.cleanUrl(rawText);
    if (!validUrl) throw new Error('URL inválida');

    if (this.isTikTok(validUrl)) {
      try {
        return await this.fetchTikTok(validUrl);
      } catch {}
    }

    if (window.AndroidBridge && typeof window.AndroidBridge.ytDlpGetInfo === 'function') {
      try {
        const jsonStr = window.AndroidBridge.ytDlpGetInfo(validUrl);
        const info = JSON.parse(jsonStr);
        if (info && !info.error) {
          return {
            id: info.id || Date.now().toString(),
            title: info.title || 'Video',
            cover: info.cover || '',
            isImages: false,
            images: [],
            videoUrl: info.url || '',
            musicUrl: '',
            isYtDlp: true,
            rawUrl: validUrl,
            author: {
              name: info.uploader || 'yt-dlp',
              handle: '',
              avatar: info.cover || ''
            }
          };
        }
      } catch {}
    }

    if (ExperimentalApi.isYouTube(validUrl) || ExperimentalApi.isInstagram(validUrl)) {
      return ExperimentalApi.fetchMedia(validUrl);
    }

    throw new Error('No se pudo procesar el enlace');
  }

  static async fetchTikTok(validUrl) {
    let json = null;
    try {
      const formData = new FormData();
      formData.append('url', validUrl);
      formData.append('hd', '1');

      const res = await fetch('https://www.tikwm.com/api/', {
        method: 'POST',
        body: formData
      });
      if (res.ok) json = await res.json();
    } catch {}

    if (!json || json.code !== 0 || !json.data) {
      const resGet = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(validUrl)}&hd=1`);
      if (resGet.ok) json = await resGet.json();
    }

    if (!json || json.code !== 0 || !json.data) {
      throw new Error(json?.msg || 'No se pudo procesar');
    }

    const d = json.data;
    const isImages = Array.isArray(d.images) && d.images.length > 0;

    const fixUrl = (u) => {
      if (!u) return '';
      return u.startsWith('http') ? u : `https://www.tikwm.com${u}`;
    };

    return {
      id: d.id,
      title: d.title || '',
      cover: fixUrl(d.cover || d.origin_cover),
      isImages,
      images: isImages ? d.images.map(fixUrl) : [],
      videoUrl: fixUrl(d.hdplay || d.play),
      musicUrl: fixUrl(d.music_info?.play || d.music),
      author: {
        name: d.author?.nickname || 'TikTok User',
        handle: d.author?.unique_id ? `@${d.author.unique_id}` : '',
        avatar: fixUrl(d.author?.avatar)
      }
    };
  }
}
