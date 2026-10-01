export class TikTokApi {
  static cleanUrl(text) {
    if (!text) return null;
    const match = text.match(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?tiktok\.com\/[^\s"')<>]+/i);
    return match ? match[0].replace(/[.,;:!?]+$/, '') : null;
  }

  static async fetchMedia(url) {
    const validUrl = this.cleanUrl(url);
    if (!validUrl) {
      throw new Error('URL inválida');
    }

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
      musicUrl: fixUrl(d.music),
      author: {
        name: d.author?.nickname || 'TikTok User',
        handle: d.author?.unique_id ? `@${d.author.unique_id}` : '',
        avatar: fixUrl(d.author?.avatar)
      }
    };
  }
}
