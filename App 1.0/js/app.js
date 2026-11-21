// UI: rendering + events. Depends on window.Logic and window.Store.
(function () {
  'use strict';
  const L = window.Logic;
  const St = window.Store;
  const esc = L.escapeHtml;

  const $ = sel => document.querySelector(sel);
  const els = {
    status: $('#status'),
    col: $('#course-col'),
    tt: $('#timetable'),
    pop: $('#popover-root'),
    dlg: $('#course-dialog'),
    file: $('#file-input'),
    tabList: $('#tab-list'),
  };

  // ---------- storage ----------
  function safeStorage() {
    try { const s = window.localStorage; s.getItem('x'); return s; } catch (e) {
      return { getItem() { return null; }, setItem() { throw new Error('storage unavailable'); } };
    }
  }
  const storage = safeStorage();
  let state = St.loadState(storage);
  let saveOk = true;
  const ui = { preview: null, popover: null, openCourses: new Set(), tab: 'grid' };

  function commit(next) {
    state = L.sanitizeState(next);
    saveOk = St.saveState(storage, state);
    render();
  }
  const clone = obj => JSON.parse(JSON.stringify(obj));

  // ---------- icons ----------
  const PATHS = {
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    chevUp: '<path d="m18 15-6-6-6 6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  };
  const icon = (name, size = 16) =>
    `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;

  // ---------- helpers ----------
  const colorOf = i => L.COURSE_COLORS[i % L.COURSE_COLORS.length];
  const colorVars = i => `--c:${colorOf(i).c};--cbg:${colorOf(i).bg}`;
  const findCourse = id => state.courses.find(c => c.id === id);
  const isSelected = c => c.sections.some(s => s.id === c.selectedSectionId);
  const timeText = s => `${L.DAYS[s.day].short} ${L.SLOTS[s.slot]}`;
  const sectionText = s => [timeText(s), s.room].filter(Boolean).join(' · ');
  const typeTag = t => t ? `<span class="type-tag">${t}</span>` : '';
  const samePreview = (a, b) => (!a && !b) || (a && b && a.courseId === b.courseId && a.sectionId === b.sectionId);

  // ---------- render ----------
  function render() {
    renderStatus();
    renderCourses();
    renderGrid();
    renderPopover();
    document.body.className = 'tab-' + ui.tab;
    els.tabList.textContent = `รายวิชา (${state.courses.length})`;
  }

  function renderStatus() {
    const sm = L.summary(state);
    const conf = L.findConflicts(state);
    let h = '';
    if (sm.total) {
      h += `<span class="chip chip-primary">${icon('check', 14)}<span>เลือกแล้ว ${sm.selected}/${sm.total}<span class="long"> วิชา</span></span></span>`;
      if (conf.length) {
        const c = conf[0];
        h += `<button type="button" class="chip chip-red" data-action="open-conflict" data-day="${c.day}" data-slot="${c.slot}">${icon('alert', 14)}<span>เวลาชน ${conf.length} จุด<span class="long"> · ${L.DAYS[c.day].full} ${L.SLOTS[c.slot]}</span> · ดูวิธีแก้</span>${icon('arrow', 14)}</button>`;
      }
      if (sm.missing.length) {
        h += `<span class="chip chip-amber">${icon('alert', 14)}<span><span class="long">ยังไม่เลือก Section: </span><span class="short">ขาด </span>${esc(sm.missing.join(', '))}</span></span>`;
      }
    }
    if (!saveOk) h += `<span class="chip chip-red">${icon('alert', 14)}บันทึกในเบราว์เซอร์ไม่ได้ — กดส่งออก (Export) เพื่อเก็บข้อมูล</span>`;
    els.status.innerHTML = h;
  }

  function renderCourses() {
    const n = state.courses.length;
    let h = `<h2 class="col-title">รายวิชา (${n})</h2>`;
    if (!n) {
      els.col.innerHTML = h + `<div class="empty card">
        <p class="empty-title">ยังไม่มีวิชา</p>
        <p>กด <b>+ เพิ่มวิชา</b> แล้วใส่ทุก Section ที่เปิดสอน จากนั้นเลือกวิชาละ 1 Section ตารางจะเตือนถ้าเวลาชนกัน</p>
        <button type="button" class="btn btn-primary" data-action="add">+ เพิ่มวิชาแรก</button></div>`;
      return;
    }
    const clash = new Set(L.findConflicts(state).map(c => c.day + '|' + c.slot));
    state.courses.forEach((c, ci) => {
      const sel = isSelected(c);
      const open = !sel || ui.openCourses.has(c.id);
      const shown = open ? c.sections : c.sections.filter(s => s.id === c.selectedSectionId);
      const others = c.sections.length - 1;
      h += `<article class="course card" style="${colorVars(ci)}" data-course="${esc(c.id)}">
        <div class="course-head">
          <span class="dot"></span>
          <div class="course-titles">
            <h3>${esc(c.code)}${typeTag(c.type)}</h3>
            ${c.name ? `<p class="muted">${esc(c.name)}</p>`
              : `<p class="muted">ยังไม่ได้ใส่ชื่อวิชา<button type="button" class="link" data-action="edit">+ เพิ่มชื่อ</button></p>`}
          </div>
          ${sel ? '' : '<span class="chip chip-amber">ยังไม่เลือก</span>'}
          <button type="button" class="icon-btn" data-action="edit" aria-label="แก้ไขวิชา ${esc(c.code)}">${icon('edit')}</button>
          <button type="button" class="icon-btn" data-action="delete" aria-label="ลบวิชา ${esc(c.code)}">${icon('trash')}</button>
        </div>
        <div class="sections" role="radiogroup" aria-label="เลือก Section ของ ${esc(c.code)}">
          ${shown.map(s => sectionRow(c, s, clash)).join('')}
        </div>
        ${sel && others > 0 ? `<button type="button" class="link" data-action="toggle" aria-expanded="${open}">${open
          ? 'ซ่อน Section อื่น' + icon('chevUp', 14) : `ดู Section อื่น (${others})` + icon('chev', 14)}</button>` : ''}
      </article>`;
    });
    els.col.innerHTML = h;
  }

  function sectionRow(c, s, clash) {
    const sel = s.id === c.selectedSectionId;
    const prev = !sel && ui.preview && samePreview(ui.preview, { courseId: c.id, sectionId: s.id });
    const bad = !sel && L.sectionConflicts(state, c.id, s.id);
    return `<label class="sec-row${sel ? ' is-selected' : ''}${prev ? ' is-preview' : ''}" data-section="${esc(s.id)}">
      <input type="radio" name="sec-${esc(c.id)}" value="${esc(s.id)}"${sel ? ' checked' : ''}>
      <span class="sec-info">
        <span class="sec-head"><span class="sec-name">Section ${esc(s.number)}</span>
          ${sel ? '' : `<span class="preview-hint${bad ? ' bad' : ''}">${icon('eye', 14)}ดูตัวอย่างในตาราง · ${bad ? 'ชน' : 'ไม่ชน'}</span>`}</span>
        <span class="sec-meta">${icon('clock', 14)}${esc(sectionText(s))}${sel && clash.has(s.day + '|' + s.slot) ? '<span class="chip chip-red chip-sm">ชนเวลา</span>' : ''}</span>
      </span>
    </label>`;
  }

  function renderGrid() {
    const grid = L.buildGrid(state, ui.preview);
    let legend = '';
    state.courses.forEach((c, ci) => {
      legend += isSelected(c)
        ? `<span class="legend" style="${colorVars(ci)}"><i></i>${esc(c.code)}</span>`
        : `<span class="legend" style="--c:#D0D5DD"><i></i>${esc(c.code)} (ยังไม่เลือก)</span>`;
    });
    if (state.courses.length) legend += `<span class="legend"><i class="dash"></i>ตัวอย่าง</span><span class="legend" style="--c:var(--red)"><i></i>ชนเวลา</span>`;

    let g = '<div class="g-corner"></div>';
    L.SLOTS.forEach((s, i) => {
      const [a, b] = s.split('–');
      g += `<div class="g-head"><span>คาบ ${i + 1}</span><b>${a}<span class="day-full">–</span><br class="day-short">${b}</b></div>`;
    });
    L.DAYS.forEach((d, day) => {
      g += `<div class="g-day"><span class="dot" style="--d:${d.color}"></span><span class="day-full">${d.full}</span><span class="day-short">${d.short}</span></div>`;
      L.SLOTS.forEach((_, slot) => {
        const entries = grid[day][slot];
        const real = entries.filter(e => !e.ghost);
        const stay = real.filter(e => !e.leaving);
        if (real.length > 1) {
          g += `<button type="button" class="g-cell is-conflict" data-action="open-conflict" data-day="${day}" data-slot="${slot}" data-cell="${day}-${slot}" aria-label="เวลาชน ${d.full} ${L.SLOTS[slot]} กดเพื่อดูวิธีแก้">
            <span class="conf-head">${icon('alert', 14)}<span>ชน ${real.length}<span class="long"> วิชา</span></span></span>
            ${entries.map(e => e.ghost ? ghostBlock(e, stay) : compactBlock(e)).join('')}</button>`;
        } else {
          g += `<div class="g-cell" data-cell="${day}-${slot}">${entries.map(e => e.ghost ? ghostBlock(e, stay) : fullBlock(e)).join('')}</div>`;
        }
      });
    });

    els.tt.innerHTML = `<div class="tt-head"><h2>ตารางเรียน</h2>${legend}</div>
      <div class="grid" role="grid" aria-label="ตารางเรียน จันทร์ถึงเสาร์ 4 คาบ">${g}</div>
      <p class="tt-foot">${ui.preview
        ? 'ช่องเส้นประ = Section ที่กำลังดูตัวอย่าง · บล็อกจาง/ขีดฆ่า = จะถูกเอาออกถ้าเลือก'
        : state.courses.length ? 'แสดงเฉพาะ Section ที่เลือกไว้ · ชี้ที่ Section ในรายการเพื่อดูตัวอย่าง' : 'ตารางจะแสดงวิชาที่คุณเลือก Section แล้ว'}</p>`;
  }

  function fullBlock(e) {
    return `<div class="block${e.leaving ? ' is-leaving' : ''}" style="${colorVars(e.colorIndex)}">
      <b>${esc(e.code)}</b><span class="b-meta">Sec ${esc(e.sectionNumber)}${e.type ? ' · ' + e.type : ''}</span>
      ${e.room ? `<span class="b-room">${esc(e.room)}</span>` : ''}</div>`;
  }
  function compactBlock(e) {
    return `<div class="block compact${e.leaving ? ' is-leaving' : ''}" style="${colorVars(e.colorIndex)}"><b>${esc(e.code)}<span class="cb-rest">${esc([e.type, e.room].filter(Boolean).map(x => ' · ' + x).join(''))}</span></b></div>`;
  }
  function ghostBlock(e, stay) {
    const bad = stay.some(x => x.courseId !== e.courseId);
    return `<div class="block is-ghost" style="${colorVars(e.colorIndex)}">
      <b>${esc(e.code)} · Sec ${esc(e.sectionNumber)}</b>
      ${e.room || e.type ? `<span class="b-room b-ghost-room">${esc([e.room, e.type].filter(Boolean).join(' · '))}</span>` : ''}
      ${bad ? `<span class="bad">${icon('alert', 13)}ชน</span>` : `<span class="ok">${icon('check', 13)}ไม่ชน</span>`}</div>`;
  }

  // ---------- conflict popover ----------
  function renderPopover() {
    if (!ui.popover) { els.pop.innerHTML = ''; return; }
    const { day, slot } = ui.popover;
    const entries = L.buildGrid(state)[day][slot];
    if (entries.length < 2) { ui.popover = null; els.pop.innerHTML = ''; return; }
    const opts = L.swapOptions(state, day, slot);
    const who = entries.map(e => e.code + (e.type ? ` (${e.type})` : '')).join(' กับ ');
    const idx = id => state.courses.findIndex(c => c.id === id);
    els.pop.innerHTML = `<div class="pop-backdrop" data-action="close-pop"></div>
      <div class="popover" role="dialog" aria-labelledby="pop-title">
        <span class="grabber"></span>
        <div class="pop-head">${icon('alert', 18)}<h3 id="pop-title">เวลาชน · ${L.DAYS[day].full} ${L.SLOTS[slot]}</h3>
          <button type="button" class="icon-btn" data-action="close-pop" aria-label="ปิด">${icon('x', 18)}</button></div>
        <p class="muted">${esc(who)} เรียนเวลาเดียวกัน${opts.length ? ' สลับเป็น Section ที่ไม่ชนได้:' : ''}</p>
        ${opts.map(o => `<div class="opt" style="${colorVars(idx(o.courseId))}" data-course="${esc(o.courseId)}" data-section="${esc(o.sectionId)}">
          <div class="opt-info">
            <div class="opt-title"><span class="code">${esc(o.code)}</span>${icon('arrow', 14)}<span>Section ${esc(o.sectionNumber)}</span></div>
            <span class="muted small">${esc(sectionText(o))}</span>
            <span class="ok">${icon('check', 13)}ไม่ชนกับวิชาอื่น</span>
          </div>
          <button type="button" class="btn btn-primary btn-sm" data-action="swap">สลับ</button></div>`).join('')}
        <p class="muted small">${opts.length ? 'ชี้ที่ตัวเลือกเพื่อดูตัวอย่างในตาราง' : 'ไม่มี Section อื่นที่ไม่ชน — ลองเพิ่ม Section หรือยอมรับการชนนี้ได้'}</p>
      </div>`;
    positionPopover();
  }

  function positionPopover() {
    const pop = els.pop.querySelector('.popover');
    const cell = document.querySelector(`[data-cell="${ui.popover.day}-${ui.popover.slot}"]`);
    if (!pop || !cell || window.matchMedia('(max-width: 768px)').matches) return;
    const r = cell.getBoundingClientRect();
    const w = pop.offsetWidth;
    let left = r.right + 10;
    if (left + w > window.innerWidth - 16) left = Math.max(16, r.left - w - 10);
    const top = Math.max(16, Math.min(r.top - 20, window.innerHeight - pop.offsetHeight - 16));
    pop.style.left = left + window.scrollX + 'px';
    pop.style.top = top + window.scrollY + 'px';
  }

  function openConflict(day, slot) {
    ui.tab = 'grid';
    ui.popover = { day, slot };
    render();
    const first = els.pop.querySelector('[data-action="swap"]') || els.pop.querySelector('[data-action="close-pop"].icon-btn');
    if (first) first.focus();
  }
  function closePopover() {
    if (!ui.popover) return;
    ui.popover = null;
    setPreview(null);
    els.pop.innerHTML = '';
  }

  // ---------- preview ----------
  function setPreview(p) {
    if (samePreview(ui.preview, p)) return;
    ui.preview = p;
    renderGrid();
    document.querySelectorAll('.course').forEach(card => {
      card.querySelectorAll('.sec-row').forEach(row => {
        const on = p && card.dataset.course === p.courseId && row.dataset.section === p.sectionId && !row.classList.contains('is-selected');
        row.classList.toggle('is-preview', !!on);
      });
    });
  }
  function previewFromRow(row) {
    if (!row || row.classList.contains('is-selected')) return null;
    return { courseId: row.closest('.course').dataset.course, sectionId: row.dataset.section };
  }

  // ---------- course dialog ----------
  let draft = null;
  let draftErrors = [];

  function newSection(number) {
    return { id: St.newId(), number: String(number), day: 0, slot: 0, room: '' };
  }
  function nextSectionNumber() {
    return L.suggestNextSection(draft.sections.map(s => s.number));
  }

  function openCourseDialog(courseId) {
    const c = courseId && findCourse(courseId);
    draft = c ? { ...clone(c), isNew: false } : { id: St.newId(), code: '', name: '', type: '', selectedSectionId: null, sections: [newSection('')], isNew: true };
    draftErrors = [];
    renderDialog();
    els.dlg.showModal();
    const focusField = c && !c.name ? '[name="name"]' : '[name="code"]';
    els.dlg.querySelector(focusField).focus();
  }

  function renderDialog() {
    const opts = (list, val, label) => list.map((x, i) => `<option value="${i}"${i === val ? ' selected' : ''}>${label(x)}</option>`).join('');
    els.dlg.innerHTML = `<form id="course-form" novalidate>
      <div class="dlg-head"><div><h2 id="dlg-title">${draft.isNew ? 'เพิ่มวิชา' : 'แก้ไขวิชา'}</h2>
        <p class="muted">แต่ละ Section มี 1 คาบ · เลข Section เช่น 101A (ตัวเลข 3 ตัว + A–F) ห้ามซ้ำในวิชานี้ แต่ซ้ำกับวิชาอื่นได้</p></div>
        <button type="button" class="icon-btn" data-action="cancel" aria-label="ปิด">${icon('x', 20)}</button></div>
      <div class="dlg-body">
        ${draftErrors.length ? `<div class="errors" role="alert">${icon('alert', 16)}<ul>${draftErrors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
        <div class="row2">
          <label class="field"><span class="lbl">รหัสวิชา <b class="req">*</b></span>
            <input name="code" value="${esc(draft.code)}" autocomplete="off" required><span class="help">ห้ามซ้ำกับวิชาอื่น</span></label>
          <label class="field"><span class="lbl">ชื่อวิชา <span class="muted">(ไม่บังคับ ใส่ทีหลังได้)</span></span>
            <input name="name" value="${esc(draft.name)}" autocomplete="off"></label>
        </div>
        <div class="field"><span class="lbl" id="ctype-lbl">ประเภทวิชา <span class="muted">(ไม่บังคับ · ใช้กับทุก Section)</span></span>
          <div class="seg" role="radiogroup" aria-labelledby="ctype-lbl">
            ${[['', 'ไม่ระบุ'], ['Lect', 'Lect'], ['Lab', 'Lab']].map(([v, t]) =>
              `<label><input type="radio" name="ctype" value="${v}"${(draft.type || '') === v ? ' checked' : ''}><span>${t}</span></label>`).join('')}
          </div></div>
        ${draft.sections.map(s => `<fieldset class="sec-card" data-sid="${esc(s.id)}">
          <legend class="sr-only">Section ${esc(s.number)}</legend>
          <div class="sec-card-head">
            <label class="inline">Section <input class="in-num" data-field="number" value="${esc(s.number)}" placeholder="101A" maxlength="6" autocomplete="off" spellcheck="false" aria-label="เลข Section (ตัวเลข 3 ตัว + A–F เช่น 101A)"></label>
            <span class="sp"></span>
            ${draft.sections.length > 1 ? '<button type="button" class="link danger" data-action="remove-section">ลบ Section</button>' : ''}
          </div>
          <div class="sec-fields">
            <label class="field"><span class="lbl">วัน</span><select data-field="day">${opts(L.DAYS, s.day, d => d.full)}</select></label>
            <label class="field"><span class="lbl">ช่วงเวลา</span><select data-field="slot">${opts(L.SLOTS, s.slot, x => x)}</select></label>
            <label class="field f-room"><span class="lbl">ห้อง <span class="muted">(ไม่บังคับ)</span></span>
              <input data-field="room" value="${esc(s.room)}" placeholder="เช่น R301" autocomplete="off"></label>
          </div></fieldset>`).join('')}
        <button type="button" class="add-section" data-action="add-section">+ เพิ่ม Section</button>
      </div>
      <div class="dlg-foot">
        ${draft.isNew ? '' : '<button type="button" class="link danger" data-action="delete-course">ลบวิชานี้</button>'}
        <span class="sp"></span>
        <button type="button" class="btn" data-action="cancel">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึก</button>
      </div></form>`;
  }

  function syncDraftField(t) {
    if (!draft) return;
    if (t.name === 'code') { draft.code = t.value; return; }
    if (t.name === 'name') { draft.name = t.value; return; }
    if (t.name === 'ctype') { draft.type = t.value; return; }
    const card = t.closest('[data-sid]');
    const s = card && draft.sections.find(x => x.id === card.dataset.sid);
    if (!s || !t.dataset.field) return;
    const f = t.dataset.field;
    s[f] = f === 'day' || f === 'slot' ? Number(t.value) : t.value;
  }

  function saveDraft() {
    const course = {
      id: draft.id,
      code: L.normalizeCode(draft.code),
      name: draft.name.trim(),
      type: draft.type || '',
      selectedSectionId: draft.selectedSectionId,
      sections: draft.sections.map(s => ({ ...s, number: L.normalizeSection(s.number), room: s.room.trim() })),
    };
    draftErrors = L.validateCourse(course, state.courses);
    if (draftErrors.length) {
      renderDialog();
      els.dlg.querySelector('.dlg-body').scrollTop = 0;
      return;
    }
    if (!course.sections.some(s => s.id === course.selectedSectionId) && course.sections.length === 1) {
      course.selectedSectionId = course.sections[0].id;
    }
    const next = clone(state);
    const i = next.courses.findIndex(c => c.id === course.id);
    if (i >= 0) next.courses[i] = course; else next.courses.push(course);
    closeDialog();
    commit(next);
  }

  function closeDialog() {
    draft = null;
    if (els.dlg.open) els.dlg.close();
  }

  function deleteCourse(id) {
    const c = findCourse(id);
    if (!c || !confirm(`ลบวิชา ${c.code} ใช่ไหม?`)) return false;
    ui.openCourses.delete(id);
    if (ui.preview && ui.preview.courseId === id) ui.preview = null;
    commit({ courses: state.courses.filter(x => x.id !== id) });
    return true;
  }

  // ---------- export / import ----------
  function exportFile() {
    const blob = new Blob([St.exportJSON(state)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    a.href = URL.createObjectURL(blob);
    a.download = `ตารางเรียน-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  els.file.addEventListener('change', () => {
    const f = els.file.files[0];
    els.file.value = '';
    if (!f) return;
    f.text().then(text => {
      const r = St.parseImport(text);
      if (!r.ok) { alert(r.error); return; }
      if (state.courses.length && !confirm('แทนที่ข้อมูลปัจจุบันทั้งหมดด้วยไฟล์นี้?')) return;
      ui.preview = null; ui.popover = null; ui.openCourses.clear();
      commit(r.state);
    }, () => alert('อ่านไฟล์ไม่ได้'));
  });

  // ---------- events ----------
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const card = a.closest('.course');
    const cid = card && card.dataset.course;
    switch (a.dataset.action) {
      case 'add': openCourseDialog(null); break;
      case 'edit': openCourseDialog(cid); break;
      case 'delete': deleteCourse(cid); break;
      case 'toggle':
        if (ui.openCourses.has(cid)) ui.openCourses.delete(cid); else ui.openCourses.add(cid);
        renderCourses();
        break;
      case 'tab': ui.tab = a.dataset.tab; closePopover(); render(); break;
      case 'export': exportFile(); break;
      case 'import': els.file.click(); break;
      case 'open-conflict': openConflict(Number(a.dataset.day), Number(a.dataset.slot)); break;
      case 'close-pop': closePopover(); break;
      case 'swap': {
        const opt = a.closest('.opt');
        const next = clone(state);
        const c = next.courses.find(x => x.id === opt.dataset.course);
        c.selectedSectionId = opt.dataset.section;
        ui.popover = null; ui.preview = null;
        commit(next);
        break;
      }
      // dialog actions
      case 'cancel': closeDialog(); break;
      case 'add-section':
        draft.sections.push(newSection(nextSectionNumber()));
        renderDialog();
        els.dlg.querySelector('.sec-card:last-of-type .in-num').focus();
        break;
      case 'remove-section': {
        const sid = a.closest('[data-sid]').dataset.sid;
        const s = draft.sections.find(x => x.id === sid);
        if (!confirm(`ลบ Section ${s.number || ''} ใช่ไหม?`)) break;
        draft.sections = draft.sections.filter(x => x.id !== sid);
        renderDialog();
        break;
      }
      case 'delete-course':
        if (deleteCourse(draft.id)) closeDialog();
        break;
    }
  });

  // select a section
  els.col.addEventListener('change', e => {
    const input = e.target;
    if (input.type !== 'radio') return;
    const cid = input.closest('.course').dataset.course;
    const sid = input.value;
    const next = clone(state);
    next.courses.find(x => x.id === cid).selectedSectionId = sid;
    ui.preview = null;
    commit(next);
    // keep keyboard focus on the chosen radio after the list re-renders
    const again = els.col.querySelector(`.course[data-course="${CSS.escape(cid)}"] input[value="${CSS.escape(sid)}"]`);
    if (again) again.focus();
  });

  // preview on hover / keyboard focus
  els.col.addEventListener('pointerover', e => setPreview(previewFromRow(e.target.closest('.sec-row'))));
  els.col.addEventListener('pointerleave', () => setPreview(null));
  els.col.addEventListener('focusin', e => setPreview(previewFromRow(e.target.closest('.sec-row'))));
  els.col.addEventListener('focusout', () => setPreview(null));
  els.pop.addEventListener('pointerover', e => {
    const opt = e.target.closest('.opt');
    setPreview(opt ? { courseId: opt.dataset.course, sectionId: opt.dataset.section } : null);
  });
  els.pop.addEventListener('focusin', e => {
    const opt = e.target.closest('.opt');
    if (opt) setPreview({ courseId: opt.dataset.course, sectionId: opt.dataset.section });
  });

  // dialog form
  els.dlg.addEventListener('input', e => syncDraftField(e.target));
  els.dlg.addEventListener('change', e => syncDraftField(e.target));
  els.dlg.addEventListener('submit', e => { e.preventDefault(); saveDraft(); });
  els.dlg.addEventListener('close', () => { draft = null; });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && ui.popover && !els.dlg.open) closePopover();
  });
  window.addEventListener('resize', () => { if (ui.popover) positionPopover(); });

  render();
})();
