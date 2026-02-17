// === Config ===
const API_BASE = window.NATIVE_API_BASE || '';

// === State ===
let cues = [];
let characters = [];
let editingCueId = null;
let editingBaseCue = null;
let sseClientId = null;
let userName = null;
const editorsMap = {};
let pendingConflictCueData = null;
let changedFieldsByOther = [];
let selectedIds = new Set();

// === DOM Elements ===
const cueTableBody = document.getElementById('cue-table-body');
const noCuesMsg = document.getElementById('no-cues');
const cueTable = document.getElementById('cue-table');
const statusText = document.getElementById('status-text');

// Cue modal elements
const cueModal = document.getElementById('cue-modal');
const cueModalTitle = document.getElementById('cue-modal-title');
const cueForm = document.getElementById('cue-form');
const cueIdInput = document.getElementById('cue-id');
const cueUpdatedAtInput = document.getElementById('cue-updated-at');
const startTimeInput = document.getElementById('start-time');
const endTimeInput = document.getElementById('end-time');
const dialogInput = document.getElementById('dialog');
const characterSelect = document.getElementById('character-select');
const submitBtn = document.getElementById('submit-btn');
const cueModalCancel = document.getElementById('cue-modal-cancel');
const addCharacterBtn = document.getElementById('add-character-btn');
const inputReel = document.getElementById('input-reel');
const inputScene = document.getElementById('input-scene');
const inputCueName = document.getElementById('input-cue-name');
const inputNotes = document.getElementById('input-notes');
const inputStatus = document.getElementById('input-status');
const inputPriority = document.getElementById('input-priority');

const characterModal = document.getElementById('character-modal');
const characterForm = document.getElementById('character-form');
const characterNameInput = document.getElementById('character-name');
const characterModalCancel = document.getElementById('character-modal-cancel');

const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmYes = document.getElementById('confirm-yes');
const confirmNo = document.getElementById('confirm-no');

const nameModal = document.getElementById('name-modal');
const nameForm = document.getElementById('name-form');
const userNameInput = document.getElementById('user-name-input');

const conflictModal = document.getElementById('conflict-modal');
const conflictSaveMine = document.getElementById('conflict-save-mine');
const conflictDiscard = document.getElementById('conflict-discard');

// Toolbar
const tbAdd = document.getElementById('tb-add');
const tbDuplicate = document.getElementById('tb-duplicate');
const tbEdit = document.getElementById('tb-edit');
const tbDelete = document.getElementById('tb-delete');

