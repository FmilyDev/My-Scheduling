const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');

const sec = (id, number, day, slot, room = '') => ({ id, number, day, slot, room });
const course = (id, code, sections, selectedSectionId = null, name = '', type = '') => ({ id, code, name, type, selectedSectionId, sections });

// ---------- Task 1 ----------
test('constants', () => {
  assert.equal(L.DAYS.length, 6);
  assert.equal(L.DAYS[0].full, 'จันทร์');
  assert.equal(L.DAYS[5].full, 'เสาร์');
  assert.deepEqual(L.SLOTS, ['8:40–11:00', '12:00–14:20', '14:30–16:50', '17:00–19:20']);
});

test('normalizeCode trims, collapses spaces, uppercases', () => {
  assert.equal(L.normalizeCode(' cs 101 '), 'CS 101');
  assert.equal(L.normalizeCode(undefined), '');
});

test('validateCourse rules', () => {
  const ok = course('a', 'CS101', [sec('s1', '101A', 0, 0)]);
  assert.deepEqual(L.validateCourse(ok, [ok]), [], 'valid course (no name, no room, no type) passes; not duplicate of itself');
  assert.deepEqual(L.validateCourse({ ...ok, code: '  ' }, []), ['กรุณาใส่รหัสวิชา']);
  const other = course('b', 'CS101', [sec('x', '101A', 1, 1)]);
  assert.deepEqual(L.validateCourse({ ...ok, id: 'new', code: ' cs101' }, [other]), ['รหัสวิชา CS101 มีอยู่แล้ว']);
  assert.deepEqual(L.validateCourse({ ...ok, sections: [] }, []), ['ต้องมีอย่างน้อย 1 Section']);
  assert.deepEqual(L.validateCourse({ ...ok, sections: [sec('s1', ' ', 0, 0)] }, []), ['กรุณาใส่เลข Section']);
  assert.deepEqual(L.validateCourse({ ...ok, sections: [sec('s1', '101A', 0, 0), sec('s2', ' 101a', 1, 0)] }, []), ['Section 101A มีอยู่แล้วในวิชานี้']);
});

test('section number format: 3 digits + one letter A-F', () => {
  const FORMAT = 'เลข Section ต้องเป็นตัวเลข 3 ตัวตามด้วย A–F เช่น 101A';
  const withNum = n => course('a', 'CS101', [sec('s1', n, 0, 0)]);
  for (const bad of ['1', '101', '101G', '1011', '10A', 'A101', '101AB']) {
    assert.deepEqual(L.validateCourse(withNum(bad), []), [FORMAT], bad);
  }
  for (const good of ['101A', '001F', ' 205 c ', '999f']) {
    assert.deepEqual(L.validateCourse(withNum(good), []), [], good);
  }
  assert.equal(L.normalizeSection(' 205 c '), '205C');
});

test('suggestNextSection', () => {
  assert.equal(L.suggestNextSection([]), '');
  assert.equal(L.suggestNextSection(['101A']), '101B');
  assert.equal(L.suggestNextSection(['101A', '101C', 'junk']), '101D');
  assert.equal(L.suggestNextSection(['101F']), '102A');
  assert.equal(L.suggestNextSection(['009F', '002B']), '010A');
  assert.equal(L.suggestNextSection(['999F']), '');
});

test('section number may repeat across courses', () => {
  const a = course('a', 'CS101', [sec('s1', '101A', 0, 0)]);
  const b = course('b', 'MA102', [sec('s2', '101A', 1, 0)]);
  assert.deepEqual(L.validateCourse(b, [a, b]), []);
});

test('sanitizeState', () => {
  assert.deepEqual(L.sanitizeState(null), { courses: [] });
  assert.deepEqual(L.sanitizeState({ foo: 1 }), { courses: [] });
  const s = L.sanitizeState({ courses: [course('a', 'cs101', [sec('s1', '1', 0, 0), sec('bad', '2', 9, 0)], 'gone')] });
  assert.equal(s.courses[0].selectedSectionId, null, 'dangling selection cleared');
  assert.equal(s.courses[0].code, 'CS101');
  assert.deepEqual(s.courses[0].sections.map(x => x.id), ['s1'], 'section with day 9 dropped');
  const kept = L.sanitizeState({ courses: [course('a', 'CS101', [sec('s1', '101A', 0, 0, 'R1')], 's1', '', 'Lab')] });
  assert.equal(kept.courses[0].selectedSectionId, 's1');
  assert.equal(kept.courses[0].type, 'Lab');
  assert.equal(L.sanitizeState({ courses: [course('a', 'CS101', [], null, '', 'Bogus')] }).courses[0].type, '');
});

