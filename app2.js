// === Panel System & Views (app.js Part 2) ===

let stack = [];
function pushPanel(title, renderFn) { stack.push({ title, render: renderFn }); showTopPanel(); }

function showTopPanel() {
    if (!stack.length) { closePanel(); return; }
    const top = stack[stack.length - 1];
    document.getElementById('panelTitle').textContent = top.title;
    document.getElementById('btnBack').style.display = stack.length > 1 ? 'inline-flex' : 'none';
    const body = document.getElementById('panelBody'); body.innerHTML = '';
    top.render(body);
    document.getElementById('panelOverlay').classList.add('open');
    renderBC();
}

function renderBC() {
    const bc = document.getElementById('breadcrumb');
    bc.innerHTML = stack.map((s, i) =>
        `<span class="bc-item" onclick="panelGoTo(${i})">${s.title}</span>${i < stack.length - 1 ? '<span class="bc-sep">›</span>' : ''}`
    ).join('');
}

function panelBack() { stack.pop(); showTopPanel(); }
function panelGoTo(i) { stack = stack.slice(0, i + 1); showTopPanel(); }
function closePanel() { stack = []; document.getElementById('panelOverlay').classList.remove('open'); }
function overlayClick(e) { if (e.target.id === 'panelOverlay') closePanel(); }
function refreshPanel() { if (stack.length) showTopPanel(); }

// ── LEVEL 1: BLOCK PANEL ──
let currentBlockCtx = null; // { blockId, dateStr }

function openBlockPanel(blockId, date) {
    currentBlockCtx = { blockId, dateStr: dateToStr(date) };
    stack = [];
    const b = DB.blocks.find(x => x.id === blockId); if (!b) return;
    const info = getEffectiveBlockInfo(b, currentBlockCtx.dateStr);
    pushPanel(`📦 ${info.name}`, body => renderBlockPanel(body, b, info));
}

