const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/store.js');

function memStorage(init) {
  const m = new Map(init ? [[S.STORAGE_KEY, init]] : []);
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };

const sample = {
  courses: [{
    id: 'a', code: 'CS101', name: 'โปรแกรม', selectedSectionId: 's1',
    sections: [{ id: 's1', number: '1', day: 0, slot: 0, room: 'R301', type: 'Lect' }],
  }],
};

test('loadState falls back to empty', () => {
  assert.deepEqual(S.loadState(memStorage()), { courses: [] });
  assert.deepEqual(S.loadState(memStorage('{bad')), { courses: [] });
  assert.deepEqual(S.loadState(throwing), { courses: [] });
});

test('save then load round-trips', () => {
  const st = memStorage();
  assert.equal(S.saveState(st, sample), true);
  assert.deepEqual(S.loadState(st), sample);
  assert.equal(S.saveState(throwing, sample), false);
});

test('export/import round-trips', () => {
  const r = S.parseImport(S.exportJSON(sample));
  assert.equal(r.ok, true);
  assert.deepEqual(r.state, sample);
  assert.equal(JSON.parse(S.exportJSON(sample)).app, 'my-scheduling');
});

test('parseImport rejects bad input', () => {
  assert.deepEqual(S.parseImport('{bad'), { ok: false, error: 'ไฟล์นี้ไม่ใช่ JSON' });
  assert.deepEqual(S.parseImport('{"foo":1}'), { ok: false, error: 'ไฟล์นี้ไม่ใช่ข้อมูลตารางเรียนของแอปนี้' });
  assert.deepEqual(S.parseImport('{"app":"my-scheduling","courses":5}'), { ok: false, error: 'ไฟล์นี้ไม่ใช่ข้อมูลตารางเรียนของแอปนี้' });
});

test('newId is unique', () => {
  const ids = new Set(Array.from({ length: 1000 }, () => S.newId()));
  assert.equal(ids.size, 1000);
});
