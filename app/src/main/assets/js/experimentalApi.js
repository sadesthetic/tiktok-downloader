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
    const shortcode = match ? match[1] : null;
    if (!shortcode) throw new Error('Enlace de Instagram inválido');

    const hosts = ['eeinstagram.com', 'ddinstagram.com'];
    let lastErr = null;

    for (const host of hosts) {
      try {
        let title = 'Instagram';
        let authorName = `@${shortcode}`;

        try {
          const metaRes = await fetch(`https://${host}/p/${shortcode}/`, {
            headers: { 'User-Agent': 'facebookexternalhit/1.1 (compatible; Discordbot/2.0; +https://discordapp.com)' },
            signal: AbortSignal.timeout(6000)
          });
          if (metaRes.ok) {
            const html = await metaRes.text();
            const desc = html.match(/property=["']og:description["'][^>]+content=["']([^"']+)["']/)?.[1];
            const author = html.match(/name=["']twitter:title["'][^>]+content=["']([^"']+)["']/)?.[1];
            if (desc && desc !== 'Post not found') title = desc;
            if (author) authorName = author;
          }
        } catch {}

        const mediaRes = await fetch(`https://${host}/videos/${shortcode}/1`, {
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(8000)
        });

        if (!mediaRes.ok && mediaRes.status !== 302 && mediaRes.status !== 200) {
          throw new Error('Contenido no disponible');
        }

        const finalUrl = mediaRes.url;
        const ctype = (mediaRes.headers.get('content-type') || '').toLowerCase();
        const isVideo = ctype.includes('video') || finalUrl.includes('.mp4');

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
              handle: authorName.startsWith('@') ? authorName : `@${shortcode}`,
              avatar: finalUrl
            }
          };
        }

        const images = [finalUrl];
        for (let i = 2; i <= 20; i++) {
          try {
            const nextRes = await fetch(`https://${host}/images/${shortcode}/${i}`, {
              redirect: 'follow',
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(4000)
            });
            const nUrl = nextRes.url;
            const nType = (nextRes.headers.get('content-type') || '').toLowerCase();
            if (nUrl.includes('cdninstagram.com') && (nType.includes('image') || nType.includes('jpeg') || nType.includes('webp'))) {
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
          videoUrl: '',
          musicUrl: '',
          author: {
            name: authorName,
            handle: authorName.startsWith('@') ? authorName : `@${shortcode}`,
            avatar: images[0]
          }
        };
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr || new Error('No se pudo descargar el contenido de Instagram');
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