function renderBlockPanel(body, b, info, showDelConfirm = false) {
    const isOverridden = info.isOverridden;
    const isRecurrent = b.recurrence && b.recurrence.type !== 'none';

    // Warn if viewing an overridden instance
    if (isOverridden) {
        const warn = el('div');
        warn.style.cssText = 'background: rgba(244,180,0,0.1); border-left: 3px solid var(--accent-warning); padding: 8px 12px; font-size: 0.75rem; margin-bottom: 16px; border-radius: 4px; color: var(--text-secondary);';
        warn.innerHTML = '⚠️ <b>例外スケジュール:</b> この日の予定は個別に時間を変更されています。ここでの名前・色の変更は全体に影響します。';
        body.appendChild(warn);
    }

    // Editable name (applies to base block)
    const nameEl = el('div');
    nameEl.style.cssText = 'font-size: 1.25rem; font-weight: 700; margin-bottom: 8px; cursor: text; padding: 4px 6px; border-radius: var(--radius-sm); border: 1px solid transparent; transition: all 0.2s;';
    nameEl.title = 'クリックで編集';
    nameEl.textContent = b.name; // Always show base name for editing base config

    nameEl.onmouseenter = () => nameEl.style.borderColor = 'var(--border-strong)';
    nameEl.onmouseleave = () => nameEl.style.borderColor = 'transparent';
    nameEl.onclick = () => {
        const inp = document.createElement('input');
        inp.value = b.name;
        inp.style.cssText = 'font-size:1.25rem; font-weight:700; margin-bottom:8px;';
        nameEl.replaceWith(inp); inp.focus(); inp.select();

        const save = () => {
            const v = inp.value.trim();
            if (v) {
                b.name = v;
                dbSave(); renderCalendar();
                if (stack.length) { stack[stack.length - 1].title = `📦 ${v}`; renderBC(); }
            }
            inp.replaceWith(nameEl); nameEl.textContent = b.name;
        };
        inp.addEventListener('blur', save);
        inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } if (ev.key === 'Escape') inp.replaceWith(nameEl); });
    };
    body.appendChild(nameEl);

    // Color Picker
    const colorRow = el('div'); colorRow.style.cssText = 'display:flex; align-items:center; gap:12px; margin-bottom:16px;';
    const colorLbl = el('div', 'form-label'); colorLbl.textContent = '全体カラー'; colorLbl.style.marginBottom = '0';
    const cpEl = el('div', 'color-picker'); cpEl.style.flex = '1';

    function renderPanelColorPicker() {
        cpEl.innerHTML = '';
        COLORS.forEach(c => {
            const sw = el('div', 'color-swatch' + (c === b.color ? ' sel' : ''));
            sw.style.background = c;
            sw.onclick = () => { b.color = c; dbSave(); renderCalendar(); renderPanelColorPicker(); };
            cpEl.appendChild(sw);
        });
    }
    renderPanelColorPicker();
    colorRow.appendChild(colorLbl); colorRow.appendChild(cpEl); body.appendChild(colorRow);

    // Time edit
    const timeWrap = el('div'); timeWrap.style.marginBottom = '20px';
    const infoEl = el('div');
    infoEl.style.cssText = 'font-size:0.85rem; color:var(--text-secondary); cursor:pointer; display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:var(--radius-sm); border:1px solid transparent; transition:all 0.2s; background:var(--bg-secondary);';
    infoEl.title = 'クリックで基本時間を編集';
    infoEl.innerHTML = `<span>🕒 ${b.startH}:00〜${b.endH}:00${isRecurrent ? ' — ' + REC_LABEL[b.recurrence.type] : ''}</span><span style="font-size:0.75rem;opacity:0.6">✎ 基本設定を編集</span>`;
    infoEl.onmouseenter = () => infoEl.style.borderColor = 'var(--border-strong)';
    infoEl.onmouseleave = () => infoEl.style.borderColor = 'transparent';

    const timeForm = el('div');
    timeForm.style.cssText = 'background:var(--bg-secondary); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px; margin-top:8px; display:none;';
    timeForm.innerHTML = `
        <div style="display:flex; gap:12px; margin-bottom:12px;">
            <div style="flex:1"><div class="form-label">開始 (時)</div><input type="number" id="tfeStart" min="0" max="23"></div>
            <div style="flex:1"><div class="form-label">終了 (時)</div><input type="number" id="tfeEnd" min="1" max="24"></div>
        </div>
        <div style="margin-bottom:12px"><div class="form-label">繰り返し</div>
            <select id="tfeRec">
                <option value="none">繰り返しなし</option>
                <option value="daily">毎日</option>
                <option value="weekly">毎週（曜日指定）</option>
                <option value="biweekly">隔週</option>
                <option value="monthly">毎月</option>
            </select>
        </div>
        <div id="tfeRecDaysRow" style="margin-bottom:16px; display:none">
            <div class="form-label">繰り返す曜日</div>
            <div class="days-grid" id="tfeRecDays">
                <div class="day-toggle" data-d="0">月</div><div class="day-toggle" data-d="1">火</div>
                <div class="day-toggle" data-d="2">水</div><div class="day-toggle" data-d="3">木</div>
                <div class="day-toggle" data-d="4">金</div><div class="day-toggle" data-d="5">土</div>
                <div class="day-toggle" data-d="6">日</div>
            </div>
        </div>
        <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button id="tfeCancel">キャンセル</button>
            <button class="primary" id="tfeSave">保存</button>
        </div>`;

    infoEl.onclick = () => {
        timeForm.querySelector('#tfeStart').value = b.startH;
        timeForm.querySelector('#tfeEnd').value = b.endH;
        const recType = (b.recurrence && b.recurrence.type) || 'none';
        timeForm.querySelector('#tfeRec').value = recType;
        timeForm.querySelector('#tfeRecDaysRow').style.display = (recType === 'weekly' || recType === 'biweekly') ? '' : 'none';
        timeForm.querySelectorAll('#tfeRecDays .day-toggle').forEach(t => {
            t.classList.toggle('on', (b.recurrence && b.recurrence.recDays || []).includes(parseInt(t.dataset.d)));
        });
        infoEl.style.display = 'none'; timeForm.style.display = '';
    };

    timeForm.querySelector('#tfeRec').addEventListener('change', () => {
        const v = timeForm.querySelector('#tfeRec').value;
        timeForm.querySelector('#tfeRecDaysRow').style.display = (v === 'weekly' || v === 'biweekly') ? '' : 'none';
    });
    timeForm.querySelectorAll('#tfeRecDays .day-toggle').forEach(t => t.addEventListener('click', () => t.classList.toggle('on')));
    timeForm.querySelector('#tfeCancel').onclick = () => { timeForm.style.display = 'none'; infoEl.style.display = ''; };

    timeForm.querySelector('#tfeSave').onclick = () => {
        const sH = parseInt(timeForm.querySelector('#tfeStart').value);
        const eH = parseInt(timeForm.querySelector('#tfeEnd').value);
        if (isNaN(sH) || isNaN(eH) || eH <= sH) { toast('時刻が不正です'); return; }
        b.startH = sH; b.endH = eH;
        const recType = timeForm.querySelector('#tfeRec').value;
        const recDays = [...timeForm.querySelectorAll('#tfeRecDays .day-toggle.on')].map(t => parseInt(t.dataset.d));
        b.recurrence = { type: recType, recDays };
        dbSave(); renderCalendar();

        infoEl.innerHTML = `<span>🕒 ${b.startH}:00〜${b.endH}:00${recType !== 'none' ? ' — ' + REC_LABEL[recType] : ''}</span><span style="font-size:0.75rem;opacity:0.6">✎ 基本設定を編集</span>`;
        timeForm.style.display = 'none'; infoEl.style.display = '';
        toast('時間設定を保存しました');
    };
    timeWrap.appendChild(infoEl); timeWrap.appendChild(timeForm); body.appendChild(timeWrap);

    // Task Lists section
    const sh = el('div', 'sec-hdr');
    sh.innerHTML = `<span class="sec-label">タスクリスト (${b.taskLists.length})</span>`;
    const addTLBtn = el('button'); addTLBtn.textContent = '+ タスクリストを追加';
    addTLBtn.onclick = () => openAddTL(b.id);
    sh.appendChild(addTLBtn); body.appendChild(sh);

    b.taskLists.forEach(tl => {
        const p = calcTLProgress(tl);
        const card = el('div', 'card');
        const ch = el('div', 'card-header');

        const tlNameEl = el('span', 'card-title');
        tlNameEl.style.cursor = 'text'; tlNameEl.title = 'クリックで編集';
        tlNameEl.textContent = `📋 ${tl.name}`;

        // Edit list name inline
        tlNameEl.onclick = e => {
            e.stopPropagation();
            const inp = document.createElement('input'); inp.value = tl.name;
            inp.style.cssText = 'flex:1; width:auto; font-weight:600; padding:2px 6px;';
            tlNameEl.replaceWith(inp); inp.focus(); inp.select();
            const save = () => { const v = inp.value.trim(); if (v) { tl.name = v; dbSave(); } inp.replaceWith(tlNameEl); tlNameEl.textContent = `📋 ${tl.name}`; };
            inp.addEventListener('blur', save);
            inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } if (ev.key === 'Escape') inp.replaceWith(tlNameEl); });
        };

        const taskCount = el('span'); taskCount.style.cssText = 'font-size:0.75rem; color:var(--text-secondary); margin-right:8px;';
        taskCount.textContent = `${tl.tasks.length}タスク`;

        const delTLBtn = el('button', 'danger'); delTLBtn.innerHTML = '✕'; delTLBtn.style.cssText = 'padding:2px 6px; border-radius:4px;';
        delTLBtn.title = '削除';
        delTLBtn.onclick = e => {
            e.stopPropagation();
            if (!confirm(`タスクリスト「${tl.name}」を削除しますか？`)) return;
            b.taskLists = b.taskLists.filter(t => t.id !== tl.id);
            dbSave(); body.innerHTML = ''; renderBlockPanel(body, b, info, false); toast('削除しました');
        };

        ch.appendChild(tlNameEl); ch.appendChild(taskCount); ch.appendChild(delTLBtn); card.appendChild(ch);

        const pb = el('div', 'progress-bar'); const pf = el('div', 'progress-fill');
        pf.style.cssText = `width:${p}%; background:${b.color || COLORS[0]}`; pb.appendChild(pf); card.appendChild(pb);
        const pl = el('div', 'pct-label'); pl.textContent = `${p}%`; card.appendChild(pl);

        card.onclick = e => { if (e.target === delTLBtn || e.target === tlNameEl || e.target.tagName === 'INPUT') return; openTLPanel(b.id, tl.id); };
        body.appendChild(card);
    });

    // Delete section
    if (!showDelConfirm) {
        const delBtn = el('button', 'danger'); delBtn.style.cssText = 'width:100%; margin-top:24px; padding:10px;';
        delBtn.textContent = '🗑 ブロックを削除';
        delBtn.onclick = () => { body.innerHTML = ''; renderBlockPanel(body, b, info, true); };
        body.appendChild(delBtn);
    } else {
        const conf = el('div');
        conf.style.cssText = 'background: rgba(234, 67, 53, 0.1); border: 1px solid var(--accent-danger); border-radius: var(--radius-md); padding: 16px; margin-top: 24px;';

        if (isRecurrent) {
            conf.innerHTML = `<p style="font-size:0.875rem; font-weight:600; color:var(--text-primary); margin-bottom:12px;">繰り返し予定の削除方法を選択してください。</p><div class="del-btns" style="display:flex; gap:8px; flex-wrap:wrap;"></div>`;
            const btns = conf.querySelector('.del-btns');

            const btn1 = el('button', 'danger'); btn1.textContent = 'この日だけ削除';
            btn1.onclick = () => {
                if (!b.exceptions) b.exceptions = [];
                if (currentBlockCtx) {
                    b.exceptions.push(currentBlockCtx.dateStr);
                    // Also clear any override for this date
                    if (b.overrides) {
                        b.overrides = b.overrides.filter(o => o.date !== currentBlockCtx.dateStr);
                    }
                }
                dbSave(); renderCalendar(); closePanel(); toast('この日を削除しました');
            };

            const btn2 = el('button', 'danger'); btn2.textContent = '以降すべて削除';
            btn2.onclick = () => {
                if (currentBlockCtx) b.endDate = currentBlockCtx.dateStr;
                dbSave(); renderCalendar(); closePanel(); toast('以降を削除しました');
            };

            const btn3 = el('button'); btn3.textContent = 'キャンセル';
            btn3.onclick = () => { body.innerHTML = ''; renderBlockPanel(body, b, info, false); };

            btns.appendChild(btn1); btns.appendChild(btn2); btns.appendChild(btn3);
        } else {
            conf.innerHTML = `<p style="font-size:0.875rem; font-weight:600; color:var(--text-primary); margin-bottom:12px;">この予定を完全に削除しますか？</p><div class="del-btns" style="display:flex; gap:8px;"></div>`;
            const btns = conf.querySelector('.del-btns');
            const btn1 = el('button', 'danger'); btn1.textContent = '削除する';
            btn1.onclick = () => { DB.blocks = DB.blocks.filter(x => x.id !== b.id); dbSave(); renderCalendar(); closePanel(); toast('削除しました'); };
            const btn2 = el('button'); btn2.textContent = 'キャンセル';
            btn2.onclick = () => { body.innerHTML = ''; renderBlockPanel(body, b, info, false); };
            btns.appendChild(btn1); btns.appendChild(btn2);
        }
        body.appendChild(conf);
    }
}

