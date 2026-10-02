import { Downloader } from './downloader.js';

export class VideoGenerator {
  static async generateAndSave(imageUrl, musicUrl, filename, onProgress) {
    const [img, audioBuffer, audioCtx] = await Promise.all([
      this.loadImage(imageUrl),
      this.loadAudio(musicUrl)
    ]).then(async ([img, { buffer, ctx }]) => [img, buffer, ctx]);

    const canvas = document.createElement('canvas');
    let w = img.naturalWidth || 720;
    let h = img.naturalHeight || 1280;
    const maxDim = 1280;
    const scale = Math.min(maxDim / Math.max(w, h), 1);
    w = Math.floor((w * scale) / 2) * 2;
    h = Math.floor((h * scale) / 2) * 2;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(dest);

    const canvasStream = canvas.captureStream(30);
    const stream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks()
    ]);

    const mimeTypes = [
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    const mimeType = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || 'video/mp4';
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
        const elapsed = (performance.now() - startTime) / 1000;
        if (onProgress) onProgress(Math.min(elapsed / duration, 1));
        if (elapsed < duration) {
          animId = requestAnimationFrame(drawLoop);
        }
      };

      recorder.onstop = async () => {
        cancelAnimationFrame(animId);
        audioCtx.close().catch(() => {});
        const blob = new Blob(chunks, { type: mimeType });
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const finalName = filename.replace(/\.(mp4|webm)$/, `.${ext}`);
        await Downloader.saveBlob(blob, finalName, mimeType);
        resolve(finalName);
      };

      recorder.onerror = (e) => {
        cancelAnimationFrame(animId);
        audioCtx.close().catch(() => {});
        reject(e.error || new Error('Error al grabar video'));
      };

      recorder.start(100);
      source.start(0);
      drawLoop();

      setTimeout(() => {
        if (recorder.state === 'recording') {
          source.stop();
          recorder.stop();
        }
      }, duration * 1000);
    });
  }

  static loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Error al cargar imagen'));
      img.src = url;
    });
  }

  static async loadAudio(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Error al descargar audio');
    const arrayBuffer = await res.arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    return { buffer, ctx };
  }
}
