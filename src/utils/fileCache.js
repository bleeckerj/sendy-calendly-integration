const fs = require('fs');
const path = require('path');

class FileCache {
  constructor({ filePath }) {
    this.filePath = filePath || path.join(process.cwd(), '.calendly-sendy-cache.json');
    this.data = { lists: {} }; // { lists: { [listId]: { emails: { [email]: timestampISO } } } }
    this._loaded = false;
  }

  load() {
    if (this._loaded) return;
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.data = JSON.parse(raw);
      }
    } catch (_) {
      // ignore parse errors; start fresh
      this.data = { lists: {} };
    }
    this._loaded = true;
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (_) {
      // ignore write errors quietly for now
    }
  }

  clear() {
    this.data = { lists: {} };
    this.save();
  }

  ensureList(listId) {
    this.load();
    if (!this.data.lists[listId]) this.data.lists[listId] = { emails: {} };
    return this.data.lists[listId];
  }

  hasEmail(listId, email) {
    this.load();
    const l = this.ensureList(listId);
    return !!l.emails[email.toLowerCase()];
  }

  setEmail(listId, email, when = new Date().toISOString()) {
    this.load();
    const l = this.ensureList(listId);
    l.emails[email.toLowerCase()] = when;
  }
}

module.exports = FileCache;