// === API Helpers ===
async function api(url, options = {}) {
  const res = await fetch(API_BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify({ ...JSON.parse(options.body), clientId: sseClientId }) : undefined,
  });
  if (res.status === 409) {
    const data = await res.json();
    if (data.serverCue) {
      const err = new Error('conflict');
      err.serverCue = data.serverCue;
      err.conflictingFields = data.conflictingFields || null;
      throw err;
    }
    throw new Error(data.error || 'Conflict');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchCues() {
  cues = await api('/api/cues');
  renderCues();
}

async function fetchCharacters() {
  characters = await api('/api/characters');
  renderCharacterDropdown();
}

// === Timecode Validation ===
function isValidTimecode(tc) {
  const match = tc.match(/^(\d{1,2}):(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return false;
  const [, h, m, s, f] = match.map(Number);
  return h >= 0 && h <= 99 && m >= 0 && m <= 59 && s >= 0 && s <= 59 && f >= 0 && f <= 29;
}

// === Field name helpers ===
const fieldLabels = {
  start_time: 'Start Time',
  end_time: 'End Time',
  dialog: 'Dialog',
  character_id: 'Character',
  reel: 'Reel',
  scene: 'Scene',
  cue_name: 'Cue Name',
  notes: 'Notes',
  status: 'Status',
  priority: 'Priority',
};

// === Render ===
function renderCharacterDropdown(selectEl, selectedId) {
  const target = selectEl || characterSelect;
  const currentVal = selectedId !== undefined ? String(selectedId) : target.value;
  const placeholder = target.querySelector('option[value=""]');
  target.innerHTML = '';
  if (placeholder) target.appendChild(placeholder);
  else {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Select character...';
    target.appendChild(opt);
  }
  characters.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    target.appendChild(opt);
  });
  if (currentVal) target.value = currentVal;
}

function getEditingRowValues() {
  if (editingCueId === null) return null;
  const row = cueTableBody.querySelector(`tr[data-id="${editingCueId}"]`);
  if (!row) return null;
  const startEl = row.querySelector('.edit-start');
  if (!startEl) return null;
  return {
    start_time: startEl.value,
    end_time: row.querySelector('.edit-end').value,
    dialog: row.querySelector('.edit-dialog').value,
    character_id: row.querySelector('.edit-character').value,
    reel: row.querySelector('.edit-reel').value,
    scene: row.querySelector('.edit-scene').value,
    cue_name: row.querySelector('.edit-cue-name').value,
    notes: row.querySelector('.edit-notes').value,
    status: row.querySelector('.edit-status').value,
    priority: row.querySelector('.edit-priority').value,
  };
}

function fieldChangedHint(field) {
  if (!changedFieldsByOther.includes(field)) return '';
  const editor = editorsMap[editingCueId];
  const who = editor ? editor.userName : 'Another user';
  return `<div class="field-changed-hint">Changed by ${escapeHtml(who)}</div>`;
}

function renderCues() {
  const savedEditValues = getEditingRowValues();
  cueTableBody.innerHTML = '';

  if (cues.length === 0) {
    noCuesMsg.style.display = 'block';
    cueTable.style.display = 'none';
    updateStatusBar();
    return;
  }

  noCuesMsg.style.display = 'none';
  cueTable.style.display = 'table';

  cues.forEach(cue => {
    const tr = document.createElement('tr');
    tr.dataset.id = cue.id;
    const editor = editorsMap[cue.id];
    const editedByOther = editor && editor.clientId !== sseClientId;

    if (selectedIds.has(cue.id)) {
      tr.classList.add('selected');
    }

    if (editingCueId === cue.id) {
      tr.classList.add('editing');
      const vals = savedEditValues || {
        reel: cue.reel || '',
        scene: cue.scene || '',
        cue_name: cue.cue_name || '',
        start_time: cue.start_time,
        end_time: cue.end_time,
        dialog: cue.dialog,
        character_id: cue.character_id,
        notes: cue.notes || '',
        status: cue.status || 'Spotted',
        priority: cue.priority || 'Medium',
      };

      const statusOpts = ['Spotted','Recorded','Approved','Rejected'].map(s =>
        `<option value="${s}"${vals.status === s ? ' selected' : ''}>${s}</option>`).join('');
      const prtyOpts = ['Low','Medium','High','Urgent'].map(p =>
        `<option value="${p}"${vals.priority === p ? ' selected' : ''}>${p}</option>`).join('');

      tr.innerHTML = `
        <td class="${changedFieldsByOther.includes('reel') ? 'field-changed' : ''}">
          <input type="text" class="edit-reel" value="${escapeHtml(vals.reel)}">
        </td>
        <td class="${changedFieldsByOther.includes('scene') ? 'field-changed' : ''}">
          <input type="text" class="edit-scene" value="${escapeHtml(vals.scene)}">
        </td>
        <td class="${changedFieldsByOther.includes('cue_name') ? 'field-changed' : ''}">
          <input type="text" class="edit-cue-name" value="${escapeHtml(vals.cue_name)}">
        </td>
        <td class="${changedFieldsByOther.includes('start_time') || changedFieldsByOther.includes('end_time') ? 'field-changed' : ''}">
          <input type="text" class="edit-start" value="${escapeHtml(vals.start_time)}" placeholder="Start">
          <input type="text" class="edit-end" value="${escapeHtml(vals.end_time)}" placeholder="End" style="margin-top:2px;">
        </td>
        <td class="${changedFieldsByOther.includes('character_id') ? 'field-changed' : ''}">
          <select class="edit-character"></select>
        </td>
        <td class="${changedFieldsByOther.includes('dialog') ? 'field-changed' : ''}">
          <textarea class="edit-dialog">${escapeHtml(vals.dialog)}</textarea>
          ${pendingConflictCueData ? '<div class="edit-warning">Updated by another user</div>' : ''}
        </td>
        <td class="${changedFieldsByOther.includes('notes') ? 'field-changed' : ''}">
          <textarea class="edit-notes">${escapeHtml(vals.notes)}</textarea>
        </td>
        <td>
          <select class="edit-status">${statusOpts}</select>
          <select class="edit-priority" style="margin-top:2px;">${prtyOpts}</select>
          <div class="inline-actions">
            <button class="save-edit-btn" data-id="${cue.id}">Save</button>
            <button class="btn-secondary cancel-edit-btn">Cancel</button>
          </div>
        </td>
      `;
      const editSelect = tr.querySelector('.edit-character');
      renderCharacterDropdown(editSelect, vals.character_id);
    } else {
      const badgeHtml = editedByOther
        ? `<span class="editing-badge">${escapeHtml(editor.userName)} editing</span>`
        : '';
      tr.innerHTML = `
        <td>${escapeHtml(cue.reel || '--')}</td>
        <td>${escapeHtml(cue.scene || '--')}</td>
        <td>${escapeHtml(cue.cue_name || '')}</td>
        <td>${escapeHtml(cue.start_time)}</td>
        <td>${escapeHtml(cue.character_name)}${badgeHtml}</td>
        <td>${escapeHtml(cue.dialog)}</td>
        <td>${escapeHtml(cue.notes || '')}</td>
        <td>${escapeHtml(cue.status || 'Spotted')}<br>${escapeHtml(cue.priority || 'Medium')}</td>
      `;
    }

    cueTableBody.appendChild(tr);
  });

  updateStatusBar();
}

function updateStatusBar() {
  const total = cues.length;
  const selCount = selectedIds.size;
  statusText.textContent = `${selCount} of ${total} selected`;
  // Notify native bridge if present
  if (window.nativeBridge && window.nativeBridge.onSelectionChanged) {
    window.nativeBridge.onSelectionChanged(selCount, total);
  }
}

function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getCharacterNameById(id) {
  const c = characters.find(ch => ch.id === id || ch.id === Number(id));
  return c ? c.name : 'Unknown';
}

// === Row Selection ===
cueTableBody.addEventListener('click', (e) => {
  const tr = e.target.closest('tr');
  if (!tr || !tr.dataset.id) return;

  // Don't select when clicking edit controls
  if (e.target.closest('button, input, textarea, select')) return;

  const id = tr.dataset.id;

  if (e.shiftKey && selectedIds.size > 0) {
    // Range select
    const allIds = cues.map(c => c.id);
    const lastSelected = [...selectedIds].pop();
    const fromIdx = allIds.indexOf(lastSelected);
    const toIdx = allIds.indexOf(id);
    if (fromIdx !== -1 && toIdx !== -1) {
      const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
      for (let i = start; i <= end; i++) {
        selectedIds.add(allIds[i]);
      }
    }
  } else if (e.metaKey || e.ctrlKey) {
    // Toggle single
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
  } else {
    // Single select
    selectedIds.clear();
    selectedIds.add(id);
  }

  renderCues();
});

// === Edit Status Broadcasting ===
async function notifyEditingStart(cueId) {
  try {
    await api(`/api/cues/${cueId}/editing`, {
      method: 'POST',
      body: JSON.stringify({ userName }),
    });
  } catch (e) { /* non-critical */ }
}

async function notifyEditingStop(cueId) {
  try {
    await api(`/api/cues/${cueId}/editing`, {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
  } catch (e) { /* non-critical */ }
}

// === Toast Notification ===
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// === Toolbar Actions ===
tbAdd.addEventListener('click', () => openCueModal());
tbDuplicate.addEventListener('click', () => duplicateSelectedCue());
tbEdit.addEventListener('click', () => editSelectedCue());
tbDelete.addEventListener('click', () => deleteSelectedCues());

function openCueModal(cue) {
  cueForm.reset();
  if (cue) {
    cueModalTitle.textContent = 'Edit Cue';
    submitBtn.textContent = 'Update Cue';
    cueIdInput.value = cue.id;
    cueUpdatedAtInput.value = cue.updated_at;
    inputReel.value = cue.reel || '';
    inputScene.value = cue.scene || '';
    inputCueName.value = cue.cue_name || '';
    startTimeInput.value = cue.start_time;
    endTimeInput.value = cue.end_time;
    characterSelect.value = cue.character_id;
    dialogInput.value = cue.dialog;
    inputNotes.value = cue.notes || '';
    inputStatus.value = cue.status || 'Spotted';
    inputPriority.value = cue.priority || 'Medium';
  } else {
    cueModalTitle.textContent = 'Add Cue';
    submitBtn.textContent = 'Add Cue';
    cueIdInput.value = '';
    cueUpdatedAtInput.value = '';
  }
  cueModal.style.display = 'flex';
  if (cue) startTimeInput.focus();
  else inputReel.focus();
}

cueModalCancel.addEventListener('click', () => {
  cueModal.style.display = 'none';
});

cueModal.addEventListener('click', (e) => {
  if (e.target === cueModal) cueModal.style.display = 'none';
});

function duplicateSelectedCue() {
  if (selectedIds.size !== 1) {
    showToast('Select exactly one cue to duplicate');
    return;
  }
  const id = [...selectedIds][0];
  const cue = cues.find(c => c.id === id);
  if (!cue) return;
  // Open add modal pre-filled with cue data but no ID
  cueForm.reset();
  cueModalTitle.textContent = 'Add Cue (Duplicate)';
  submitBtn.textContent = 'Add Cue';
  cueIdInput.value = '';
  cueUpdatedAtInput.value = '';
  inputReel.value = cue.reel || '';
  inputScene.value = cue.scene || '';
  inputCueName.value = cue.cue_name || '';
  startTimeInput.value = cue.start_time;
  endTimeInput.value = cue.end_time;
  characterSelect.value = cue.character_id;
  dialogInput.value = cue.dialog;
  inputNotes.value = cue.notes || '';
  inputStatus.value = cue.status || 'Spotted';
  inputPriority.value = cue.priority || 'Medium';
  cueModal.style.display = 'flex';
  inputReel.focus();
}

function editSelectedCue() {
  if (selectedIds.size !== 1) {
    showToast('Select exactly one cue to edit');
    return;
  }
  const id = [...selectedIds][0];
  const cue = cues.find(c => c.id === id);
  if (!cue) return;

  if (editingCueId !== null && editingCueId !== id) {
    notifyEditingStop(editingCueId);
  }
  editingCueId = id;
  editingBaseCue = { ...cue };
  pendingConflictCueData = null;
  changedFieldsByOther = [];
  notifyEditingStart(id);
  renderCues();
}

function deleteSelectedCues() {
  if (selectedIds.size === 0) {
    showToast('Select at least one cue to delete');
    return;
  }
  const ids = [...selectedIds];
  const count = ids.length;
  const firstCue = cues.find(c => c.id === ids[0]);
  const preview = count === 1
    ? `Delete cue "${(firstCue.dialog || '').substring(0, 40)}..."?`
    : `Delete ${count} selected cues?`;

  // Check if any are being edited by others
  const editWarnings = ids
    .map(id => editorsMap[id])
    .filter(e => e && e.clientId !== sseClientId)
    .map(e => e.userName);
  const extra = editWarnings.length > 0
    ? `\n\n${editWarnings.join(', ')} ${editWarnings.length === 1 ? 'is' : 'are'} currently editing.`
    : '';

  showConfirm('Delete Cue', preview + extra, async () => {
    try {
      for (const id of ids) {
        await api(`/api/cues/${id}`, { method: 'DELETE', body: JSON.stringify({}) });
      }
      selectedIds.clear();
      await fetchCues();
    } catch (err) {
      alert(err.message);
    }
  });
}

// === Cue Form Submit (modal) ===
cueForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const startTime = startTimeInput.value.trim();
  const endTime = endTimeInput.value.trim();
  const dialog = dialogInput.value.trim();
  const characterId = characterSelect.value;

  if (!isValidTimecode(startTime)) {
    alert('Invalid start time. Use format HH:MM:SS:FF (FF: 00-29)');
    startTimeInput.focus();
    return;
  }
  if (!isValidTimecode(endTime)) {
    alert('Invalid end time. Use format HH:MM:SS:FF (FF: 00-29)');
    endTimeInput.focus();
    return;
  }
  if (!dialog) {
    alert('Dialog is required');
    dialogInput.focus();
    return;
  }
  if (!characterId) {
    alert('Please select a character');
    characterSelect.focus();
    return;
  }

  const body = {
    start_time: startTime,
    end_time: endTime,
    dialog,
    character_id: characterId,
    reel: inputReel.value.trim(),
    scene: inputScene.value.trim(),
    cue_name: inputCueName.value.trim(),
    notes: inputNotes.value.trim(),
    status: inputStatus.value,
    priority: inputPriority.value,
  };

  try {
    if (cueIdInput.value) {
      body.updated_at = cueUpdatedAtInput.value;
      if (editingBaseCue) {
        body.baseCue = editingBaseCue;
      }
      const result = await api(`/api/cues/${cueIdInput.value}`, { method: 'PUT', body: JSON.stringify(body) });
      if (result.merged) {
        showToast(`Auto-merged with other user's changes (${result.mergedFields.map(f => fieldLabels[f]).join(', ')})`);
      }
    } else {
      await api('/api/cues', { method: 'POST', body: JSON.stringify(body) });
    }
    cueModal.style.display = 'none';
    editingCueId = null;
    editingBaseCue = null;
    pendingConflictCueData = null;
    changedFieldsByOther = [];
    await fetchCues();
  } catch (err) {
    if (err.serverCue) {
      cueModal.style.display = 'none';
      showConflictModal(body, err.serverCue, err.conflictingFields);
    } else {
      alert(err.message);
    }
  }
});

// === Table Inline Edit Actions (event delegation) ===
cueTableBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  const id = btn.dataset.id;

  if (btn.classList.contains('save-edit-btn')) {
    e.stopPropagation();
    await saveInlineEdit(id);
  } else if (btn.classList.contains('cancel-edit-btn')) {
    e.stopPropagation();
    const prevId = editingCueId;
    editingCueId = null;
    editingBaseCue = null;
    pendingConflictCueData = null;
    changedFieldsByOther = [];
    if (prevId) notifyEditingStop(prevId);
    renderCues();
  }
});

