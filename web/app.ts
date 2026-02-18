import type { Cue, Character, EditorEntry, SSEEvent, CueResponse, HealthResponse } from '../shared/types';

// === Window extensions ===
declare global {
  interface Window {
    NATIVE_API_BASE?: string;
    _nativeSSEHandler?: (json: string) => void;
    nativeBridge?: {
      triggerToolbarAction?: (action: string) => void;
      setConnectionStatus?: (status: string) => void;
      onSelectionChanged?: (selected: number, total: number) => void;
    };
  }
}

// Custom error for 409 conflict responses
class ConflictError extends Error {
  serverCue: Cue;
  conflictingFields: string[] | null;
  constructor(serverCue: Cue, conflictingFields: string[] | null) {
    super('conflict');
    this.serverCue = serverCue;
    this.conflictingFields = conflictingFields;
  }
}

// === Config ===
const API_BASE = window.NATIVE_API_BASE ?? '';

// === State ===
let cues: Cue[] = [];
let characters: Character[] = [];
let editingCueId: string | null = null;
let editingBaseCue: Cue | null = null;
let sseClientId: string | null = null;
let userName: string | null = null;
const editorsMap: Record<string, EditorEntry> = {};
let pendingConflictCueData: Cue | null = null;
let changedFieldsByOther: string[] = [];
let selectedIds = new Set<string>();

// === DOM Elements ===
const cueTableBody = document.getElementById('cue-table-body') as HTMLTableSectionElement;
const noCuesMsg = document.getElementById('no-cues') as HTMLElement;
const cueTable = document.getElementById('cue-table') as HTMLElement;
const statusText = document.getElementById('status-text') as HTMLElement;

// Cue modal elements
const cueModal = document.getElementById('cue-modal') as HTMLElement;
const cueModalTitle = document.getElementById('cue-modal-title') as HTMLElement;
const cueForm = document.getElementById('cue-form') as HTMLFormElement;
const cueIdInput = document.getElementById('cue-id') as HTMLInputElement;
const cueUpdatedAtInput = document.getElementById('cue-updated-at') as HTMLInputElement;
const startTimeInput = document.getElementById('start-time') as HTMLInputElement;
const endTimeInput = document.getElementById('end-time') as HTMLInputElement;
const dialogInput = document.getElementById('dialog') as HTMLTextAreaElement;
const characterSelect = document.getElementById('character-select') as HTMLSelectElement;
const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;
const cueModalCancel = document.getElementById('cue-modal-cancel') as HTMLElement;
const addCharacterBtn = document.getElementById('add-character-btn') as HTMLElement;
const inputReel = document.getElementById('input-reel') as HTMLInputElement;
const inputScene = document.getElementById('input-scene') as HTMLInputElement;
const inputCueName = document.getElementById('input-cue-name') as HTMLInputElement;
const inputNotes = document.getElementById('input-notes') as HTMLTextAreaElement;
const inputStatus = document.getElementById('input-status') as HTMLSelectElement;
const inputPriority = document.getElementById('input-priority') as HTMLSelectElement;

const characterModal = document.getElementById('character-modal') as HTMLElement;
const characterForm = document.getElementById('character-form') as HTMLFormElement;
const characterNameInput = document.getElementById('character-name') as HTMLInputElement;
const characterModalCancel = document.getElementById('character-modal-cancel') as HTMLElement;

const confirmModal = document.getElementById('confirm-modal') as HTMLElement;
const confirmTitle = document.getElementById('confirm-title') as HTMLElement;
const confirmMessage = document.getElementById('confirm-message') as HTMLElement;
const confirmYes = document.getElementById('confirm-yes') as HTMLElement;
const confirmNo = document.getElementById('confirm-no') as HTMLElement;

const nameModal = document.getElementById('name-modal') as HTMLElement;
const nameForm = document.getElementById('name-form') as HTMLFormElement;
const userNameInput = document.getElementById('user-name-input') as HTMLInputElement;

const conflictModal = document.getElementById('conflict-modal') as HTMLElement;
const conflictSaveMine = document.getElementById('conflict-save-mine') as HTMLElement;
const conflictDiscard = document.getElementById('conflict-discard') as HTMLElement;

