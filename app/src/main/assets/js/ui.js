import { Icons } from './icons.js';
import { Storage } from './storage.js';

export class UI {
  static currentMedia = null;
  static currentImageIndex = 0;

  static initIcons() {
    document.getElementById('brandIcon').innerHTML = Icons.brand;
    document.getElementById('btnPaste').innerHTML = Icons.clipboard;
    document.getElementById('btnSubmit').innerHTML = Icons.arrowRight;
    document.getElementById('btnCheckUpdate').innerHTML = Icons.refresh;
    document.getElementById('btnToggleHistory').innerHTML = Icons.history;
    document.getElementById('btnClearHistory').innerHTML = Icons.trash;
  }


  static showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  static setLoader(active) {
    const loader = document.getElementById('loader');
    loader.classList.toggle('active', active);
    document.getElementById('btnSubmit').disabled = active;
  }

  static renderResult(data) {
    this.currentMedia = data;
    this.currentImageIndex = 0;
    const card = document.getElementById('resultCard');

    document.getElementById('authorAvatar').src = data.author.avatar || data.cover;
    document.getElementById('authorName').textContent = data.author.name;
    document.getElementById('authorId').textContent = data.author.handle;
    document.getElementById('cardCaption').textContent = data.title;

    const viewer = document.getElementById('mediaViewer');
    const badge = document.getElementById('mediaBadge');
    const actions = document.getElementById('actionBar');

    viewer.innerHTML = '';
    actions.innerHTML = '';

    if (data.isImages) {
      badge.innerHTML = `${Icons.image} <span>1 / ${data.images.length}</span>`;

      const img = document.createElement('img');
      img.id = 'activeImage';
      img.className = 'media-image';
      img.src = data.images[0];
      viewer.appendChild(img);

      if (data.images.length > 1) {
        const btnPrev = document.createElement('button');
        btnPrev.className = 'gallery-nav prev';
        btnPrev.innerHTML = Icons.chevronLeft;
        btnPrev.onclick = () => this.navigateGallery(-1);

        const btnNext = document.createElement('button');
        btnNext.className = 'gallery-nav next';
        btnNext.innerHTML = Icons.chevronRight;
        btnNext.onclick = () => this.navigateGallery(1);

        viewer.appendChild(btnPrev);
        viewer.appendChild(btnNext);
      }

      const btnDlCurrent = document.createElement('button');
      btnDlCurrent.className = 'btn-primary';
      btnDlCurrent.id = 'btnDownloadImage';
      btnDlCurrent.innerHTML = `${Icons.download} <span>Descargar Imagen</span>`;

      const subRow = document.createElement('div');
      subRow.className = 'action-row';

      if (data.images.length > 1) {
        const btnDlAll = document.createElement('button');
        btnDlAll.className = 'btn-secondary';
        btnDlAll.id = 'btnDownloadAllImages';
        btnDlAll.innerHTML = `${Icons.download} <span>Todas (${data.images.length})</span>`;
        subRow.appendChild(btnDlAll);
      }

      if (data.musicUrl) {
        const btnMusic = document.createElement('button');
        btnMusic.className = 'btn-secondary';
        btnMusic.id = 'btnDownloadAudio';
        btnMusic.innerHTML = `${Icons.music} <span>Audio</span>`;
        subRow.appendChild(btnMusic);
      }

      actions.appendChild(btnDlCurrent);
      if (subRow.children.length > 0) actions.appendChild(subRow);

    } else {
      badge.innerHTML = `${Icons.video} <span>MP4</span>`;

      const video = document.createElement('video');
      video.className = 'media-video';
      video.src = data.videoUrl;
      video.poster = data.cover;
      video.controls = true;
      video.playsInline = true;
      viewer.appendChild(video);

      const btnDlVideo = document.createElement('button');
      btnDlVideo.className = 'btn-primary';
      btnDlVideo.id = 'btnDownloadVideo';
      btnDlVideo.innerHTML = `${Icons.download} <span>Descargar MP4</span>`;

      const subRow = document.createElement('div');
      subRow.className = 'action-row';

      if (data.musicUrl) {
        const btnMusic = document.createElement('button');
        btnMusic.className = 'btn-secondary';
        btnMusic.id = 'btnDownloadAudio';
        btnMusic.innerHTML = `${Icons.music} <span>Audio</span>`;
        subRow.appendChild(btnMusic);
      }

      actions.appendChild(btnDlVideo);
      if (subRow.children.length > 0) actions.appendChild(subRow);
    }

    card.classList.add('active');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  static navigateGallery(dir) {
    if (!this.currentMedia || !this.currentMedia.images.length) return;
    const total = this.currentMedia.images.length;
    this.currentImageIndex = (this.currentImageIndex + dir + total) % total;
    
    const img = document.getElementById('activeImage');
    if (img) img.src = this.currentMedia.images[this.currentImageIndex];

    const badge = document.getElementById('mediaBadge');
    if (badge) badge.innerHTML = `${Icons.image} <span>${this.currentImageIndex + 1} / ${total}</span>`;
  }

  static renderHistory(onSelect) {
    const list = document.getElementById('historyList');
    const items = Storage.getItems();
    list.innerHTML = '';

    if (items.length === 0) {
      document.getElementById('historyPanel').style.display = 'none';
      return;
    }

    document.getElementById('historyPanel').style.display = 'flex';

    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'history-item';

      const thumb = document.createElement('img');
      thumb.className = 'history-thumb';
      thumb.src = item.cover;

      const details = document.createElement('div');
      details.className = 'history-details';
      details.innerHTML = `
        <div class="history-caption">${item.title || 'TikTok'}</div>
        <div class="history-sub">${item.author} • ${item.isImages ? 'Foto' : 'MP4'}</div>
      `;

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn';
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
}