// Double-click to edit
cueTableBody.addEventListener('dblclick', (e) => {
  if (e.target.closest('button, input, textarea, select')) return;
  const tr = e.target.closest('tr');
  if (!tr || !tr.dataset.id) return;
  const id = tr.dataset.id;
  const cue = cues.find(c => c.id === id);
  if (!cue) return;

  if (editingCueId !== null && editingCueId !== id) {
    notifyEditingStop(editingCueId);
  }
  editingCueId = id;
  editingBaseCue = { ...cue };
  pendingConflictCueData = null;
  changedFieldsByOther = [];
  notifyEditingStart(id);
  renderCues();
});

async function saveInlineEdit(id) {
  const row = cueTableBody.querySelector(`tr[data-id="${id}"]`);
  if (!row) return;

  const startTime = row.querySelector('.edit-start').value.trim();
  const endTime = row.querySelector('.edit-end').value.trim();
  const dialog = row.querySelector('.edit-dialog').value.trim();
  const characterId = row.querySelector('.edit-character').value;
  const cue = cues.find(c => c.id === id);

  if (!isValidTimecode(startTime)) { alert('Invalid start time format'); return; }
  if (!isValidTimecode(endTime)) { alert('Invalid end time format'); return; }
  if (!dialog) { alert('Dialog is required'); return; }
  if (!characterId) { alert('Please select a character'); return; }

  const myChanges = {
    start_time: startTime,
    end_time: endTime,
    dialog,
    character_id: characterId,
    reel: row.querySelector('.edit-reel').value.trim(),
    scene: row.querySelector('.edit-scene').value.trim(),
    cue_name: row.querySelector('.edit-cue-name').value.trim(),
    notes: row.querySelector('.edit-notes').value.trim(),
    status: row.querySelector('.edit-status').value,
    priority: row.querySelector('.edit-priority').value,
    updated_at: editingBaseCue ? editingBaseCue.updated_at : cue.updated_at,
  };

  if (editingBaseCue) {
    myChanges.baseCue = editingBaseCue;
  }

  try {
    const result = await api(`/api/cues/${id}`, {
      method: 'PUT',
      body: JSON.stringify(myChanges),
    });
    notifyEditingStop(id);
    editingCueId = null;
    editingBaseCue = null;
    pendingConflictCueData = null;
    changedFieldsByOther = [];
    if (result.merged) {
      showToast(`Auto-merged with other user's changes (${result.mergedFields.map(f => fieldLabels[f]).join(', ')})`);
    }
    await fetchCues();
  } catch (err) {
    if (err.serverCue) {
      showConflictModal(myChanges, err.serverCue, err.conflictingFields);
    } else {
      alert(err.message);
    }
  }
}