// Toolbar
const tbAdd = document.getElementById('tb-add') as HTMLElement;
const tbDuplicate = document.getElementById('tb-duplicate') as HTMLElement;
const tbEdit = document.getElementById('tb-edit') as HTMLElement;
const tbDelete = document.getElementById('tb-delete') as HTMLElement;

// === API Helpers ===
async function api<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(API_BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body
      ? JSON.stringify({ ...JSON.parse(options.body as string), clientId: sseClientId })
      : undefined,
  });
  if (res.status === 409) {
    const data = await res.json() as { serverCue?: Cue; conflictingFields?: string[]; error?: string };
    if (data.serverCue) {
      throw new ConflictError(data.serverCue, data.conflictingFields ?? null);
    }
    throw new Error(data.error ?? 'Conflict');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' })) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function fetchCues(): Promise<void> {
  cues = await api<Cue[]>('/api/cues');
  renderCues();
}

async function fetchCharacters(): Promise<void> {
  characters = await api<Character[]>('/api/characters');
  renderCharacterDropdown();
}

// === Timecode Validation ===
function isValidTimecode(tc: string): boolean {
  const match = tc.match(/^(\d{1,2}):(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return false;
  const [, h, m, s, f] = match.map(Number);
  return h >= 0 && h <= 99 && m >= 0 && m <= 59 && s >= 0 && s <= 59 && f >= 0 && f <= 29;
}

// === Field name helpers ===
const fieldLabels: Record<string, string> = {
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
function renderCharacterDropdown(selectEl?: HTMLSelectElement, selectedId?: string): void {
  const target = selectEl ?? characterSelect;
  const currentVal = selectedId !== undefined ? String(selectedId) : target.value;
  const placeholder = target.querySelector<HTMLOptionElement>('option[value=""]');
  target.innerHTML = '';
  if (placeholder) {
    target.appendChild(placeholder);
  } else {
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

type CueFormFields = Pick<Cue, 'start_time' | 'end_time' | 'dialog' | 'character_id' | 'reel' | 'scene' | 'cue_name' | 'notes' | 'status' | 'priority'>;

function getEditingRowValues(): CueFormFields | null {
  if (editingCueId === null) return null;
  const row = cueTableBody.querySelector<HTMLTableRowElement>(`tr[data-id="${editingCueId}"]`);
  if (!row) return null;
  const startEl = row.querySelector<HTMLInputElement>('.edit-start');
  if (!startEl) return null;
  return {
    start_time: startEl.value,
    end_time: row.querySelector<HTMLInputElement>('.edit-end')!.value,
    dialog: row.querySelector<HTMLTextAreaElement>('.edit-dialog')!.value,
    character_id: row.querySelector<HTMLSelectElement>('.edit-character')!.value,
    reel: row.querySelector<HTMLInputElement>('.edit-reel')!.value,
    scene: row.querySelector<HTMLInputElement>('.edit-scene')!.value,
    cue_name: row.querySelector<HTMLInputElement>('.edit-cue-name')!.value,
    notes: row.querySelector<HTMLTextAreaElement>('.edit-notes')!.value,
    status: row.querySelector<HTMLSelectElement>('.edit-status')!.value as Cue['status'],
    priority: row.querySelector<HTMLSelectElement>('.edit-priority')!.value as Cue['priority'],
  };
}

function fieldChangedHint(field: string): string {
  if (!changedFieldsByOther.includes(field)) return '';
  const editor = editingCueId ? editorsMap[editingCueId] : undefined;
  const who = editor ? editor.userName : 'Another user';
  return `<div class="field-changed-hint">Changed by ${escapeHtml(who)}</div>`;
}

function renderCues(): void {
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
      const vals: CueFormFields = savedEditValues ?? {
        reel: cue.reel ?? '',
        scene: cue.scene ?? '',
        cue_name: cue.cue_name ?? '',
        start_time: cue.start_time,
        end_time: cue.end_time,
        dialog: cue.dialog,
        character_id: cue.character_id,
        notes: cue.notes ?? '',
        status: cue.status ?? 'Spotted',
        priority: cue.priority ?? 'Medium',
      };

      const statusOpts = ['spotted' , 'printed' , 'approved' , 'recorded' , 'transferred' , 'cut' , 'premixed' , 'final mixed'].map(s =>
        `<option value="${s}"${vals.status === s ? ' selected' : ''}>${s}</option>`).join('');
      const prtyOpts = ['lowest' , 'low' , 'medium' , 'high' , 'highest'].map(p =>
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
      const editSelect = tr.querySelector<HTMLSelectElement>('.edit-character')!;
      renderCharacterDropdown(editSelect, vals.character_id);
    } else {
      const badgeHtml = editedByOther
        ? `<span class="editing-badge">${escapeHtml(editor.userName)} editing</span>`
        : '';
      tr.innerHTML = `
        <td>${escapeHtml(cue.reel || '--')}</td>
        <td>${escapeHtml(cue.scene || '--')}</td>
        <td>${escapeHtml(cue.cue_name ?? '')}</td>
        <td>${escapeHtml(cue.start_time)}</td>
        <td>${escapeHtml(cue.character_name)}${badgeHtml}</td>
        <td>${escapeHtml(cue.dialog)}</td>
        <td>${escapeHtml(cue.notes ?? '')}</td>
        <td>${escapeHtml(cue.status ?? 'Spotted')}<br>${escapeHtml(cue.priority ?? 'Medium')}</td>
      `;
    }

    cueTableBody.appendChild(tr);
  });

  updateStatusBar();
}

function updateStatusBar(): void {
  const total = cues.length;
  const selCount = selectedIds.size;
  statusText.textContent = `${selCount} of ${total} selected`;
  if (window.nativeBridge?.onSelectionChanged) {
    window.nativeBridge.onSelectionChanged(selCount, total);
  }
}

function escapeHtml(str: unknown): string {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function getCharacterNameById(id: string): string {
  const c = characters.find(ch => ch.id === id);
  return c ? c.name : 'Unknown';
}

// === Row Selection ===
cueTableBody.addEventListener('click', (e: MouseEvent) => {
  const tr = (e.target as Element).closest('tr') as HTMLTableRowElement | null;
  if (!tr?.dataset.id) return;

  if ((e.target as Element).closest('button, input, textarea, select')) return;

  const id = tr.dataset.id;

  if (e.shiftKey && selectedIds.size > 0) {
    const allIds = cues.map(c => c.id);
    const lastSelected = [...selectedIds].pop()!;
    const fromIdx = allIds.indexOf(lastSelected);
    const toIdx = allIds.indexOf(id);
    if (fromIdx !== -1 && toIdx !== -1) {
      const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
      for (let i = start; i <= end; i++) {
        selectedIds.add(allIds[i]);
      }
    }
  } else if (e.metaKey || e.ctrlKey) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
  } else {
    selectedIds.clear();
    selectedIds.add(id);
  }

  renderCues();
});

// === Edit Status Broadcasting ===
async function notifyEditingStart(cueId: string): Promise<void> {
  try {
    await api(`/api/cues/${cueId}/editing`, {
      method: 'POST',
      body: JSON.stringify({ userName }),
    });
  } catch { /* non-critical */ }
}

async function notifyEditingStop(cueId: string): Promise<void> {
  try {
    await api(`/api/cues/${cueId}/editing`, {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
  } catch { /* non-critical */ }
}

// === Toast Notification ===
function showToast(message: string): void {
  const toast = document.getElementById('toast') as HTMLElement;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// === Toolbar Actions ===
tbAdd.addEventListener('click', () => openCueModal());
tbDuplicate.addEventListener('click', () => duplicateSelectedCue());
tbEdit.addEventListener('click', () => editSelectedCue());
tbDelete.addEventListener('click', () => deleteSelectedCues());

function openCueModal(cue?: Cue): void {
  cueForm.reset();
  if (cue) {
    cueModalTitle.textContent = 'Edit Cue';
    submitBtn.textContent = 'Update Cue';
    cueIdInput.value = cue.id;
    cueUpdatedAtInput.value = cue.updated_at;
    inputReel.value = cue.reel ?? '';
    inputScene.value = cue.scene ?? '';
    inputCueName.value = cue.cue_name ?? '';
    startTimeInput.value = cue.start_time;
    endTimeInput.value = cue.end_time;
    characterSelect.value = cue.character_id;
    dialogInput.value = cue.dialog;
    inputNotes.value = cue.notes ?? '';
    inputStatus.value = cue.status ?? 'Spotted';
    inputPriority.value = cue.priority ?? 'Medium';
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

cueModal.addEventListener('click', (e: MouseEvent) => {
  if (e.target === cueModal) cueModal.style.display = 'none';
});

function duplicateSelectedCue(): void {
  if (selectedIds.size !== 1) {
    showToast('Select exactly one cue to duplicate');
    return;
  }
  const id = [...selectedIds][0];
  const cue = cues.find(c => c.id === id);
  if (!cue) return;
  cueForm.reset();
  cueModalTitle.textContent = 'Add Cue (Duplicate)';
  submitBtn.textContent = 'Add Cue';
  cueIdInput.value = '';
  cueUpdatedAtInput.value = '';
  inputReel.value = cue.reel ?? '';
  inputScene.value = cue.scene ?? '';
  inputCueName.value = cue.cue_name ?? '';
  startTimeInput.value = cue.start_time;
  endTimeInput.value = cue.end_time;
  characterSelect.value = cue.character_id;
  dialogInput.value = cue.dialog;
  inputNotes.value = cue.notes ?? '';
  inputStatus.value = cue.status ?? 'Spotted';
  inputPriority.value = cue.priority ?? 'Medium';
  cueModal.style.display = 'flex';
  inputReel.focus();
}

function editSelectedCue(): void {
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

function deleteSelectedCues(): void {
  if (selectedIds.size === 0) {
    showToast('Select at least one cue to delete');
    return;
  }
  const ids = [...selectedIds];
  const count = ids.length;
  const firstCue = cues.find(c => c.id === ids[0]);
  const preview = count === 1
    ? `Delete cue "${(firstCue?.dialog ?? '').substring(0, 40)}..."?`
    : `Delete ${count} selected cues?`;

  const editWarnings = ids
    .map(id => editorsMap[id])
    .filter((e): e is EditorEntry => !!e && e.clientId !== sseClientId)
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
      alert((err as Error).message);
    }
  });
}

// === Cue Form Submit (modal) ===
cueForm.addEventListener('submit', async (e: SubmitEvent) => {
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

  const body: CueFormFields & { updated_at?: string; baseCue?: Cue } = {
    start_time: startTime,
    end_time: endTime,
    dialog,
    character_id: characterId,
    reel: inputReel.value.trim(),
    scene: inputScene.value.trim(),
    cue_name: inputCueName.value.trim(),
    notes: inputNotes.value.trim(),
    status: inputStatus.value as Cue['status'],
    priority: inputPriority.value as Cue['priority'],
  };

  try {
    if (cueIdInput.value) {
      body.updated_at = cueUpdatedAtInput.value;
      if (editingBaseCue) body.baseCue = editingBaseCue;
      const result = await api<CueResponse>(`/api/cues/${cueIdInput.value}`, { method: 'PUT', body: JSON.stringify(body) });
      if (result.merged) {
        showToast(`Auto-merged with other user's changes (${result.mergedFields!.map(f => fieldLabels[f]).join(', ')})`);
      }
    } else {
      await api<Cue>('/api/cues', { method: 'POST', body: JSON.stringify(body) });
    }
    cueModal.style.display = 'none';
    editingCueId = null;
    editingBaseCue = null;
    pendingConflictCueData = null;
    changedFieldsByOther = [];
    await fetchCues();
  } catch (err) {
    if (err instanceof ConflictError) {
      cueModal.style.display = 'none';
      showConflictModal(body, err.serverCue, err.conflictingFields);
    } else {
      alert((err as Error).message);
    }
  }
});

// === Table Inline Edit Actions (event delegation) ===
cueTableBody.addEventListener('click', async (e: MouseEvent) => {
  const btn = (e.target as Element).closest<HTMLButtonElement>('button');
  if (!btn) return;

  const id = btn.dataset.id;

  if (btn.classList.contains('save-edit-btn') && id) {
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
cueTableBody.addEventListener('dblclick', (e: MouseEvent) => {
  if ((e.target as Element).closest('button, input, textarea, select')) return;
  const tr = (e.target as Element).closest<HTMLTableRowElement>('tr');
  if (!tr?.dataset.id) return;
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

async function saveInlineEdit(id: string): Promise<void> {
  const row = cueTableBody.querySelector<HTMLTableRowElement>(`tr[data-id="${id}"]`);
  if (!row) return;

  const startTime = row.querySelector<HTMLInputElement>('.edit-start')!.value.trim();
  const endTime = row.querySelector<HTMLInputElement>('.edit-end')!.value.trim();
  const dialog = row.querySelector<HTMLTextAreaElement>('.edit-dialog')!.value.trim();
  const characterId = row.querySelector<HTMLSelectElement>('.edit-character')!.value;
  const cue = cues.find(c => c.id === id);

  if (!isValidTimecode(startTime)) { alert('Invalid start time format'); return; }
  if (!isValidTimecode(endTime)) { alert('Invalid end time format'); return; }
  if (!dialog) { alert('Dialog is required'); return; }
  if (!characterId) { alert('Please select a character'); return; }

  const myChanges: CueFormFields & { updated_at: string; baseCue?: Cue } = {
    start_time: startTime,
    end_time: endTime,
    dialog,
    character_id: characterId,
    reel: row.querySelector<HTMLInputElement>('.edit-reel')!.value.trim(),
    scene: row.querySelector<HTMLInputElement>('.edit-scene')!.value.trim(),
    cue_name: row.querySelector<HTMLInputElement>('.edit-cue-name')!.value.trim(),
    notes: row.querySelector<HTMLTextAreaElement>('.edit-notes')!.value.trim(),
    status: row.querySelector<HTMLSelectElement>('.edit-status')!.value as Cue['status'],
    priority: row.querySelector<HTMLSelectElement>('.edit-priority')!.value as Cue['priority'],
    updated_at: editingBaseCue?.updated_at ?? cue?.updated_at ?? '',
  };

  if (editingBaseCue) myChanges.baseCue = editingBaseCue;

  try {
    const result = await api<CueResponse>(`/api/cues/${id}`, {
      method: 'PUT',
      body: JSON.stringify(myChanges),
    });
    notifyEditingStop(id);
    editingCueId = null;
    editingBaseCue = null;
    pendingConflictCueData = null;
    changedFieldsByOther = [];
    if (result.merged) {
      showToast(`Auto-merged with other user's changes (${result.mergedFields!.map(f => fieldLabels[f]).join(', ')})`);
    }
    await fetchCues();
  } catch (err) {
    if (err instanceof ConflictError) {
      showConflictModal(myChanges, err.serverCue, err.conflictingFields);
    } else {
      alert((err as Error).message);
    }
  }
}

// === Conflict Resolution Modal ===
let conflictMyChanges: (CueFormFields & { updated_at?: string; baseCue?: Cue }) | null = null;
let conflictServerCue: Cue | null = null;

function showConflictModal(
  myChanges: CueFormFields & { updated_at?: string; baseCue?: Cue },
  serverCue: Cue,
  conflictingFields?: string[] | null
): void {
  conflictMyChanges = myChanges;
  conflictServerCue = serverCue;


  const headerEl = conflictModal.querySelector('h3') as HTMLElement;
  const descEl = conflictModal.querySelector('p') as HTMLElement;
  const mergedInfoEl = document.getElementById('conflict-merged-info') as HTMLElement;

  if (conflictingFields && conflictingFields.length > 0) {
    const fieldNames = conflictingFields.map(f => fieldLabels[f] ?? f).join(', ');
    headerEl.textContent = `Conflict on: ${fieldNames}`;
    const allFields = ['start_time', 'end_time', 'dialog', 'character_id', 'reel', 'scene', 'cue_name', 'notes', 'status', 'priority'];
    const autoMerged = allFields.filter(f => !conflictingFields.includes(f));
    if (autoMerged.length > 0) {
      mergedInfoEl.textContent = `Auto-merged: ${autoMerged.map(f => fieldLabels[f] ?? f).join(', ')}`;
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

  const fields: Array<{
    key: string;
    myEl: string;
    serverEl: string;
    myVal: string;
    serverVal: string;
  }> = [
    { key: 'start_time', myEl: 'conflict-my-start', serverEl: 'conflict-server-start', myVal: myChanges.start_time, serverVal: serverCue.start_time },
    { key: 'end_time', myEl: 'conflict-my-end', serverEl: 'conflict-server-end', myVal: myChanges.end_time, serverVal: serverCue.end_time },
    { key: 'character_id', myEl: 'conflict-my-character', serverEl: 'conflict-server-character', myVal: getCharacterNameById(myChanges.character_id), serverVal: serverCue.character_name },
    { key: 'dialog', myEl: 'conflict-my-dialog', serverEl: 'conflict-server-dialog', myVal: myChanges.dialog, serverVal: serverCue.dialog },
  ];

  fields.forEach(({ key, myEl, serverEl, myVal, serverVal }) => {
    const my = document.getElementById(myEl) as HTMLElement;
    const server = document.getElementById(serverEl) as HTMLElement;
    my.textContent = myVal;
    server.textContent = serverVal;

    const isConflict = conflictingFields
      ? conflictingFields.includes(key)
      : myVal !== serverVal;
    my.classList.toggle('conflict-diff', isConflict);
    server.classList.toggle('conflict-diff', isConflict);

    const myField = my.closest<HTMLElement>('.conflict-field');
    const serverField = server.closest<HTMLElement>('.conflict-field');
    if (conflictingFields && !conflictingFields.includes(key)) {
      if (myField) myField.style.display = 'none';
      if (serverField) serverField.style.display = 'none';
    } else {
      if (myField) myField.style.display = '';
      if (serverField) serverField.style.display = '';
    }
  });

  conflictModal.style.display = 'flex';
}

conflictSaveMine.addEventListener('click', async () => {
  conflictModal.style.display = 'none';
  if (!conflictMyChanges || !conflictServerCue) return;

  const body: CueFormFields & { updated_at: string } = {
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
    alert('Save failed: ' + (err as Error).message);
  }
  conflictMyChanges = null;
  conflictServerCue = null;
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

characterModal.addEventListener('click', (e: MouseEvent) => {
  if (e.target === characterModal) characterModal.style.display = 'none';
});

characterForm.addEventListener('submit', async (e: SubmitEvent) => {
  e.preventDefault();
  const name = characterNameInput.value.trim();
  if (!name) return;

  try {
    const character = await api<Character>('/api/characters', { method: 'POST', body: JSON.stringify({ name }) });
    characterModal.style.display = 'none';
    await fetchCharacters();
    characterSelect.value = character.id;
  } catch (err) {
    alert((err as Error).message);
  }
});

// === Confirm Modal ===
let confirmCallback: (() => Promise<void>) | null = null;

function showConfirm(title: string, message: string, onConfirm: () => Promise<void>): void {
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

confirmModal.addEventListener('click', (e: MouseEvent) => {
  if (e.target === confirmModal) {
    confirmModal.style.display = 'none';
    confirmCallback = null;
  }
});

// === Keyboard Shortcuts ===
document.addEventListener('keydown', (e: KeyboardEvent) => {
  const inModal = document.querySelector<HTMLElement>('.modal-overlay[style*="flex"]');
  const inInput = (e.target as Element).closest('input, textarea, select');

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

function handleIncomingEvent(data: SSEEvent): void {
  if (data.originClientId === sseClientId) return;

  if (data.type === 'editing-start') {
    if (data.cueId && data.userName && data.originClientId) {
      editorsMap[data.cueId] = { userName: data.userName, clientId: data.originClientId };
    }
    renderCues();
    return;
  }

  if (data.type === 'editing-stop') {
    if (data.cueId) delete editorsMap[data.cueId];
    renderCues();
    return;
  }

  if (data.type === 'connection-status') {
    console.log('[Event] Connection status:', data.online);
    const dot = document.getElementById('connection-status') as HTMLElement;
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

  if (editingCueId !== null && data.type === 'deleted' && data.entity === 'cue' && data.id === editingCueId) {
    editingCueId = null;
    editingBaseCue = null;
    pendingConflictCueData = null;
    changedFieldsByOther = [];
    showToast('The cue you were editing was deleted by another user');
    fetchCues();
    return;
  }

  if (editingCueId !== null && data.type === 'updated' && data.id === editingCueId) {
    api<Cue>(`/api/cues/${data.id}`).then(serverCue => {
      pendingConflictCueData = serverCue;
      if (editingBaseCue) {
        changedFieldsByOther = [];
        const fields: (keyof Cue)[] = ['start_time', 'end_time', 'dialog', 'character_id', 'reel', 'scene', 'cue_name', 'notes', 'status', 'priority'];
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
window._nativeSSEHandler = function(jsonString: string): void {
  try {
    const data = JSON.parse(jsonString) as SSEEvent;
    console.log('[NativeBridge] Event:', data.type ?? data.entity ?? 'unknown');
    handleIncomingEvent(data);
  } catch (e) {
    console.error('[NativeBridge] Parse error:', e);
  }
};

function connectSSE(): void {
  const isNative = !!window.NATIVE_API_BASE;

  if (isNative) {
    sseClientId = 'native-' + Math.random().toString(36).substring(2, 11);
    console.log('[Event] Using native bridge for events, clientId:', sseClientId);
    api<HealthResponse>('/api/health').then(health => {
      const online = health.mode === 'online' || health.mode === 'syncing';
      handleIncomingEvent({ type: 'connection-status', online, originClientId: 'system' });
    }).catch(() => {});
    return;
  }

  const evtSource = new EventSource(API_BASE + '/api/events');

  evtSource.addEventListener('connected', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as { clientId: string; editingState?: Record<string, EditorEntry> };
    sseClientId = data.clientId;
    const dot = document.getElementById('connection-status') as HTMLElement;
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

  evtSource.addEventListener('update', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as SSEEvent;
    handleIncomingEvent(data);
  });

  evtSource.onerror = () => {
    const dot = document.getElementById('connection-status') as HTMLElement;
    dot.classList.remove('conn-online');
    dot.classList.add('conn-offline');
    dot.title = 'Disconnected';
  };
}

// === Name Prompt & User Info ===
const userInfo = document.getElementById('user-info') as HTMLElement;
const userDisplay = document.getElementById('user-display') as HTMLElement;
const logoutBtn = document.getElementById('logout-btn') as HTMLElement;

function showUserInfo(): void {
  userDisplay.textContent = userName;
  userInfo.style.display = 'flex';
}

function promptForName(): Promise<void> {
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
    nameForm.addEventListener('submit', (e: SubmitEvent) => {
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
window.nativeBridge = window.nativeBridge ?? {};
window.nativeBridge.triggerToolbarAction = function(action: string): void {
  switch (action) {
    case 'add': openCueModal(); break;
    case 'duplicate': duplicateSelectedCue(); break;
    case 'edit': editSelectedCue(); break;
    case 'delete': deleteSelectedCues(); break;
  }
};
window.nativeBridge.setConnectionStatus = function(status: string): void {
  const dot = document.getElementById('connection-status') as HTMLElement;
  dot.classList.toggle('conn-online', status === 'online');
  dot.classList.toggle('conn-offline', status !== 'online');
  dot.title = status === 'online' ? 'Connected' : 'Disconnected';
};

// Unused import suppression — fieldChangedHint is rendered in innerHTML
void fieldChangedHint;

// === Init ===
async function init(): Promise<void> {
  await promptForName();
  await Promise.all([fetchCues(), fetchCharacters()]);
  connectSSE();
}

init();
