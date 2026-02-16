// === State ===
let cues = [];
let characters = [];
let editingCueId = null;
let sseClientId = null;

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

// Character modal
const characterModal = document.getElementById('character-modal');
const characterForm = document.getElementById('character-form');
const characterNameInput = document.getElementById('character-name');
const characterModalCancel = document.getElementById('character-modal-cancel');

// Confirm modal
const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmYes = document.getElementById('confirm-yes');
const confirmNo = document.getElementById('confirm-no');

// === API Helpers ===
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify({ ...JSON.parse(options.body), clientId: sseClientId }) : undefined,
  });
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

// === Render ===
function renderCharacterDropdown(selectEl, selectedId) {
  const target = selectEl || characterSelect;
  const currentVal = selectedId !== undefined ? String(selectedId) : target.value;
  // Keep the placeholder option
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

function renderCues() {
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

    if (editingCueId === cue.id) {
      tr.classList.add('editing');
      tr.innerHTML = `
        <td><input type="text" class="edit-start" value="${escapeHtml(cue.start_time)}"></td>
        <td><input type="text" class="edit-end" value="${escapeHtml(cue.end_time)}"></td>
        <td><select class="edit-character"></select></td>
        <td><textarea class="edit-dialog">${escapeHtml(cue.dialog)}</textarea></td>
        <td><div class="actions-cell">
          <button class="btn-small save-edit-btn" data-id="${cue.id}">Save</button>
          <button class="btn-small btn-secondary cancel-edit-btn">Cancel</button>
        </div></td>
      `;
      // Populate the character dropdown in the edit row
      const editSelect = tr.querySelector('.edit-character');
      renderCharacterDropdown(editSelect, cue.character_id);
    } else {
      tr.innerHTML = `
        <td>${escapeHtml(cue.start_time)}</td>
        <td>${escapeHtml(cue.end_time)}</td>
        <td>${escapeHtml(cue.character_name)}</td>
        <td>${escapeHtml(cue.dialog)}</td>
        <td><div class="actions-cell">
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
      // Update
      body.updated_at = cueUpdatedAtInput.value;
      await api(`/api/cues/${cueIdInput.value}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      // Create
      await api('/api/cues', { method: 'POST', body: JSON.stringify(body) });
    }
    resetForm();
    await fetchCues();
  } catch (err) {
    alert(err.message);
  }
});

function resetForm() {
  cueForm.reset();
  cueIdInput.value = '';
  cueUpdatedAtInput.value = '';
  editingCueId = null;
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
    editingCueId = id;
    renderCues();
  } else if (btn.classList.contains('cancel-edit-btn')) {
    editingCueId = null;
    renderCues();
  } else if (btn.classList.contains('save-edit-btn')) {
    await saveInlineEdit(id);
  } else if (btn.classList.contains('delete-btn')) {
    const cue = cues.find(c => c.id === id);
    showConfirm(
      'Delete Cue',
      `Delete cue at ${cue.start_time} - "${cue.dialog.substring(0, 50)}..."?`,
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

  try {
    await api(`/api/cues/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        start_time: startTime,
        end_time: endTime,
        dialog,
        character_id: characterId,
        updated_at: cue.updated_at,
      }),
    });
    editingCueId = null;
    await fetchCues();
  } catch (err) {
    alert(err.message);
  }
}

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
  });

  evtSource.addEventListener('update', (e) => {
    const data = JSON.parse(e.data);
    // Skip events we originated
    if (data.originClientId === sseClientId) return;
    // Refresh data
    if (data.entity === 'character') {
      fetchCharacters();
    }
    fetchCues();
  });

  evtSource.onerror = () => {
    // EventSource auto-reconnects
  };
}

// === Init ===
async function init() {
  await Promise.all([fetchCues(), fetchCharacters()]);
  connectSSE();
}

init();
