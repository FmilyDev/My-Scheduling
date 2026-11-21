// Persistence: localStorage + JSON export/import.
(function () {
  'use strict';
  const L = typeof require === 'function' ? require('./logic.js') : window.Logic;

  const STORAGE_KEY = 'my-scheduling.v1';
  const APP_ID = 'my-scheduling';

  function loadState(storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return L.sanitizeState(raw ? JSON.parse(raw) : null);
    } catch (e) {
      return { courses: [] };
    }
  }

  function saveState(storage, state) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function exportJSON(state) {
    return JSON.stringify({ app: APP_ID, version: 1, courses: state.courses }, null, 2);
  }

  function parseImport(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'ไฟล์นี้ไม่ใช่ JSON' }; }
    if (!data || data.app !== APP_ID || !Array.isArray(data.courses)) {
      return { ok: false, error: 'ไฟล์นี้ไม่ใช่ข้อมูลตารางเรียนของแอปนี้' };
    }
    return { ok: true, state: L.sanitizeState(data) };
  }

  let counter = 0;
  function newId() {
    counter = (counter + 1) % 1679616;
    return Date.now().toString(36) + counter.toString(36) + Math.random().toString(36).slice(2, 6);
  }

  const api = { STORAGE_KEY, loadState, saveState, exportJSON, parseImport, newId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Store = api;
})();
