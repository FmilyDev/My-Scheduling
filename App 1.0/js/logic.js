// Pure logic: constants, validation, timetable grid, conflicts. No DOM access.
(function () {
  'use strict';

  const DAYS = [
    { short: 'จ.', full: 'จันทร์', color: '#EAB308' },
    { short: 'อ.', full: 'อังคาร', color: '#EC4899' },
    { short: 'พ.', full: 'พุธ', color: '#22C55E' },
    { short: 'พฤ.', full: 'พฤหัสบดี', color: '#F97316' },
    { short: 'ศ.', full: 'ศุกร์', color: '#3B82F6' },
    { short: 'ส.', full: 'เสาร์', color: '#A855F7' },
  ];
  const SLOTS = ['8:40–11:00', '12:00–14:20', '14:30–16:50', '17:00–19:20'];
  const COURSE_COLORS = [
    { c: '#1D4ED8', bg: '#DBEAFE' },
    { c: '#047857', bg: '#D1FAE5' },
    { c: '#6D28D9', bg: '#EDE9FE' },
    { c: '#C2410C', bg: '#FFEDD5' },
    { c: '#0E7490', bg: '#CFFAFE' },
    { c: '#BE185D', bg: '#FCE7F3' },
  ];
  const TYPES = ['', 'Lect', 'Lab'];

  function normalizeCode(code) {
    return String(code ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  }

  function validateCourse(course, allCourses) {
    const errors = [];
    const code = normalizeCode(course.code);
    if (!code) errors.push('กรุณาใส่รหัสวิชา');
    else if ((allCourses || []).some(c => c.id !== course.id && normalizeCode(c.code) === code)) {
      errors.push(`รหัสวิชา ${code} มีอยู่แล้ว`);
    }
    const sections = course.sections || [];
    if (!sections.length) errors.push('ต้องมีอย่างน้อย 1 Section');
    const seen = new Set();
    for (const s of sections) {
      const n = normalizeSection(s.number);
      if (!n) { errors.push('กรุณาใส่เลข Section'); continue; }
      if (!SECTION_RE.test(n)) { errors.push('เลข Section ต้องเป็นตัวเลข 3 ตัวตามด้วย A–F เช่น 101A'); continue; }
      if (seen.has(n)) errors.push(`Section ${n} มีอยู่แล้วในวิชานี้`);
      seen.add(n);
    }
    return [...new Set(errors)];
  }

  // Section number: 3 digits + one letter A–F, e.g. 101A
  const SECTION_RE = /^\d{3}[A-F]$/;
  function normalizeSection(n) {
    return String(n ?? '').replace(/\s+/g, '').toUpperCase();
  }

  function suggestNextSection(numbers) {
    const valid = numbers.map(normalizeSection).filter(n => SECTION_RE.test(n)).sort();
    if (!valid.length) return '';
    const last = valid[valid.length - 1];
    const num = Number(last.slice(0, 3));
    const letter = last[3];
    if (letter < 'F') return last.slice(0, 3) + String.fromCharCode(letter.charCodeAt(0) + 1);
    return num < 999 ? String(num + 1).padStart(3, '0') + 'A' : '';
  }

  const isIndex = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;

  function sanitizeState(raw) {
    const out = { courses: [] };
    if (!raw || !Array.isArray(raw.courses)) return out;
    for (const c of raw.courses) {
      if (!c || typeof c !== 'object' || c.id == null) continue;
      const code = normalizeCode(c.code);
      if (!code) continue;
      const rawSections = (Array.isArray(c.sections) ? c.sections : [])
        .filter(s => s && s.id != null && isIndex(s.day, 5) && isIndex(s.slot, 3));
      const sections = rawSections.map(s => ({
        id: String(s.id),
        number: normalizeSection(s.number),
        day: s.day,
        slot: s.slot,
        room: typeof s.room === 'string' ? s.room.trim() : '',
      }));
      // type belongs to the course; older data stored it per section
      const legacyType = (rawSections.find(s => s.type && TYPES.includes(s.type)) || {}).type || '';
      const type = TYPES.includes(c.type) && c.type ? c.type : legacyType;
      const sel = sections.some(s => s.id === String(c.selectedSectionId)) ? String(c.selectedSectionId) : null;
      out.courses.push({
        id: String(c.id),
        code,
        name: typeof c.name === 'string' ? c.name.trim() : '',
        type,
        selectedSectionId: sel,
        sections,
      });
    }
    return out;
  }

  function entryOf(course, colorIndex, s) {
    return {
      courseId: course.id, code: course.code, colorIndex,
      sectionId: s.id, sectionNumber: s.number,
      day: s.day, slot: s.slot, room: s.room, type: course.type || '',
    };
  }

  function selectedEntries(state) {
    const out = [];
    state.courses.forEach((c, ci) => {
      const s = c.sections.find(x => x.id === c.selectedSectionId);
      if (s) out.push(entryOf(c, ci, s));
    });
    return out;
  }

  function buildGrid(state, preview) {
    const grid = DAYS.map(() => SLOTS.map(() => []));
    let leavingCourse = null;
    let ghost = null;
    if (preview) {
      const ci = state.courses.findIndex(c => c.id === preview.courseId);
      const c = state.courses[ci];
      const s = c && c.sections.find(x => x.id === preview.sectionId);
      if (s && s.id !== c.selectedSectionId) {
        leavingCourse = c.id;
        ghost = { ...entryOf(c, ci, s), ghost: true };
      }
    }
    for (const e of selectedEntries(state)) {
      if (e.courseId === leavingCourse) e.leaving = true;
      grid[e.day][e.slot].push(e);
    }
    if (ghost) grid[ghost.day][ghost.slot].push(ghost);
    return grid;
  }

  function findConflicts(state) {
    const out = [];
    buildGrid(state).forEach((row, day) => row.forEach((entries, slot) => {
      if (entries.length > 1) out.push({ day, slot, entries });
    }));
    return out;
  }

  function sectionConflicts(state, courseId, sectionId) {
    const c = state.courses.find(x => x.id === courseId);
    const s = c && c.sections.find(x => x.id === sectionId);
    if (!s) return false;
    return selectedEntries(state).some(e => e.courseId !== courseId && e.day === s.day && e.slot === s.slot);
  }

  function swapOptions(state, day, slot) {
    const out = [];
    for (const e of buildGrid(state)[day][slot]) {
      const c = state.courses.find(x => x.id === e.courseId);
      for (const s of c.sections) {
        if (s.id === c.selectedSectionId || sectionConflicts(state, c.id, s.id)) continue;
        out.push({
          courseId: c.id, code: c.code, sectionId: s.id, sectionNumber: s.number,
          day: s.day, slot: s.slot, room: s.room, type: c.type || '',
        });
      }
    }
    return out;
  }

  function summary(state) {
    const isSel = c => c.sections.some(s => s.id === c.selectedSectionId);
    return {
      total: state.courses.length,
      selected: state.courses.filter(isSel).length,
      missing: state.courses.filter(c => !isSel(c)).map(c => c.code),
      conflicts: findConflicts(state).length,
    };
  }

  const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => HTML_ESC[ch]);
  }

  const api = {
    DAYS, SLOTS, COURSE_COLORS, TYPES,
    normalizeCode, normalizeSection, suggestNextSection, SECTION_RE, validateCourse, sanitizeState, escapeHtml,
    selectedEntries, buildGrid, findConflicts, sectionConflicts, swapOptions, summary,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Logic = api;
})();
