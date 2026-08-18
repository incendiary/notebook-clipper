/**
 * Notebook Clipper - service worker.
 *
 * Owns the context menu, on-demand script injection, and the message relay
 * between the source page, the side panel, and NotebookLM.
 */
const LOG = '[NotebookClipper]';
const MENU_ID = 'notebook-clipper-send';
const NOTEBOOKLM_ORIGIN = 'https://notebooklm.google.com';
const TAB_LOAD_TIMEOUT_MS = 30000;

/**
 * Content extracted but not yet collected by the side panel. The panel opens
 * after extraction finishes, so it asks for this on load rather than relying on
 * a broadcast that may have no listener yet.
 */
let pendingContent = null;

function createMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Send to NotebookLM',
      contexts: ['page', 'selection'],
    });
  });
}

chrome.runtime.onInstalled.addListener(createMenu);
chrome.runtime.onStartup.addListener(createMenu);

/** Broadcasts to the side panel, tolerating the panel not being open yet. */
function notifySidebar(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    /* no receiver: the panel picks the content up via GET_PENDING_CONTENT */
  });
}

/* ------------------------------------------------------------- extraction */

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId !== MENU_ID || !tab || tab.id === undefined) return;

    // Opening the panel must happen while the user gesture is still live.
    await chrome.sidePanel.open({ tabId: tab.id });

    const target = { tabId: tab.id };
    await chrome.scripting.executeScript({ target, files: ['lib/turndown.js'] });
    const [injection] = await chrome.scripting.executeScript({
      target,
      files: ['content/extractor.js'],
    });

    const result = injection && injection.result;
    if (!result || result.error) {
      pendingContent = {
        error: (result && result.error) || 'Could not extract content from this page.',
      };
    } else {
      pendingContent = result;
    }

    notifySidebar({ type: 'CONTENT_READY', payload: pendingContent });
  } catch (err) {
    console.error(LOG, 'context menu handler failed', err);
    pendingContent = {
      error: `Extraction failed: ${err && err.message ? err.message : String(err)}`,
    };
    notifySidebar({ type: 'CONTENT_READY', payload: pendingContent });
  }
});

/* -------------------------------------------------------------- injection */

/** Resolves once the tab reports status "complete". */
function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Timed out waiting for the NotebookLM tab to load.'));
    }, TAB_LOAD_TIMEOUT_MS);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

/** Focuses an existing NotebookLM tab or opens one, then loads the notebook. */
async function openNotebookTab(notebookId) {
  const url = `${NOTEBOOKLM_ORIGIN}/notebook/${notebookId}`;
  const [existing] = await chrome.tabs.query({ url: `${NOTEBOOKLM_ORIGIN}/*` });

  if (!existing) {
    const created = await chrome.tabs.create({ url, active: true });
    await waitForTabLoad(created.id);
    return created.id;
  }

  await chrome.tabs.update(existing.id, { active: true });
  await chrome.windows.update(existing.windowId, { focused: true });

  if (!existing.url.includes(notebookId)) {
    const loaded = waitForTabLoad(existing.id);
    await chrome.tabs.update(existing.id, { url });
    await loaded;
  } else if (existing.status !== 'complete') {
    await waitForTabLoad(existing.id);
  }

  return existing.id;
}

/**
 * Places the payload on the injected world's global. executeScript only accepts
 * `args` with `func`, so the payload cannot ride along with the file itself.
 */
function seedPayload(payload) {
  window.__notebookClipperPayload = payload;
}

async function injectNotebookLM(payload) {
  const tabId = await openNotebookTab(payload.notebookId);
  const target = { tabId };

  await chrome.scripting.executeScript({ target, func: seedPayload, args: [payload] });
  await chrome.scripting.executeScript({ target, files: ['content/notebooklm.js'] });
}

/* --------------------------------------------------------------- messages */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  try {
    if (!message || typeof message.type !== 'string') return false;

    if (message.type === 'GET_PENDING_CONTENT') {
      sendResponse({ payload: pendingContent });
      pendingContent = null;
      return false;
    }

    if (message.type === 'INJECT_NOTEBOOKLM') {
      injectNotebookLM(message.payload).catch((err) => {
        console.error(LOG, 'injection failed', err);
        notifySidebar({
          type: 'INJECT_RESULT',
          success: false,
          error: err && err.message ? err.message : String(err),
        });
      });
      return false;
    }

    if (message.type === 'NOTEBOOKLM_RESULT') {
      notifySidebar({
        type: 'INJECT_RESULT',
        success: message.success,
        error: message.error || null,
      });
      return false;
    }
  } catch (err) {
    console.error(LOG, 'background message handler failed', err);
  }
  return false;
});
