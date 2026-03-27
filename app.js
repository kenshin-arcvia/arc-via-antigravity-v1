/**
 * ARC VIA mk0 - Main Logic
 * Refactored modular structure with Drag & Drop and Dark Mode support.
 */

// ═══════════════════════════════════════════════════════════
// UI & THEME INITIALIZATION
// ═══════════════════════════════════════════════════════════
function initTheme() {
    const savedTheme = localStorage.getItem('arc-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Default to light if no preference is saved, otherwise use saved or system preference
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.body.setAttribute('data-theme', 'dark');
        document.getElementById('themeIcon').textContent = '☀️';
    } else {
        document.body.removeAttribute('data-theme');
        document.getElementById('themeIcon').textContent = '🌙';
    }
}

function toggleTheme() {
    // Add transitioning class to smooth out color changes without affecting layout
    document.body.classList.add('theme-transitioning');

    if (document.body.getAttribute('data-theme') === 'dark') {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('arc-theme', 'light');
        document.getElementById('themeIcon').textContent = '🌙';
    } else {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('arc-theme', 'dark');
        document.getElementById('themeIcon').textContent = '☀️';
    }

    // Remove class after transition completes
    setTimeout(() => document.body.classList.remove('theme-transitioning'), 300);
}

document.getElementById('themeToggle').addEventListener('click', toggleTheme);
initTheme();

// ═══════════════════════════════════════════════════════════
// DATA MODEL & STATE
// ═══════════════════════════════════════════════════════════
const COLORS = ['#1a73e8', '#0f9d58', '#ea4335', '#f4b400', '#8e24aa', '#039be5', '#e67c73', '#33b679'];
const DOWS = ['月', '火', '水', '木', '金', '土', '日'];
const REC_LABEL = { none: '', daily: '毎日', weekly: '毎週', biweekly: '隔週', monthly: '毎月' };

let DB = {
    blocks: [],
    templates: [] // New: reusable task list templates
};

