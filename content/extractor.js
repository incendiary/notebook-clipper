/**
 * Notebook Clipper - source page extractor.
 *
 * Injected on demand into the active tab, after lib/turndown.js. The completion
 * value of this script is returned to background.js via scripting.executeScript,
 * so the file must end in an expression.
 *
 * Returns { title, markdown, sourceUrl } on success, or { error } on failure.
 */
(function extractPageAsMarkdown() {
  const LOG = '[NotebookClipper]';

  const STRIP_SELECTORS = [
    'nav',
    'header',
    'footer',
    'aside',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="complementary"]',
    '.sidebar',
    '#sidebar',
    'script',
    'style',
    'noscript',
    'iframe',
  ].join(',');

  const MAIN_SELECTORS = ['main', 'article', '[role="main"]', '.content', '#content', 'body'];

  function selectionHtml() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    if (selection.toString().trim().length === 0) return null;

    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();
    const holder = document.createElement('div');
    holder.appendChild(fragment);
    return holder.innerHTML;
  }

  function pageHtml() {
    for (const selector of MAIN_SELECTORS) {
      const found = document.querySelector(selector);
      if (!found) continue;
      const clone = found.cloneNode(true);
      clone.querySelectorAll(STRIP_SELECTORS).forEach((node) => node.remove());
      return clone.innerHTML;
    }
    return null;
  }

  function isAbsolute(url) {
    return /^https?:\/\//i.test(url || '');
  }

  function buildTurndown() {
    const service = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });

    service.addRule('images', {
      filter: 'img',
      replacement: (_content, node) => {
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        return isAbsolute(src) ? `[Image: ${alt}](${src})` : `[Image: ${alt}]`;
      },
    });

    return service;
  }

  try {
    if (typeof TurndownService === 'undefined') {
      return { error: 'Turndown was not injected before the extractor ran.' };
    }

    const html = selectionHtml() || pageHtml();
    if (!html || html.trim().length === 0) {
      return { error: 'Could not extract content from this page.' };
    }

    const markdown = buildTurndown().turndown(html).trim();
    if (markdown.length === 0) {
      return { error: 'Could not extract content from this page.' };
    }

    return { title: document.title, markdown, sourceUrl: location.href };
  } catch (err) {
    console.error(LOG, 'extraction failed', err);
    return { error: `Extraction failed: ${err && err.message ? err.message : String(err)}` };
  }
})();
