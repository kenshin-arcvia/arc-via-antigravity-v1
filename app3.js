// === Modals & Voice (app.js Part 3) ===

// ── MODALS ──
let selBlockColor = COLORS[0];
let pendingBlock = null;
let addingTLForBlock = null, addingTaskFor = null, addingSTFor = null;

function renderBlockColorPicker() {
    const cp = document.getElementById('blockColorPicker'); cp.innerHTML = '';
    COLORS.forEach(c => {
        const sw = el('div', 'color-swatch' + (c === selBlockColor ? ' sel' : ''));
        sw.style.background = c;
        sw.onclick = () => { selBlockColor = c; renderBlockColorPicker(); };
        cp.appendChild(sw);
    });
}

function openAddBlockModal(dayIdx, startH, endH, date) {
    pendingBlock = { dayIdx, startH, endH, date };
    selBlockColor = COLORS[0]; renderBlockColorPicker();
    document.getElementById('bName').value = '';
    document.getElementById('bStart').value = startH;
    document.getElementById('bEnd').value = endH;
    document.getElementById('bRecType').value = 'none';
    document.getElementById('bRecDaysRow').style.display = 'none';
    document.querySelectorAll('#bRecDays .day-toggle').forEach(t => t.classList.remove('on'));
    document.querySelectorAll('#bRecDays .day-toggle').forEach(t => { if (parseInt(t.dataset.d) === dayIdx) t.classList.add('on'); });
    openModal('modalBlock');
}

function onRecTypeChange() {
    const v = document.getElementById('bRecType').value;
    document.getElementById('bRecDaysRow').style.display = (v === 'weekly' || v === 'biweekly') ? '' : 'none';
}

function saveBlock() {
    const name = document.getElementById('bName').value.trim();
    if (!name) { toast('ブロック名を入力してください'); return; }
    const startH = parseInt(document.getElementById('bStart').value);
    const endH = parseInt(document.getElementById('bEnd').value);
    if (isNaN(startH) || isNaN(endH) || endH <= startH) { toast('時刻が不正です'); return; }

    const recType = document.getElementById('bRecType').value;
    const recDays = [...document.querySelectorAll('#bRecDays .day-toggle.on')].map(t => parseInt(t.dataset.d));
    const recurrence = { type: recType, recDays };

    const { dayIdx, date } = pendingBlock || { dayIdx: 0, date: new Date() };
    const anchorDate = dateToStr(date || new Date());

    mkBlock(name, [dayIdx], startH, endH, recurrence, selBlockColor, anchorDate);
    dbSave(); renderCalendar(); closeModal('modalBlock'); toast('作成しました');
}

// ── TASKLIST MODAL (With Templates) ──
let selectedTemplateId = null;

function openAddTL(blockId) {
    addingTLForBlock = blockId;
    document.getElementById('tlName').value = '';
    selectedTemplateId = null;

    // Render templates
    const ts = document.getElementById('tlTemplates');
    if (DB.templates && DB.templates.length > 0) {
        ts.style.display = 'grid';
        ts.innerHTML = '';
        DB.templates.forEach(tpl => {
            const tc = el('div', 'template-card');
            tc.innerHTML = `<div class="template-card-title">${esc(tpl.name)}</div><div class="template-card-desc">${tpl.tasks.length} タスク</div>`;
            tc.onclick = () => {
                document.querySelectorAll('.template-card').forEach(c => c.classList.remove('sel'));
                if (selectedTemplateId === tpl.id) {
                    selectedTemplateId = null; // deselect
                } else {
                    tc.classList.add('sel');
                    selectedTemplateId = tpl.id;
                    document.getElementById('tlName').value = tpl.name;
                }
            };
            ts.appendChild(tc);
        });
    } else {
        ts.style.display = 'none';
    }

    openModal('modalTL');
}

function saveTL() {
    const name = document.getElementById('tlName').value.trim(); if (!name) return;
    const b = DB.blocks.find(x => x.id === addingTLForBlock); if (!b) return;

    let template = null;
    if (selectedTemplateId) {
        template = DB.templates.find(t => t.id === selectedTemplateId);
    }

    mkTL(b, name, template);
    dbSave(); refreshPanel(); closeModal('modalTL');
    toast(template ? 'テンプレートから追加しました' : '追加しました');
}

function openAddTask(blockId, tlId) { addingTaskFor = { blockId, tlId }; document.getElementById('taskName').value = ''; openModal('modalTask'); }
function saveTask() {
    const name = document.getElementById('taskName').value.trim(); if (!name) return;
    const b = DB.blocks.find(x => x.id === addingTaskFor.blockId);
    const tl = b && b.taskLists.find(t => t.id === addingTaskFor.tlId); if (!tl) return;
    mkTask(tl, name); dbSave(); refreshPanel(); closeModal('modalTask'); toast('追加しました');
}

function openAddST(blockId, tlId, taskId) { addingSTFor = { blockId, tlId, taskId }; document.getElementById('stName').value = ''; openModal('modalST'); }
function saveST() {
    const name = document.getElementById('stName').value.trim(); if (!name) return;
    const b = DB.blocks.find(x => x.id === addingSTFor.blockId);
    const tl = b && b.taskLists.find(t => t.id === addingSTFor.tlId);
    const task = tl && tl.tasks.find(t => t.id === addingSTFor.taskId); if (!task) return;
    mkST(task, name); dbSave(); refreshPanel(); closeModal('modalST'); toast('追加しました');
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function overlayModal(e, id) { if (e.target.id === id) closeModal(id); }

// ── VOICE ──
let recognition = null, isRec = false;
function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    recognition = new SR(); recognition.lang = 'ja-JP'; recognition.continuous = false; recognition.interimResults = false;
    recognition.onresult = e => { const t = e.results[0][0].transcript; document.getElementById('voiceResult').textContent = t; processVoice(t); };
    recognition.onend = stopRec; recognition.onerror = () => { stopRec(); toast('音声認識エラー'); };
}
function toggleRec() { if (!recognition) { toast('音声入力非対応'); return; } if (isRec) { recognition.stop(); stopRec(); } else { recognition.start(); startRec(); } }
function startRec() { isRec = true; const b = document.getElementById('voiceBtn'); b.classList.add('recording'); b.innerHTML = '⏹'; }
function stopRec() { isRec = false; const b = document.getElementById('voiceBtn'); b.classList.remove('recording'); b.innerHTML = '🎤'; }
function processVoice(t) {
    if (t.includes('今日') || t.includes('今週')) { weekOffset = 0; renderCalendar(); toast('今週'); return; }
    if (t.includes('来週')) { weekOffset++; renderCalendar(); toast('来週'); return; }
    if (t.includes('先週')) { weekOffset--; renderCalendar(); toast('先週'); return; }
    if (t.includes('ダーク') || t.includes('暗く')) { if (document.body.getAttribute('data-theme') !== 'dark') toggleTheme(); return; }
    if (t.includes('ライト') || t.includes('明るく')) { if (document.body.getAttribute('data-theme') === 'dark') toggleTheme(); return; }
    toast(`「${t}」— 認識できませんでした`);
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('voiceBtn').addEventListener('click', toggleRec);
    dbLoad();
    renderCalendar();
    initVoice();
    setTimeout(() => { document.getElementById('calWrap').scrollTop = 8 * 60; }, 50); // Scroll to 8 AM (60px per hour)
});