test('sanitizeState moves old per-section type up to the course', () => {
  const old = { courses: [{ id: 'a', code: 'CS101', name: '', selectedSectionId: null,
    sections: [{ id: 's1', number: '101A', day: 0, slot: 0, room: '', type: '' }, { id: 's2', number: '101B', day: 1, slot: 0, room: '', type: 'Lect' }] }] };
  const s = L.sanitizeState(old);
  assert.equal(s.courses[0].type, 'Lect');
  assert.ok(s.courses[0].sections.every(x => !('type' in x)), 'sections no longer carry a type');
});

test('escapeHtml', () => {
  assert.equal(L.escapeHtml('<b>&"\''), '&lt;b&gt;&amp;&quot;&#39;');
});

// ---------- Task 2 ----------
function fixture() {
  return {
    courses: [
      course('cs', 'CS101', [sec('cs1', '001A', 2, 1, 'L204'), sec('cs2', '002A', 1, 0, 'R302')], 'cs1', 'การเขียนโปรแกรมเบื้องต้น', 'Lab'),
      course('ma', 'MA102', [sec('ma1', '101A', 1, 1, 'R401'), sec('ma3', '101C', 0, 2, 'R105')], 'ma3', 'แคลคูลัส 2', 'Lect'),
      course('ph', 'PH101', [sec('ph1', '201A', 1, 2, 'R210'), sec('ph2', '201B', 2, 1, 'R210')], 'ph2', '', 'Lect'),
      course('en', 'EN201', [sec('en1', '301A', 4, 3, 'R501'), sec('en2', '301B', 5, 0, 'R501')], null),
    ],
  };
}

test('findConflicts finds Wed slot 2 clash', () => {
  const c = L.findConflicts(fixture());
  assert.equal(c.length, 1);
  assert.equal(c[0].day, 2);
  assert.equal(c[0].slot, 1);
  assert.deepEqual(c[0].entries.map(e => e.code), ['CS101', 'PH101']);
  assert.deepEqual(c[0].entries.map(e => e.type), ['Lab', 'Lect'], 'entry type comes from the course');
});

test('summary', () => {
  assert.deepEqual(L.summary(fixture()), { total: 4, selected: 3, missing: ['EN201'], conflicts: 1 });
  assert.deepEqual(L.summary({ courses: [] }), { total: 0, selected: 0, missing: [], conflicts: 0 });
});

test('sectionConflicts checks against other courses only', () => {
  const s = fixture();
  assert.equal(L.sectionConflicts(s, 'ph', 'ph1'), false);
  assert.equal(L.sectionConflicts(s, 'cs', 'cs1'), true);
});

test('swapOptions lists non-clashing alternatives', () => {
  const o = L.swapOptions(fixture(), 2, 1);
  assert.deepEqual(o.map(x => `${x.code} ${x.sectionNumber}`).sort(), ['CS101 002A', 'PH101 201A']);
});

test('buildGrid with preview marks ghost and leaving', () => {
  const g = L.buildGrid(fixture(), { courseId: 'ph', sectionId: 'ph1' });
  assert.ok(g[1][2].some(e => e.code === 'PH101' && e.ghost));
  assert.ok(g[2][1].some(e => e.code === 'PH101' && e.leaving));
  assert.ok(g[2][1].some(e => e.code === 'CS101' && !e.leaving));
  const same = L.buildGrid(fixture(), { courseId: 'ph', sectionId: 'ph2' });
  assert.ok(!same.flat(2).some(e => e.ghost || e.leaving), 'previewing the selected section changes nothing');
});

test('buildGrid on empty state is 6x4 empty', () => {
  const g = L.buildGrid({ courses: [] });
  assert.equal(g.length, 6);
  assert.ok(g.every(r => r.length === 4 && r.every(c => c.length === 0)));
});

test('selectedEntries carries colorIndex by course order', () => {
  const e = L.selectedEntries(fixture());
  assert.deepEqual(e.map(x => [x.code, x.colorIndex]), [['CS101', 0], ['MA102', 1], ['PH101', 2]]);
});