// === Conflict Resolution Modal ===
let conflictMyChanges = null;
let conflictServerCue = null;
let conflictFields = null;

function showConflictModal(myChanges, serverCue, conflictingFields) {
  conflictMyChanges = myChanges;
  conflictServerCue = serverCue;
  conflictFields = conflictingFields;

  const headerEl = conflictModal.querySelector('h3');
  const descEl = conflictModal.querySelector('p');
  const mergedInfoEl = document.getElementById('conflict-merged-info');

  if (conflictingFields && conflictingFields.length > 0) {
    const fieldNames = conflictingFields.map(f => fieldLabels[f] || f).join(', ');
    headerEl.textContent = `Conflict on: ${fieldNames}`;
    const allFields = ['start_time', 'end_time', 'dialog', 'character_id', 'reel', 'scene', 'cue_name', 'notes', 'status', 'priority'];
    const autoMerged = allFields.filter(f => !conflictingFields.includes(f));
    if (autoMerged.length > 0) {
      mergedInfoEl.textContent = `Auto-merged: ${autoMerged.map(f => fieldLabels[f] || f).join(', ')}`;
      mergedInfoEl.style.display = 'block';
    } else {
      mergedInfoEl.style.display = 'none';
    }
    descEl.textContent = 'Both users changed the same field(s) to different values.';
  } else {
    headerEl.textContent = 'Edit Conflict';
    descEl.textContent = 'This cue was modified by another user while you were editing it.';
    mergedInfoEl.style.display = 'none';
  }

  const fields = [
    { key: 'start_time', myEl: 'conflict-my-start', serverEl: 'conflict-server-start', myVal: myChanges.start_time, serverVal: serverCue.start_time },
    { key: 'end_time', myEl: 'conflict-my-end', serverEl: 'conflict-server-end', myVal: myChanges.end_time, serverVal: serverCue.end_time },
    { key: 'character_id', myEl: 'conflict-my-character', serverEl: 'conflict-server-character', myVal: getCharacterNameById(myChanges.character_id), serverVal: serverCue.character_name },
    { key: 'dialog', myEl: 'conflict-my-dialog', serverEl: 'conflict-server-dialog', myVal: myChanges.dialog, serverVal: serverCue.dialog },
  ];

  fields.forEach(({ key, myEl, serverEl, myVal, serverVal }) => {
    const my = document.getElementById(myEl);
    const server = document.getElementById(serverEl);
    my.textContent = myVal;
    server.textContent = serverVal;

    const isConflict = conflictingFields
      ? conflictingFields.includes(key)
      : myVal !== serverVal;
    my.classList.toggle('conflict-diff', isConflict);
    server.classList.toggle('conflict-diff', isConflict);

    const myField = my.closest('.conflict-field');
    const serverField = server.closest('.conflict-field');
    if (conflictingFields && !conflictingFields.includes(key)) {
      myField.style.display = 'none';
      serverField.style.display = 'none';
    } else {
      myField.style.display = '';
      serverField.style.display = '';
    }
  });

  conflictModal.style.display = 'flex';
}