// ── TASK LIST & TASKS LEVELS ──
// These work identically but styled to match the new UI.
// Since UI handling and styling moved to CSS, let's include the core rendering logic.

function openTLPanel(blockId, tlId) {
    const b = DB.blocks.find(x => x.id === blockId);
    const tl = b && b.taskLists.find(t => t.id === tlId); if (!tl) return;
    pushPanel(`📋 ${tl.name}`, body => renderTLPanel(body, b, tl));
}

function renderTLPanel(body, b, tl) {
    const sh = el('div', 'sec-hdr'); sh.innerHTML = `<span class="sec-label">タスク (${tl.tasks.length})</span>`;
    const ab = el('button'); ab.textContent = '+ タスクを追加'; ab.onclick = () => openAddTask(b.id, tl.id);
    sh.appendChild(ab); body.appendChild(sh);

    // Sortable container for tasks
    const container = el('div', 'tasks-container');
    container.id = `tc-${tl.id}`;

    tl.tasks.forEach((task, index) => {
        const wrap = el('div', 'task-item');
        wrap.dataset.id = task.id;
        wrap.dataset.index = index;

        const row = el('div', 'task-row');

        // Drag Handle
        const handle = el('div', 'drag-handle');
        handle.dataset.draggable = 'true';

        const chk = el('div', 'chk' + (task.done ? ' done' : ''));
        chk.onclick = e => { e.stopPropagation(); toggleTask(b.id, tl.id, task.id); };

        const nm = el('span', 'task-name' + (task.done ? ' done' : ''));
        nm.textContent = task.name; nm.title = 'ダブルクリックで編集';
        nm.ondblclick = e => {
            e.stopPropagation();
            const inp = document.createElement('input'); inp.value = task.name; inp.style.cssText = 'flex:1; padding:4px;';
            nm.replaceWith(inp); inp.focus(); inp.select();
            const save = () => { const v = inp.value.trim(); if (v) { task.name = v; dbSave(); } inp.replaceWith(nm); nm.textContent = task.name; nm.className = 'task-name' + (task.done ? ' done' : ''); };
            inp.addEventListener('blur', save);
            inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } if (ev.key === 'Escape') inp.replaceWith(nm); });
        };

        const delBtn = el('button', 'danger'); delBtn.innerHTML = '✕'; delBtn.style.cssText = 'padding:2px 6px; border-radius:4px; flex-shrink:0;';
        delBtn.onclick = e => {
            e.stopPropagation();
            tl.tasks = tl.tasks.filter(t => t.id !== task.id);
            dbSave(); refreshPanel(); toast('削除しました');
        };

        const icon = el('span', 'expand-icon'); icon.textContent = task.subtasks.length ? `▸ ${task.subtasks.length}` : '▸';

        row.appendChild(handle); row.appendChild(chk); row.appendChild(nm); row.appendChild(delBtn); row.appendChild(icon);
        row.onclick = e => { if (e.target === chk || e.target === delBtn || e.target.tagName === 'INPUT' || e.target === handle) return; openTaskPanel(b.id, tl.id, task.id); };

        // Simple drag to reorder tasks within this container
        handle.addEventListener('mousedown', e => {
            // Note: full Sortable logic is complex. We will implement simple HTML5 drag and drop below.
            wrap.setAttribute('draggable', 'true');
        });
        wrap.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', index);
            setTimeout(() => wrap.style.opacity = '0.5', 0);
        });
        wrap.addEventListener('dragend', () => {
            wrap.style.opacity = '1';
            wrap.removeAttribute('draggable');
            document.querySelectorAll('.task-item').forEach(i => i.style.borderTop = '');
        });
        wrap.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            wrap.style.borderTop = '2px solid var(--accent-primary)';
        });
        wrap.addEventListener('dragleave', () => { wrap.style.borderTop = ''; });
        wrap.addEventListener('drop', (e) => {
            e.stopPropagation();
            wrap.style.borderTop = '';
            const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
            const dropIndex = index;
            if (dragIndex !== dropIndex && !isNaN(dragIndex)) {
                // Reorder array
                const movedTask = tl.tasks.splice(dragIndex, 1)[0];
                tl.tasks.splice(dropIndex, 0, movedTask);
                dbSave();
                refreshPanel();
            }
        });

        wrap.appendChild(row); container.appendChild(wrap);
    });

    body.appendChild(container);

    // Save as template button
    const saveTplRow = el('div'); saveTplRow.style.marginTop = '24px'; saveTplRow.style.textAlign = 'right';
    const btnSaveTpl = el('button'); btnSaveTpl.innerHTML = '💾 テンプレートとして保存';
    btnSaveTpl.onclick = () => {
        if (!DB.templates) DB.templates = [];
        const tplName = prompt("テンプレート名を入力:", tl.name);
        if (tplName) {
            DB.templates.push({
                id: uid(),
                name: tplName,
                tasks: JSON.parse(JSON.stringify(tl.tasks)).map(t => {
                    t.id = uid(); t.done = false;
                    t.subtasks.forEach(st => { st.id = uid(); st.done = false; });
                    return t;
                })
            });
            dbSave();
            toast('テンプレートを保存しました');
        }
    };
    saveTplRow.appendChild(btnSaveTpl);
    body.appendChild(saveTplRow);
}

