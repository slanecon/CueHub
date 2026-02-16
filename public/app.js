// === State ===
let cues = [];
let characters = [];
let editingCueId = null;
let editingBaseCue = null; // Snapshot of cue when editing started (for 3-way merge)
let sseClientId = null;
let userName = null;
const editorsMap = {};
let pendingConflictCueData = null;
// Track which fields changed by the other user (for highlighting during editing)
let changedFieldsByOther = [];

// === DOM Elements ===
const cueForm = document.getElementById('cue-form');
const formTitle = document.getElementById('form-title');
const cueIdInput = document.getElementById('cue-id');
const cueUpdatedAtInput = document.getElementById('cue-updated-at');
const startTimeInput = document.getElementById('start-time');
const endTimeInput = document.getElementById('end-time');
const dialogInput = document.getElementById('dialog');
const characterSelect = document.getElementById('character-select');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const addCharacterBtn = document.getElementById('add-character-btn');
const cueTableBody = document.getElementById('cue-table-body');
const noCuesMsg = document.getElementById('no-cues');

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

// === API Helpers ===
async function api(url, options = {}) {
  const res = await fetch(url, {
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
    document.getElementById('cue-table').style.display = 'none';
    return;
  }

  noCuesMsg.style.display = 'none';
  document.getElementById('cue-table').style.display = 'table';

  cues.forEach(cue => {
    const tr = document.createElement('tr');
    tr.dataset.id = cue.id;
    const editor = editorsMap[cue.id];
    const editedByOther = editor && editor.clientId !== sseClientId;

    if (editingCueId === cue.id) {
      tr.classList.add('editing');
      const vals = savedEditValues || {
        start_time: cue.start_time,
        end_time: cue.end_time,
        dialog: cue.dialog,
        character_id: cue.character_id,
      };
      const startChanged = changedFieldsByOther.includes('start_time') ? ' field-changed' : '';
      const endChanged = changedFieldsByOther.includes('end_time') ? ' field-changed' : '';
      const charChanged = changedFieldsByOther.includes('character_id') ? ' field-changed' : '';
      const dialogChanged = changedFieldsByOther.includes('dialog') ? ' field-changed' : '';

      tr.innerHTML = `
        <td class="${startChanged}">
          <input type="text" class="edit-start" value="${escapeHtml(vals.start_time)}">
          ${fieldChangedHint('start_time')}
        </td>
        <td class="${endChanged}">
          <input type="text" class="edit-end" value="${escapeHtml(vals.end_time)}">
          ${fieldChangedHint('end_time')}
        </td>
        <td class="${charChanged}">
          <select class="edit-character"></select>
          ${fieldChangedHint('character_id')}
        </td>
        <td class="${dialogChanged}">
          <textarea class="edit-dialog">${escapeHtml(vals.dialog)}</textarea>
          ${pendingConflictCueData ? '<div class="edit-warning">This cue was updated by another user</div>' : ''}
          ${fieldChangedHint('dialog')}
        </td>
        <td><div class="actions-cell">
          <button class="btn-small save-edit-btn" data-id="${cue.id}">Save</button>
          <button class="btn-small btn-secondary cancel-edit-btn">Cancel</button>
        </div></td>
      `;
      const editSelect = tr.querySelector('.edit-character');
      renderCharacterDropdown(editSelect, vals.character_id);
    } else {
      const badgeHtml = editedByOther
        ? `<span class="editing-badge">${escapeHtml(editor.userName)} is editing</span>`
        : '';
      tr.innerHTML = `
        <td>${escapeHtml(cue.start_time)}</td>
        <td>${escapeHtml(cue.end_time)}</td>
        <td>${escapeHtml(cue.character_name)}</td>
        <td>${escapeHtml(cue.dialog)}</td>
        <td><div class="actions-cell">
          ${badgeHtml}
          <button class="btn-small edit-btn" data-id="${cue.id}">Edit</button>
          <button class="btn-small btn-danger delete-btn" data-id="${cue.id}">Delete</button>
        </div></td>
      `;
    }

    cueTableBody.appendChild(tr);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getCharacterNameById(id) {
  const c = characters.find(ch => ch.id === Number(id));
  return c ? c.name : 'Unknown';
}

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

// === Cue Form ===
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

  const body = { start_time: startTime, end_time: endTime, dialog, character_id: Number(characterId) };

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
    resetForm();
    await fetchCues();
  } catch (err) {
    if (err.serverCue) {
      showConflictModal(body, err.serverCue, err.conflictingFields);
    } else {
      alert(err.message);
    }
  }
});

function resetForm() {
  cueForm.reset();
  cueIdInput.value = '';
  cueUpdatedAtInput.value = '';
  editingCueId = null;
  editingBaseCue = null;
  pendingConflictCueData = null;
  changedFieldsByOther = [];
  formTitle.textContent = 'Add Cue';
  submitBtn.textContent = 'Add Cue';
  cancelBtn.style.display = 'none';
}

function loadCueIntoForm(cue) {
  formTitle.textContent = 'Edit Cue';
  submitBtn.textContent = 'Update Cue';
  cancelBtn.style.display = 'inline-block';
  cueIdInput.value = cue.id;
  cueUpdatedAtInput.value = cue.updated_at;
  startTimeInput.value = cue.start_time;
  endTimeInput.value = cue.end_time;
  dialogInput.value = cue.dialog;
  characterSelect.value = cue.character_id;
  startTimeInput.focus();
}

cancelBtn.addEventListener('click', () => {
  resetForm();
  renderCues();
});

// === Table Actions (event delegation) ===
cueTableBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  const id = Number(btn.dataset.id);

  if (btn.classList.contains('edit-btn')) {
    if (editingCueId !== null && editingCueId !== id) {
      notifyEditingStop(editingCueId);
    }
    const cue = cues.find(c => c.id === id);
    editingCueId = id;
    editingBaseCue = { ...cue }; // Snapshot for 3-way merge
    pendingConflictCueData = null;
    changedFieldsByOther = [];
    notifyEditingStart(id);
    renderCues();
  } else if (btn.classList.contains('cancel-edit-btn')) {
    const prevId = editingCueId;
    editingCueId = null;
    editingBaseCue = null;
    pendingConflictCueData = null;
    changedFieldsByOther = [];
    if (prevId) notifyEditingStop(prevId);
    renderCues();
  } else if (btn.classList.contains('save-edit-btn')) {
    await saveInlineEdit(id);
  } else if (btn.classList.contains('delete-btn')) {
    const cue = cues.find(c => c.id === id);
    const editor = editorsMap[id];
    const editWarning = (editor && editor.clientId !== sseClientId)
      ? `\n\n${editor.userName} is currently editing this cue.`
      : '';
    showConfirm(
      'Delete Cue',
      `Delete cue at ${cue.start_time} - "${cue.dialog.substring(0, 50)}..."?${editWarning}`,
      async () => {
        try {
          await api(`/api/cues/${id}`, { method: 'DELETE', body: JSON.stringify({}) });
          await fetchCues();
        } catch (err) {
          alert(err.message);
        }
      }
    );
  }
});

