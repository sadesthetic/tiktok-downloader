export class ExperimentalApi {
  static isYouTube(url) {
    return /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]+)/i.test(url);
  }

  static isInstagram(url) {
    return /(?:instagram\.com\/(?:p|reel|tv)\/)([\w-]+)/i.test(url);
  }

  static async fetchMedia(url) {
    if (this.isYouTube(url)) return this.fetchYouTube(url);
    if (this.isInstagram(url)) return this.fetchInstagram(url);
    throw new Error('URL no soportada');
  }

  static async fetchYouTube(url) {
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]+)/i);
    const videoId = match ? match[1] : Date.now().toString();

    let title = 'YouTube Video';
    let authorName = 'YouTube';
    let cover = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    try {
      const infoRes = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
      if (infoRes.ok) {
        const info = await infoRes.json();
        if (info.title) title = info.title;
        if (info.author_name) authorName = info.author_name;
        if (info.thumbnail_url) cover = info.thumbnail_url;
      }
    } catch {}

    const directUrl = await this.resolveStream(url, '1080');

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
        handle: '',
        avatar: cover
      }
    };
  }

  static async fetchInstagram(url) {
    const match = url.match(/(?:instagram\.com\/(?:p|reel|tv)\/)([\w-]+)/i);
    const shortcode = match ? match[1] : Date.now().toString();
    const cover = `https://instagram.com/p/${shortcode}/media/?size=l`;

    const directUrl = await this.resolveStream(url, '1080');

    return {
      id: shortcode,
      title: 'Instagram Video',
      cover,
      isImages: false,
      images: [],
      videoUrl: directUrl || cover,
      musicUrl: directUrl || cover,
      author: {
        name: 'Instagram',
        handle: `@${shortcode}`,
        avatar: cover
      }
    };
  }

  static async resolveStream(targetUrl, format = '1080') {
    try {
      const res = await fetch(`https://p.savenow.to/ajax/download.php?format=${format}&url=${encodeURIComponent(targetUrl)}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.id) return null;

      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 1200));
        try {
          const progRes = await fetch(`https://p.savenow.to/ajax/progress.php?id=${data.id}`);
          if (progRes.ok) {
            const prog = await progRes.json();
            if (prog.download_url) return prog.download_url;
          }
        } catch {}
      }
    } catch {}
    return null;
  }
}