conflictSaveMine.addEventListener('click', async () => {
  conflictModal.style.display = 'none';
  if (!conflictMyChanges || !conflictServerCue) return;

  const body = {
    start_time: conflictMyChanges.start_time,
    end_time: conflictMyChanges.end_time,
    dialog: conflictMyChanges.dialog,
    character_id: conflictMyChanges.character_id,
    reel: conflictMyChanges.reel,
    scene: conflictMyChanges.scene,
    cue_name: conflictMyChanges.cue_name,
    notes: conflictMyChanges.notes,
    status: conflictMyChanges.status,
    priority: conflictMyChanges.priority,
    updated_at: conflictServerCue.updated_at,
  };

  try {
    await api(`/api/cues/${conflictServerCue.id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (editingCueId) notifyEditingStop(editingCueId);
    editingCueId = null;
    editingBaseCue = null;
    pendingConflictCueData = null;
    changedFieldsByOther = [];
    await fetchCues();
  } catch (err) {
    alert('Save failed: ' + err.message);
  }
  conflictMyChanges = null;
  conflictServerCue = null;
  conflictFields = null;
});

conflictDiscard.addEventListener('click', async () => {
  conflictModal.style.display = 'none';
  if (editingCueId) notifyEditingStop(editingCueId);
  editingCueId = null;
  editingBaseCue = null;
  pendingConflictCueData = null;
  changedFieldsByOther = [];
  conflictMyChanges = null;
  conflictServerCue = null;
  conflictFields = null;
  await fetchCues();
});

// === Character Modal ===
addCharacterBtn.addEventListener('click', () => {
  characterModal.style.display = 'flex';
  characterNameInput.value = '';
  characterNameInput.focus();
});

characterModalCancel.addEventListener('click', () => {
  characterModal.style.display = 'none';
});

characterModal.addEventListener('click', (e) => {
  if (e.target === characterModal) characterModal.style.display = 'none';
});

characterForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = characterNameInput.value.trim();
  if (!name) return;

  try {
    const character = await api('/api/characters', { method: 'POST', body: JSON.stringify({ name }) });
    characterModal.style.display = 'none';
    await fetchCharacters();
    characterSelect.value = character.id;
  } catch (err) {
    alert(err.message);
  }
});

// === Confirm Modal ===
let confirmCallback = null;

function showConfirm(title, message, onConfirm) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmCallback = onConfirm;
  confirmModal.style.display = 'flex';
}

confirmYes.addEventListener('click', async () => {
  confirmModal.style.display = 'none';
  if (confirmCallback) await confirmCallback();
  confirmCallback = null;
});

confirmNo.addEventListener('click', () => {
  confirmModal.style.display = 'none';
  confirmCallback = null;
});

confirmModal.addEventListener('click', (e) => {
  if (e.target === confirmModal) {
    confirmModal.style.display = 'none';
    confirmCallback = null;
  }
});

// === Keyboard Shortcuts ===
document.addEventListener('keydown', (e) => {
  // Don't handle shortcuts when in modals or editing inputs
  const inModal = document.querySelector('.modal-overlay[style*="flex"]');
  const inInput = e.target.closest('input, textarea, select');

  if (e.key === 'Escape') {
    if (inModal) {
      inModal.style.display = 'none';
      return;
    }
    if (editingCueId) {
      const prevId = editingCueId;
      editingCueId = null;
      editingBaseCue = null;
      pendingConflictCueData = null;
      changedFieldsByOther = [];
      if (prevId) notifyEditingStop(prevId);
      renderCues();
      return;
    }
  }

  if (inModal || inInput) return;

  if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
    e.preventDefault();
    openCueModal();
  } else if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
    e.preventDefault();
    duplicateSelectedCue();
  } else if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
    e.preventDefault();
    editSelectedCue();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedIds.size > 0) {
      e.preventDefault();
      deleteSelectedCues();
    }
  } else if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
    e.preventDefault();
    selectedIds = new Set(cues.map(c => c.id));
    renderCues();
  }
});

// === SSE / Event Handling ===

// Shared handler for incoming events (from SSE or native bridge)
function handleIncomingEvent(data) {
  // Skip own events (only relevant for SSE mode)
  if (data.originClientId === sseClientId) return;

  if (data.type === 'editing-start') {
    editorsMap[data.cueId] = { userName: data.userName, clientId: data.originClientId };
    renderCues();
    return;
  }

  if (data.type === 'editing-stop') {
    delete editorsMap[data.cueId];
    renderCues();
    return;
  }

  if (data.type === 'connection-status') {
    console.log('[Event] Connection status:', data.online);
    const dot = document.getElementById('connection-status');
    dot.classList.toggle('conn-online', data.online === true);
    dot.classList.toggle('conn-offline', data.online !== true);
    dot.title = data.online ? 'Connected to server' : 'Offline';
    return;
  }

  if (data.type === 'sync-progress' || data.type === 'sync-complete') {
    return;
  }

  if (data.entity === 'character') {
    fetchCharacters();
  }

  // If someone deleted the cue we're editing, exit edit mode and notify
  if (editingCueId !== null && data.type === 'deleted' && data.entity === 'cue' && data.id === editingCueId) {
    editingCueId = null;
    editingBaseCue = null;
    pendingConflictCueData = null;
    changedFieldsByOther = [];
    showToast('The cue you were editing was deleted by another user');
    fetchCues();
    return;
  }

  // If we're editing the cue that was just updated, preserve edits + highlight changed fields
  if (editingCueId !== null && data.type === 'updated' && data.id === editingCueId) {
    api(`/api/cues/${data.id}`).then(serverCue => {
      pendingConflictCueData = serverCue;
      if (editingBaseCue) {
        changedFieldsByOther = [];
        const fields = ['start_time', 'end_time', 'dialog', 'character_id', 'reel', 'scene', 'cue_name', 'notes', 'status', 'priority'];
        for (const field of fields) {
          if (String(serverCue[field] ?? '') !== String(editingBaseCue[field] ?? '')) {
            changedFieldsByOther.push(field);
          }
        }
      }
      const idx = cues.findIndex(c => c.id === data.id);
      if (idx !== -1) cues[idx] = serverCue;
      renderCues();
    }).catch(() => {});
    return;
  }

  fetchCues();
}

// Native bridge handler — called by Swift via evaluateJavaScript
window._nativeSSEHandler = function(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    console.log('[NativeBridge] Event:', data.type || data.entity || 'unknown');
    handleIncomingEvent(data);
  } catch (e) {
    console.error('[NativeBridge] Parse error:', e);
  }
};

function connectSSE() {
  const isNative = !!window.NATIVE_API_BASE;

  if (isNative) {
    // Desktop app: use native bridge for events, generate a local client ID
    sseClientId = 'native-' + Math.random().toString(36).substr(2, 9);
    console.log('[Event] Using native bridge for events, clientId:', sseClientId);
    // Check initial connection status
    api('/api/health').then(health => {
      const online = health.mode === 'online' || health.mode === 'syncing';
      handleIncomingEvent({ type: 'connection-status', online: online, originClientId: 'system' });
    }).catch(() => {});
    return;
  }

  // Web browser: use EventSource
  const evtSource = new EventSource(API_BASE + '/api/events');

  evtSource.addEventListener('connected', (e) => {
    const data = JSON.parse(e.data);
    sseClientId = data.clientId;
    // Update connection indicator
    const dot = document.getElementById('connection-status');
    dot.classList.remove('conn-offline');
    dot.classList.add('conn-online');
    dot.title = 'Connected';

    if (data.editingState) {
      for (const [cueId, entry] of Object.entries(data.editingState)) {
        if (entry.clientId !== sseClientId) {
          editorsMap[cueId] = entry;
        }
      }
      renderCues();
    }
  });

  evtSource.addEventListener('update', (e) => {
    const data = JSON.parse(e.data);
    handleIncomingEvent(data);
  });

  evtSource.onerror = () => {
    const dot = document.getElementById('connection-status');
    dot.classList.remove('conn-online');
    dot.classList.add('conn-offline');
    dot.title = 'Disconnected';
  };
}

// === Name Prompt & User Info ===
const userInfo = document.getElementById('user-info');
const userDisplay = document.getElementById('user-display');
const logoutBtn = document.getElementById('logout-btn');

function showUserInfo() {
  userDisplay.textContent = userName;
  userInfo.style.display = 'flex';
}

function promptForName() {
  return new Promise((resolve) => {
    const sessionName = sessionStorage.getItem('userName');
    if (sessionName) {
      userName = sessionName;
      showUserInfo();
      resolve();
      return;
    }
    const lastUsed = localStorage.getItem('userName');
    if (lastUsed) {
      userNameInput.value = lastUsed;
    }
    nameModal.style.display = 'flex';
    nameForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = userNameInput.value.trim();
      if (!name) return;
      userName = name;
      sessionStorage.setItem('userName', name);
      localStorage.setItem('userName', name);
      nameModal.style.display = 'none';
      showUserInfo();
      resolve();
    }, { once: true });
  });
}

logoutBtn.addEventListener('click', () => {
  if (editingCueId !== null) {
    notifyEditingStop(editingCueId);
    editingCueId = null;
    editingBaseCue = null;
    pendingConflictCueData = null;
    changedFieldsByOther = [];
  }
  sessionStorage.removeItem('userName');
  userName = null;
  userInfo.style.display = 'none';
  promptForName().then(() => {
    fetchCues();
    fetchCharacters();
  });
});

// === Native Bridge ===
window.nativeBridge = window.nativeBridge || {};
window.nativeBridge.triggerToolbarAction = function(action) {
  switch (action) {
    case 'add': openCueModal(); break;
    case 'duplicate': duplicateSelectedCue(); break;
    case 'edit': editSelectedCue(); break;
    case 'delete': deleteSelectedCues(); break;
  }
};
window.nativeBridge.setConnectionStatus = function(status) {
  const dot = document.getElementById('connection-status');
  dot.classList.toggle('conn-online', status === 'online');
  dot.classList.toggle('conn-offline', status !== 'online');
  dot.title = status === 'online' ? 'Connected' : 'Disconnected';
};

// === Init ===
async function init() {
  await promptForName();
  await Promise.all([fetchCues(), fetchCharacters()]);
  connectSSE();
}

init();