async function saveInlineEdit(id) {
  const row = cueTableBody.querySelector(`tr[data-id="${id}"]`);
  if (!row) return;

  const startTime = row.querySelector('.edit-start').value.trim();
  const endTime = row.querySelector('.edit-end').value.trim();
  const dialog = row.querySelector('.edit-dialog').value.trim();
  const characterId = Number(row.querySelector('.edit-character').value);
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
    const fieldNames = conflictingFields.map(f => fieldLabels[f]).join(', ');
    headerEl.textContent = `Conflict on: ${fieldNames}`;
    // Show which fields were auto-merged
    const allFields = ['start_time', 'end_time', 'dialog', 'character_id'];
    const autoMerged = allFields.filter(f => !conflictingFields.includes(f));
    if (autoMerged.length > 0) {
      mergedInfoEl.textContent = `Auto-merged: ${autoMerged.map(f => fieldLabels[f]).join(', ')}`;
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

  // Show all fields but only highlight conflicting ones
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

    // Hide non-conflicting field rows when we have specific conflict info
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
    resetForm();
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
  resetForm();
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

// === SSE ===
function connectSSE() {
  const evtSource = new EventSource('/api/events');

  evtSource.addEventListener('connected', (e) => {
    const data = JSON.parse(e.data);
    sseClientId = data.clientId;
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

    if (data.entity === 'character') {
      fetchCharacters();
    }

    // If someone deleted the cue we're editing, exit edit mode and notify
    if (editingCueId !== null && data.type === 'deleted' && data.entity === 'cue' && data.id === editingCueId) {
      editingCueId = null;
      editingBaseCue = null;
      pendingConflictCueData = null;
      changedFieldsByOther = [];
      resetForm();
      showToast('The cue you were editing was deleted by another user');
      fetchCues();
      return;
    }

    // If we're editing the cue that was just updated, preserve edits + highlight changed fields
    if (editingCueId !== null && data.type === 'updated' && data.id === editingCueId) {
      api(`/api/cues/${data.id}`).then(serverCue => {
        pendingConflictCueData = serverCue;
        // Compare server cue against our base to find which fields the other user changed
        if (editingBaseCue) {
          changedFieldsByOther = [];
          const fields = ['start_time', 'end_time', 'dialog', 'character_id'];
          for (const field of fields) {
            if (String(serverCue[field]) !== String(editingBaseCue[field])) {
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
  });

  evtSource.onerror = () => {};
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
  resetForm();
  sessionStorage.removeItem('userName');
  userName = null;
  userInfo.style.display = 'none';
  promptForName().then(() => {
    fetchCues();
    fetchCharacters();
  });
});

// === Init ===
async function init() {
  await promptForName();
  await Promise.all([fetchCues(), fetchCharacters()]);
  connectSSE();
}

init();
