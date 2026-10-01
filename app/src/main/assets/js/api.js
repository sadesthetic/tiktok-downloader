export class TikTokApi {
  static cleanUrl(text) {
    const match = text.match(/https?:\/\/(?:www\.|vm\.|vt\.|v\.)?tiktok\.com\/[^\s]+/i);
    return match ? match[0] : null;
  }

  static async fetchMedia(url) {
    const validUrl = this.cleanUrl(url);
    if (!validUrl) {
      throw new Error('URL inválida');
    }

    const formData = new FormData();
    formData.append('url', validUrl);
    formData.append('hd', '1');

    const res = await fetch('https://www.tikwm.com/api/', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      throw new Error('Error al conectar');
    }

    const json = await res.json();
    if (json.code !== 0 || !json.data) {
      throw new Error(json.msg || 'No se pudo procesar');
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
