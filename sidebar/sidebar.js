/**
 * Notebook Clipper - side panel UI.
 *
 * Two views: Configure (notebook management) and Send (review and dispatch the
 * extracted markdown). State lives in chrome.storage.sync.
 */
const LOG = '[NotebookClipper]';
const PREVIEW_CHARS = 500;
const TITLE_CHARS = 80;

const el = (id) => document.getElementById(id);

const state = {
  notebooks: [],
  defaultNotebookId: '',
  content: null,
};

/* ---------------------------------------------------------------- storage */

async function loadState() {
  const stored = await chrome.storage.sync.get({ notebooks: [], defaultNotebookId: '' });
  state.notebooks = Array.isArray(stored.notebooks) ? stored.notebooks : [];
  state.defaultNotebookId = stored.defaultNotebookId || '';
}

async function saveState() {
  await chrome.storage.sync.set({
    notebooks: state.notebooks,
    defaultNotebookId: state.defaultNotebookId,
  });
}

/* ------------------------------------------------------------------- util */

function toast(message) {
  const node = el('toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    node.hidden = true;
  }, 2500);
}

function setStatus(message, kind) {
  const node = el('status');
  node.textContent = message;
  node.className = kind ? `status ${kind}` : 'status';
}

/** Accepts a bare ID or a full NotebookLM URL and returns the bare ID. */
function normaliseNotebookId(raw) {
  const value = (raw || '').trim();
  const match = value.match(/notebook\/([^/?#]+)/);
  return match ? match[1] : value;
}

function fillSelect(select, selectedId) {
  select.textContent = '';
  for (const notebook of state.notebooks) {
    const option = document.createElement('option');
    option.value = notebook.id;
    option.textContent = notebook.name;
    select.appendChild(option);
  }
  if (selectedId) select.value = selectedId;
}

/* --------------------------------------------------------- configure view */

function renderNotebooks() {
  const list = el('notebook-list');
  list.textContent = '';

  for (const notebook of state.notebooks) {
    const item = document.createElement('li');

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = notebook.name;
    name.title = notebook.id;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => removeNotebook(notebook.id));

    item.append(name, remove);
    list.appendChild(item);
  }

  el('notebook-empty').hidden = state.notebooks.length > 0;

  const defaultSelect = el('default-notebook');
  fillSelect(defaultSelect, state.defaultNotebookId);
  if (!state.notebooks.some((n) => n.id === state.defaultNotebookId)) {
    state.defaultNotebookId = state.notebooks[0] ? state.notebooks[0].id : '';
    defaultSelect.value = state.defaultNotebookId;
  }
}

async function addNotebook(event) {
  event.preventDefault();
  const id = normaliseNotebookId(el('notebook-id').value);
  if (!id) {
    toast('Enter a notebook ID.');
    return;
  }
  if (state.notebooks.some((n) => n.id === id)) {
    toast('That notebook is already saved.');
    return;
  }

  const name = el('notebook-name').value.trim() || id;
  state.notebooks.push({ id, name });
  if (!state.defaultNotebookId) state.defaultNotebookId = id;

  await saveState();
  el('notebook-name').value = '';
  el('notebook-id').value = '';
  renderNotebooks();
}

async function removeNotebook(id) {
  state.notebooks = state.notebooks.filter((n) => n.id !== id);
  if (state.defaultNotebookId === id) {
    state.defaultNotebookId = state.notebooks[0] ? state.notebooks[0].id : '';
  }
  await saveState();
  renderNotebooks();
  if (state.content) fillSelect(el('send-notebook'), state.defaultNotebookId);
}

function setMode(mode) {
  const markdown = mode === 'markdown';
  el('mode-markdown').classList.toggle('active', markdown);
  el('mode-markdown').setAttribute('aria-pressed', String(markdown));
  el('mode-pdf').classList.toggle('active', false);
  el('mode-pdf').setAttribute('aria-pressed', 'false');
  if (!markdown) toast('PDF mode: coming soon');
}

/* -------------------------------------------------------------- send view */

function currentMarkdown() {
  const editor = el('markdown-editor');
  return editor.hidden ? state.content.markdown : editor.value;
}

function renderPreview() {
  const markdown = state.content.markdown;
  const head = markdown.slice(0, PREVIEW_CHARS);
  el('markdown-preview').textContent =
    markdown.length > PREVIEW_CHARS ? `${head}\n… (${markdown.length} chars total)` : markdown;
}

function showSendView(content) {
  state.content = content;

  const title = content.title || '(untitled)';
  el('send-title').textContent =
    title.length > TITLE_CHARS ? `${title.slice(0, TITLE_CHARS)}…` : title;
  el('send-title').title = title;
  el('send-url').textContent = content.sourceUrl || '';

  fillSelect(el('send-notebook'), state.defaultNotebookId);

  const editor = el('markdown-editor');
  editor.value = content.markdown;
  editor.hidden = true;
  el('markdown-preview').hidden = false;
  el('edit-button').textContent = 'Edit Markdown';
  renderPreview();

  setStatus('');
  el('view-config').hidden = true;
  el('view-send').hidden = false;
}

function showConfigView() {
  el('view-send').hidden = true;
  el('view-config').hidden = false;
  renderNotebooks();
}

function toggleEditor() {
  const editor = el('markdown-editor');
  const preview = el('markdown-preview');

  if (editor.hidden) {
    editor.hidden = false;
    preview.hidden = true;
    el('edit-button').textContent = 'Done editing';
    editor.focus();
    return;
  }

  state.content.markdown = editor.value;
  editor.hidden = true;
  preview.hidden = false;
  el('edit-button').textContent = 'Edit Markdown';
  renderPreview();
}

function send() {
  if (state.notebooks.length === 0) {
    // The status line lives in the send view, which we are about to hide.
    showConfigView();
    toast('No notebook configured — add one in settings');
    el('add-notebook-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    el('notebook-id').focus();
    return;
  }

  const notebookId = el('send-notebook').value;
  if (!notebookId) {
    setStatus('Select a notebook first.', 'error');
    return;
  }

  const markdown = currentMarkdown();
  state.content.markdown = markdown;

  setStatus('Sending…', 'busy');
  el('send-button').disabled = true;

  chrome.runtime.sendMessage({
    type: 'INJECT_NOTEBOOKLM',
    payload: { notebookId, title: state.content.title, markdown },
  });
}

function handleInjectResult(message) {
  el('send-button').disabled = false;
  if (message.success) {
    setStatus('Success — source added to NotebookLM.', 'success');
  } else {
    setStatus(message.error || 'Injection failed.', 'error');
  }
}

/* --------------------------------------------------------------- messages */

chrome.runtime.onMessage.addListener((message) => {
  try {
    if (!message || typeof message.type !== 'string') return;

    if (message.type === 'CONTENT_READY') {
      if (message.payload && message.payload.error) {
        showConfigView();
        toast(message.payload.error);
        return;
      }
      showSendView(message.payload);
      return;
    }

    if (message.type === 'INJECT_RESULT') {
      handleInjectResult(message);
    }
  } catch (err) {
    console.error(LOG, 'sidebar message handler failed', err);
  }
});

/* ------------------------------------------------------------------- init */

async function init() {
  try {
    await loadState();
    renderNotebooks();

    el('add-notebook-form').addEventListener('submit', addNotebook);
    el('default-notebook').addEventListener('change', async (event) => {
      state.defaultNotebookId = event.target.value;
      await saveState();
    });
    el('mode-markdown').addEventListener('click', () => setMode('markdown'));
    el('mode-pdf').addEventListener('click', () => setMode('pdf'));
    el('send-button').addEventListener('click', send);
    el('edit-button').addEventListener('click', toggleEditor);
    el('back-to-config').addEventListener('click', (event) => {
      event.preventDefault();
      showConfigView();
    });

    // The panel usually opens after the extraction has already finished, so ask
    // the service worker for any content it is holding for us.
    const pending = await chrome.runtime.sendMessage({ type: 'GET_PENDING_CONTENT' });
    if (pending && pending.payload) {
      if (pending.payload.error) {
        toast(pending.payload.error);
      } else {
        showSendView(pending.payload);
      }
    }
  } catch (err) {
    console.error(LOG, 'sidebar init failed', err);
  }
}

init();