function uid() { return Math.random().toString(36).slice(2, 10); }
function dateToStr(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

function dbLoad() {
    try {
        const s = localStorage.getItem('arc-mk1-data'); // Upgraded key
        if (s) DB = JSON.parse(s);
    } catch (e) { console.error("DB Load error:", e); }

    if (!DB.blocks) DB.blocks = [];
    if (!DB.templates) DB.templates = [];

    // Migration from old version if new DB is empty
    if (DB.blocks.length === 0) {
        try {
            const oldS = localStorage.getItem('arc-mk0-v4');
            if (oldS) {
                const oldDB = JSON.parse(oldS);
                if (oldDB.blocks && oldDB.blocks.length > 0) {
                    DB.blocks = oldDB.blocks;
                    toast("以前のデータを引き継ぎました");
                }
            }
        } catch (e) { }
    }

    // Seed if still empty
    if (!DB.blocks.length) seed();
}

function dbSave() {
    localStorage.setItem('arc-mk1-data', JSON.stringify(DB));
    // Optional: trigger save to Google Calendar if sync is enabled
    if (window.gcal && window.gcal.isSyncEnabled) {
        window.gcal.scheduleSync();
    }
}

function seed() {
    const w = getWeekDates();
    const b1 = mkBlock('薬局業務', [0], 9, 11, { type: 'weekly', recDays: [0, 3] }, COLORS[0], dateToStr(w[0]));
    const tl1 = mkTL(b1, '朝のルーティン');
    mkTask(tl1, '受付確認'); mkTask(tl1, '在庫チェック');

    const b2 = mkBlock('開発スプリント', [1], 10, 12, { type: 'weekly', recDays: [1, 4] }, COLORS[1], dateToStr(w[1]));
    const tl2 = mkTL(b2, 'スプリントタスク');
    const t = mkTask(tl2, 'APIエンドポイント実装'); mkST(t, '設計'); mkST(t, '実装'); mkST(t, 'テスト');

    mkBlock('マーケMTG', [2], 14, 15, { type: 'none', recDays: [] }, COLORS[3], dateToStr(w[2]));

    // Also create a sample template for the new feature
    const tpl = { id: uid(), name: '標準開発ルーティン', tasks: [] };
    const tplT = { id: uid(), name: 'コーディング', done: false, subtasks: [] };
    tplT.subtasks.push({ id: uid(), name: '実装', done: false });
    tplT.subtasks.push({ id: uid(), name: 'PR作成', done: false });
    tpl.tasks.push(tplT);
    DB.templates.push(tpl);

    dbSave();
}

/**
 * Creates a new block.
 * Added overrides array for individual day adjustments.
 */
function mkBlock(name, days, startH, endH, recurrence, color, anchorDate) {
    const b = {
        id: uid(), name, days, startH, endH, recurrence,
        color: color || COLORS[0],
        taskLists: [],
        anchorDate: anchorDate || null,
        exceptions: [],     // Array of date strings where this block is deleted
        overrides: [],      // Array of objects { date: 'YYYY-MM-DD', startH, endH, name, color } for daily tweaks
        endDate: null
    };
    DB.blocks.push(b);
    return b;
}

function mkTL(block, name, fromTemplate = null) {
    const tl = { id: uid(), name, tasks: [] };

    // Support creating from template
    if (fromTemplate) {
        // deep copy tasks
        tl.tasks = JSON.parse(JSON.stringify(fromTemplate.tasks));
        // generate new IDs to avoid conflicts
        tl.tasks.forEach(t => {
            t.id = uid();
            t.done = false;
            t.subtasks.forEach(st => {
                st.id = uid();
                st.done = false;
            });
        });
    }

    block.taskLists.push(tl);
    return tl;
}
function mkTask(tl, name) { const t = { id: uid(), name, done: false, subtasks: [] }; tl.tasks.push(t); return t; }
function mkST(task, name) { task.subtasks.push({ id: uid(), name, done: false }); }

// ═══════════════════════════════════════════════════════════
// RECURRENCE & VISIBILITY
// ═══════════════════════════════════════════════════════════
function blockVisibleOn(block, dayIdx, date) {
    const ds = dateToStr(date);
    if (block.endDate && ds >= block.endDate) return false;
    if (block.exceptions && block.exceptions.includes(ds)) return false;

    const rec = block.recurrence || { type: 'none' };

    if (rec.type === 'none') {
        return block.anchorDate ? ds === block.anchorDate : (block.days.includes(dayIdx) && weekOffset === 0);
    }

    if (block.anchorDate && ds < block.anchorDate) return false;

    if (rec.type === 'daily') return true;
    if (rec.type === 'weekly') {
        const rd = rec.recDays && rec.recDays.length ? rec.recDays : block.days;
        return rd.includes(dayIdx);
    }
    if (rec.type === 'biweekly') {
        const rd = rec.recDays && rec.recDays.length ? rec.recDays : block.days;
        if (!rd.includes(dayIdx)) return false;

        const anchor = block.anchorDate ? new Date(block.anchorDate) : new Date();
        const anchorMon = new Date(anchor); anchorMon.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
        const dateMon = new Date(date); dateMon.setDate(date.getDate() - ((date.getDay() + 6) % 7));
        const weeks = Math.round((dateMon - anchorMon) / (7 * 864e5));
        return weeks % 2 === 0;
    }
    if (rec.type === 'monthly') {
        if (!block.anchorDate) return block.days.includes(dayIdx);
        const anchor = new Date(block.anchorDate);
        return date.getDate() === anchor.getDate();
    }
    return false;
}

/**
 * Gets the effectively active properties for a block on a specific date,
 * applying any daily overrides.
 */
function getEffectiveBlockInfo(block, dateStr) {
    let info = {
        name: block.name,
        startH: block.startH,
        endH: block.endH,
        color: block.color,
        isOverridden: false
    };

    if (block.overrides) {
        const override = block.overrides.find(o => o.date === dateStr);
        if (override) {
            info.startH = override.startH !== undefined ? override.startH : info.startH;
            info.endH = override.endH !== undefined ? override.endH : info.endH;
            info.name = override.name ? override.name : info.name;
            info.color = override.color ? override.color : info.color;
            info.isOverridden = true;
        }
    }
    return info;
}

// ═══════════════════════════════════════════════════════════
// BLOCK OVERLAP LAYOUT
// ═══════════════════════════════════════════════════════════
function layoutBlocks(blocksAndInfo) {
    if (!blocksAndInfo.length) return [];
    // Sort by effective start time, then effective duration
    const sorted = [...blocksAndInfo].sort((a, b) =>
        a.info.startH - b.info.startH || b.info.endH - b.info.startH - (a.info.endH - a.info.startH)
    );

    const colEnd = [];
    sorted.forEach(item => {
        let col = -1;
        for (let i = 0; i < colEnd.length; i++) {
            if (colEnd[i] <= item.info.startH) { col = i; colEnd[i] = item.info.endH; break; }
        }
        if (col === -1) { col = colEnd.length; colEnd.push(item.info.endH); }
        item._col = col;
    });

    sorted.forEach(item => {
        let max = 0;
        for (let h = item.info.startH; h < item.info.endH; h++) {
            const c = sorted.filter(x => x.info.startH <= h && x.info.endH > h).length;
            if (c > max) max = c;
        }
        item._numCols = max;
    });
    return sorted;
}

// ═══════════════════════════════════════════════════════════
// WEEK STATE
// ═══════════════════════════════════════════════════════════
let weekOffset = 0;
function getWeekDates() {
    const today = new Date(); const dow = today.getDay();
    const mon = new Date(today); mon.setDate(today.getDate() - ((dow + 6) % 7) + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
}
function shiftWeek(d) { weekOffset += d; renderCalendar(); }
function goToday() { weekOffset = 0; renderCalendar(); }

// ═══════════════════════════════════════════════════════════
// CALENDAR RENDER & DRAG STATE
// ═══════════════════════════════════════════════════════════
let drag = null; // Used for creating block via drag
let dragDropState = null; // Used for moving blocks via drag & drop

function onSlotMouseDown(e, dayIdx, hour, date) {
    if (e.button !== 0 || e.target.closest('.time-block')) return;
    e.preventDefault();
    document.body.classList.add('no-select');
    const dayCol = e.currentTarget.closest('.day-col');
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.style.top = (hour * 60) + 'px';
    ghost.style.height = '60px';
    dayCol.appendChild(ghost);
    drag = { dayIdx, startH: hour, endH: hour + 1, date, ghostEl: ghost };
}

// Handle global mouse moves
document.addEventListener('mousemove', e => {
    // 1. Creating a new block
    if (drag) {
        const els = document.elementsFromPoint(e.clientX, e.clientY);
        const slot = els.find(x => x.classList && x.classList.contains('hour-slot') && parseInt(x.dataset.day) === drag.dayIdx);
        if (slot) {
            const h = parseInt(slot.dataset.hour);
            const sH = Math.min(drag.startH, h);
            const eH = Math.max(drag.startH, h) + 1;
            drag.endH = eH;
            drag.ghostEl.style.top = (sH * 60) + 'px';
            drag.ghostEl.style.height = ((eH - sH) * 60) + 'px';
        }
    }

    // 2. Moving an existing block
    if (dragDropState && dragDropState.type === 'block' && dragDropState.isDragging) {
        const ghost = dragDropState.ghost;
        ghost.style.left = (e.clientX - dragDropState.offsetX) + 'px';
        ghost.style.top = (e.clientY - dragDropState.offsetY) + 'px';

        // Highlight underlying column
        document.querySelectorAll('.day-col').forEach(col => col.classList.remove('drag-over'));
        const els = document.elementsFromPoint(e.clientX, e.clientY);
        const col = els.find(x => x.classList && x.classList.contains('day-col'));
        if (col) col.classList.add('drag-over');
    }
});

// Handle global mouse up
document.addEventListener('mouseup', e => {
    document.body.classList.remove('no-select');

    // 1. Finish creating block
    if (drag) {
        const sH = Math.min(drag.startH, drag.endH - 1);
        const eH = Math.max(drag.startH, drag.endH - 1) + 1;
        drag.ghostEl.remove();
        const saved = drag; drag = null;
        openAddBlockModal(saved.dayIdx, sH, eH, saved.date);
    }

    // 2. Finish moving block
    if (dragDropState && dragDropState.type === 'block' && dragDropState.isDragging) {
        document.querySelectorAll('.day-col').forEach(col => col.classList.remove('drag-over'));
        dragDropState.ghost.remove();
        dragDropState.sourceEl.classList.remove('draggable-dragging');

        const els = document.elementsFromPoint(e.clientX, e.clientY);
        const slot = els.find(x => x.classList && x.classList.contains('hour-slot'));

        if (slot) {
            const newDayIdx = parseInt(slot.dataset.day);
            const newHour = parseInt(slot.dataset.hour);
            const targetDate = getWeekDates()[newDayIdx];

            handleBlockDrop(
                dragDropState.block,
                dragDropState.dateStr,
                newDayIdx,
                newHour,
                targetDate
            );
        }

        dragDropState = null;
    }
});

/**
 * Handles the logic when a block is dragged to a new time.
 * If recurrent, prompts the user whether to modify the series or just this instance.
 */
function handleBlockDrop(block, sourceDateStr, targetDayIdx, targetHour, targetDate) {
    const info = getEffectiveBlockInfo(block, sourceDateStr);
    const duration = info.endH - info.startH;
    let newEndH = targetHour + duration;
    if (newEndH > 24) newEndH = 24; // Cap at end of day

    const targetDateStr = dateToStr(targetDate);

    // Same position, do nothing
    if (sourceDateStr === targetDateStr && info.startH === targetHour) return;

    const isRecurrent = block.recurrence && block.recurrence.type !== 'none';

    if (isRecurrent) {
        // Show context menu/modal to ask for series vs instance edit
        if (confirm(`繰り返し予定を移動しますか？\n\n[OK] この日のみ移動する（例外）\n[キャンセル] 変更を破棄`)) {
            // Apply Override for target date
            if (!block.overrides) block.overrides = [];

            // If moving to a different day, we need to hide the source day and create an override on target
            if (sourceDateStr !== targetDateStr) {
                if (!block.exceptions) block.exceptions = [];
                block.exceptions.push(sourceDateStr);

                // Add an override for the target date if it's already generated by recurrence
                // Otherwise this requires a dummy block logic. For simplicity, we just add the override
                // and ensure the renderer checks overrides even if blockVisibleOn is false.
                block.overrides = block.overrides.filter(o => o.date !== targetDateStr);
                block.overrides.push({
                    date: targetDateStr,
                    startH: targetHour,
                    endH: newEndH,
                    isMovedInstance: true // Custom flag to force render
                });
            } else {
                // Moving on the same day
                const existingIndex = block.overrides.findIndex(o => o.date === sourceDateStr);
                if (existingIndex >= 0) {
                    block.overrides[existingIndex].startH = targetHour;
                    block.overrides[existingIndex].endH = newEndH;
                } else {
                    block.overrides.push({
                        date: sourceDateStr,
                        startH: targetHour,
                        endH: newEndH
                    });
                }
            }
            dbSave();
            renderCalendar();
            toast("この予定のみ時間を変更しました");
        }
    } else {
        // Single block, move it directly
        block.startH = targetHour;
        block.endH = newEndH;
        // If moving across days
        if (sourceDateStr !== targetDateStr) {
            block.days = [targetDayIdx];
            block.anchorDate = targetDateStr;
        }
        dbSave();
        renderCalendar();
        toast("予定を移動しました");
    }
}

function initBlockDrag(e, block, date, blockEl) {
    // Only drag if left click and not clicking a button/editable part
    if (e.button !== 0 || e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;

    e.preventDefault();
    e.stopPropagation(); // prevent panel open on mousedown

    const rect = blockEl.getBoundingClientRect();

    // Create drag ghost
    const ghost = blockEl.cloneNode(true);
    ghost.style.position = 'fixed';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = '0.8';
    ghost.style.zIndex = '9999';
    ghost.style.boxShadow = 'var(--shadow-floating)';
    document.body.appendChild(ghost);

    blockEl.classList.add('draggable-dragging');

    dragDropState = {
        type: 'block',
        isDragging: true,
        block: block,
        dateStr: dateToStr(date),
        sourceEl: blockEl,
        ghost: ghost,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top
    };
}

// ── CALENDAR RENDER ──
function renderCalendar() {
    const dates = getWeekDates();
    const today = new Date();
    const grid = document.getElementById('calGrid');
    grid.innerHTML = '';
    const fmt = d => `${d.getMonth() + 1}/${d.getDate()}`;
    document.getElementById('weekLabel').textContent = `${dates[0].getFullYear()}年 ${fmt(dates[0])} 〜 ${fmt(dates[6])}`;

    // Header
    const hdr = el('div', 'cal-header');
    hdr.appendChild(el('div', 'cal-corner'));
    dates.forEach((d, i) => {
        const isToday = d.toDateString() === today.toDateString();
        const dh = el('div', 'cal-day-header' + (isToday ? ' today' : ''));
        dh.innerHTML = `<div class="dow">${DOWS[i]}</div><div class="date">${d.getDate()}</div>`;
        hdr.appendChild(dh);
    });
    grid.appendChild(hdr);

    // Body
    const body = el('div', 'cal-body');

    // Time labels
    const timesCol = el('div', 'cal-times');
    for (let h = 0; h < 24; h++) {
        const tl = el('div', 'time-label');
        tl.textContent = h + ':00';
        timesCol.appendChild(tl);
    }
    body.appendChild(timesCol);

    // Day columns
    const daysArea = el('div', 'cal-days');
    dates.forEach((d, dayIdx) => {
        const dayCol = el('div', 'day-col');
        dayCol.dataset.day = dayIdx;
        const targetDateStr = dateToStr(d);

        // Hour slots
        for (let h = 0; h < 24; h++) {
            const slot = el('div', 'hour-slot');
            slot.dataset.hour = h;
            slot.dataset.day = dayIdx;
            slot.addEventListener('mousedown', e => onSlotMouseDown(e, dayIdx, h, d));
            dayCol.appendChild(slot);
        }

        // Gather blocks for this day.
        // Include normally visible ones, PLUS those that have been forcibly moved to this day via override trick
        const dayBlocks = [];
        DB.blocks.forEach(b => {
            const visibleNormal = blockVisibleOn(b, dayIdx, d);
            const forceVisible = b.overrides && b.overrides.some(o => o.date === targetDateStr && o.isMovedInstance);

            if (visibleNormal || forceVisible) {
                const info = getEffectiveBlockInfo(b, targetDateStr);
                dayBlocks.push({ block: b, info: info });
            }
        });

        layoutBlocks(dayBlocks).forEach(item => {
            const b = item.block;
            const info = item.info || getEffectiveBlockInfo(b, targetDateStr);

            const numCols = item._numCols || 1;
            const colW = 100 / numCols;
            const colL = (item._col / numCols) * 100;

            const blk = el('div', 'time-block');

            // Adjust calculation for 60px slot height
            blk.style.cssText = `top:${info.startH * 60 + 2}px;height:${(info.endH - info.startH) * 60 - 4}px;` +
                `left:calc(${colL}% + 4px);width:calc(${colW}% - 8px);` +
                `background:${info.color}15;border-left-color:${info.color};color:${info.color};`;

            const rec = b.recurrence && b.recurrence.type !== 'none' ? `<span class="tb-badge">${REC_LABEL[b.recurrence.type]}</span>` : '';
            const overrideBadge = info.isOverridden ? `<span class="override-badge" title="変更済み">!</span>` : '';

            blk.innerHTML = `<span class="tb-title">${esc(info.name)}${overrideBadge}</span>
                             <div class="tb-meta"><span class="tb-time">${info.startH}:00–${info.endH}:00</span>${rec}</div>`;

            // Drag and Panel events
            blk.addEventListener('mousedown', e => initBlockDrag(e, b, d, blk));
            blk.addEventListener('click', e => {
                if (dragDropState && dragDropState.isDragging) return; // ignore click if terminating drag
                e.stopPropagation();
                openBlockPanel(b.id, d);
            });

            dayCol.appendChild(blk);
        });

        daysArea.appendChild(dayCol);
    });
    body.appendChild(daysArea);
    grid.appendChild(body);
}

// ═══════════════════════════════════════════════════════════
// UI PANEL HELPERS
// ═══════════════════════════════════════════════════════════
function el(tag, cls) { const e = document.createElement(tag || 'div'); if (cls) e.className = cls; return e; }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

let toastT;
function toast(msg) {
    const e = document.getElementById('toast');
    e.textContent = msg;
    e.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => e.classList.remove('show'), 3000);
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (document.querySelector('.modal-overlay.open')) {
            document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
            drag = null; // Clear drag state just in case
        } else {
            closePanel();
        }
    }
});

// Initialization will be completed when all scripts load.
// Panel logic and Modals remain similar but refactored to look at overrides
// Check next steps to migrate the panel code to app.js
// === Panel System & Views (app.js Part 2) ===