/**
 * Notebook Clipper - NotebookLM injector.
 *
 * Injected into notebooklm.google.com. The payload is placed on the isolated
 * world's global by background.js before this file runs, because
 * scripting.executeScript only supports `args` alongside `func`, not `files`.
 *
 * NotebookLM is an SPA with generated class names, so every step matches on
 * visible text and ARIA attributes and reports which step timed out.
 */
(function injectIntoNotebookLM() {
  const LOG = '[NotebookClipper]';
  const PASTE_LIMIT = 500000;
  const TRUNCATION_NOTE = '\n\n[TRUNCATED — content exceeded NotebookLM paste limit]';

  const payload = window.__notebookClipperPayload;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Polls `probe` until it returns something truthy, or throws after `timeout`. */
  async function waitFor(step, probe, timeout) {
    const deadline = Date.now() + timeout;
    for (;;) {
      let found = null;
      try {
        found = probe();
      } catch (err) {
        console.error(LOG, `probe threw during: ${step}`, err);
      }
      if (found) return found;
      if (Date.now() > deadline) {
        throw new Error(`Timed out after ${timeout / 1000}s at step: ${step}`);
      }
      await sleep(200);
    }
  }

  function labelOf(node) {
    return `${node.getAttribute('aria-label') || ''} ${node.textContent || ''}`
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isVisible(node) {
    return node.offsetParent !== null || node.getClientRects().length > 0;
  }

  /** First visible clickable element whose label matches any of `patterns`. */
  function findClickable(patterns) {
    const candidates = document.querySelectorAll(
      'button, [role="button"], [role="menuitem"], [role="option"], a'
    );
    for (const node of candidates) {
      if (!isVisible(node)) continue;
      if (node.disabled) continue;
      const label = labelOf(node);
      if (patterns.some((pattern) => label.includes(pattern))) return node;
    }
    return null;
  }

  function click(node) {
    node.scrollIntoView({ block: 'center' });
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
      node.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, view: window }));
    }
  }

  /**
   * Types `value` into a native input/textarea or a contenteditable, using the
   * events an Angular or React binding listens for. Setting `.value` directly is
   * not enough: the framework's own setter must be invoked so its change
   * detection fires.
   */
  function setFieldValue(field, value) {
    field.focus();
    field.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

    if (field.isContentEditable) {
      field.textContent = value;
    } else {
      const proto =
        field instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(field, value);
    }

    field.dispatchEvent(new InputEvent('input', { bubbles: true, data: value }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' }));
    field.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }

  function findDialog() {
    const dialogs = document.querySelectorAll('[role="dialog"], mat-dialog-container, dialog');
    for (const dialog of dialogs) {
      if (!isVisible(dialog)) continue;
      const textarea = dialog.querySelector('textarea, [contenteditable="true"]');
      if (textarea) return dialog;
    }
    return null;
  }

  function findSourcesPanel() {
    const headings = document.querySelectorAll('h1, h2, h3, [role="heading"], [aria-label]');
    for (const node of headings) {
      if (isVisible(node) && labelOf(node).includes('source')) return node;
    }
    return null;
  }

  function report(success, error) {
    if (error) console.error(LOG, error);
    chrome.runtime.sendMessage({
      type: 'NOTEBOOKLM_RESULT',
      success,
      error: error || null,
    });
  }

  async function run() {
    if (!payload || !payload.notebookId) {
      throw new Error('No payload was provided to the injector.');
    }

    // Step 1: confirm we are on the right notebook. background.js navigates the
    // tab before injecting, because navigating from here would unload this script.
    if (!location.href.includes(payload.notebookId)) {
      throw new Error(
        `Tab is not on notebook ${payload.notebookId}; navigation did not complete.`
      );
    }
    await waitFor('waiting for the Sources panel', findSourcesPanel, 10000);

    // Step 2: open the source picker.
    const addSource = await waitFor(
      'finding the "Add source" button',
      () => findClickable(['add source', 'add sources', 'new source']),
      5000
    );
    click(addSource);

    // Steps 3-4: choose the pasted-text source type.
    const pasteOption = await waitFor(
      'finding the "Copied text" option',
      () => findClickable(['copied text', 'paste text', 'pasted text']),
      5000
    );
    click(pasteOption);

    // Step 5: wait for the paste dialog.
    const dialog = await waitFor('waiting for the paste dialog', findDialog, 5000);

    // Steps 6-7: fill the title and the body.
    const titleField = dialog.querySelector('input[type="text"], input:not([type])');
    if (titleField && payload.title) {
      setFieldValue(titleField, payload.title);
    }

    const bodyField = dialog.querySelector('textarea, [contenteditable="true"]');
    if (!bodyField) throw new Error('Paste dialog has no text area.');

    const markdown =
      payload.markdown.length > PASTE_LIMIT
        ? payload.markdown.slice(0, PASTE_LIMIT) + TRUNCATION_NOTE
        : payload.markdown;
    setFieldValue(bodyField, markdown);

    // Step 8: submit.
    const submit = await waitFor(
      'finding the Insert button',
      () => {
        const candidates = dialog.querySelectorAll('button, [role="button"]');
        for (const node of candidates) {
          if (node.disabled || !isVisible(node)) continue;
          const label = labelOf(node);
          if (['insert', 'add', 'save', 'submit'].some((word) => label.includes(word))) {
            return node;
          }
        }
        return null;
      },
      5000
    );
    click(submit);

    // Step 9: the dialog closing is the reliable success signal; a toast or the
    // new source appearing in the panel both count too.
    await waitFor(
      'waiting for confirmation that the source was added',
      () => {
        if (!findDialog()) return true;
        const toast = document.querySelector(
          '[role="alert"], [role="status"], snack-bar-container'
        );
        return toast && isVisible(toast) ? true : null;
      },
      10000
    );

    return true;
  }

  run()
    .then(() => report(true, null))
    .catch((err) => report(false, err && err.message ? err.message : String(err)));
})();