function openTaskPanel(blockId, tlId, taskId) {
    const bl = DB.blocks.find(x => x.id === blockId);
    const tl = bl && bl.taskLists.find(t => t.id === tlId);
    const task = tl && tl.tasks.find(t => t.id === taskId); if (!task) return;
    pushPanel(`✅ ${task.name}`, body => renderTaskPanel(body, bl, tl, task));
}

function renderTaskPanel(body, b, tl, task) {
    const s1 = el('div'); s1.style.marginBottom = '20px';
    const lbl = el('label'); lbl.style.cssText = 'display:flex; align-items:center; gap:12px; font-size:1rem; font-weight:500; cursor:pointer; background:var(--bg-secondary); padding:12px; border-radius:var(--radius-md); border:1px solid var(--border-subtle);';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = task.done;
    cb.style.width = '20px'; cb.style.height = '20px';
    cb.onchange = () => { task.done = cb.checked; dbSave(); refreshPanel(); };
    const cs = el('span'); cs.textContent = 'このタスクを完了にする';
    lbl.appendChild(cb); lbl.appendChild(cs); s1.appendChild(lbl); body.appendChild(s1);

    const s2 = el('div'); s2.style.marginBottom = '20px';
    const fl = el('div', 'form-label'); fl.textContent = 'タスク名を編集';
    const inp = document.createElement('input'); inp.value = task.name;
    inp.style.fontSize = '1rem'; inp.style.padding = '10px 12px';
    inp.onchange = () => { task.name = inp.value; dbSave(); stack[stack.length - 1].title = '✅ ' + task.name; renderBC(); };
    s2.appendChild(fl); s2.appendChild(inp); body.appendChild(s2);

    const sh = el('div', 'sec-hdr'); sh.innerHTML = `<span class="sec-label">サブタスク (${task.subtasks.length})</span>`;
    const ab = el('button'); ab.textContent = '+ サブタスクを追加'; ab.onclick = () => openAddST(b.id, tl.id, task.id);
    sh.appendChild(ab); body.appendChild(sh);

    task.subtasks.forEach(st => {
        const row = el('div', 'sub-row');
        const chk = el('div', 'chk-sm' + (st.done ? ' done' : ''));
        chk.onclick = () => { st.done = !st.done; dbSave(); refreshPanel(); };
        const nm = el('span', 'sub-name' + (st.done ? ' done' : ''));
        nm.textContent = st.name; nm.title = 'ダブルクリックで編集';
        nm.ondblclick = () => {
            const sinp = document.createElement('input'); sinp.value = st.name; sinp.style.cssText = 'flex:1; padding:2px 4px;';
            nm.replaceWith(sinp); sinp.focus(); sinp.select();
            const save = () => { const v = sinp.value.trim(); if (v) { st.name = v; dbSave(); } sinp.replaceWith(nm); nm.textContent = st.name; nm.className = 'sub-name' + (st.done ? ' done' : ''); };
            sinp.addEventListener('blur', save);
            sinp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } if (ev.key === 'Escape') sinp.replaceWith(nm); });
        };
        const delBtn = el('button', 'danger'); delBtn.innerHTML = '✕'; delBtn.style.cssText = 'padding:2px 6px; border-radius:4px;';
        delBtn.onclick = () => { task.subtasks = task.subtasks.filter(s => s.id !== st.id); dbSave(); refreshPanel(); toast('削除しました'); };
        row.appendChild(chk); row.appendChild(nm); row.appendChild(delBtn); body.appendChild(row);
    });
}

function toggleTask(blockId, tlId, taskId) {
    const b = DB.blocks.find(x => x.id === blockId);
    const tl = b && b.taskLists.find(t => t.id === tlId);
    const task = tl && tl.tasks.find(t => t.id === taskId);
    if (task) { task.done = !task.done; dbSave(); refreshPanel(); }
}
function calcTLProgress(tl) {
    let total = 0, done = 0;
    tl.tasks.forEach(t => { if (t.subtasks.length) { t.subtasks.forEach(s => { total++; if (s.done) done++; }); } else { total++; if (t.done) done++; } });
    return total ? Math.round(done / total * 100) : 0;
}
