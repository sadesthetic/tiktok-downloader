const KEY = 'tt_history_v1';

export class Storage {
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
      let items = this.getItems().filter(i => i.id !== item.id);
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
      // storage quota / restricted
    }
  }

  static deleteItem(id) {
    try {
      const items = this.getItems().filter(i => i.id !== id);
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {}
  }

  static clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {}
  }

  static isExperimental() {
    try {
      return localStorage.getItem('tt_exp_mode') === 'true';
    } catch {
      return false;
    }
  }

  static setExperimental(enabled) {
    try {
      localStorage.setItem('tt_exp_mode', enabled ? 'true' : 'false');
    } catch {}
  }
}
