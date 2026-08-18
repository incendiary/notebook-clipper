# Notebook Clipper

A Chrome extension (Manifest V3) that turns any web page into Markdown and adds
it to a Google NotebookLM notebook as a pasted-text source.

It exists for pages NotebookLM's own URL import cannot reach: authenticated or
gated content such as course platforms, internal wikis, and paywalled
documentation. The page is read in your own logged-in browser session, converted
locally, and pasted into NotebookLM through its normal UI.

**Current version:** 0.1.0

## How it works

1. Right-click a page (or a selection) and choose **Send to NotebookLM**.
2. The extension injects [Turndown](https://github.com/mixmark-io/turndown) and a
   small extractor into the page, and converts the main content to Markdown.
3. The side panel opens with a preview. Pick a notebook, edit the Markdown if you
   want, and send.
4. The extension opens or focuses a NotebookLM tab, then drives the **Add source →
   Copied text** dialog to insert the content.

Nothing leaves your browser. There are no external network calls, no build step,
and no telemetry.

## Install

The extension is unpacked-only; it is not on the Chrome Web Store.

```bash
git clone --branch v0.1.0 https://github.com/incendiary/notebook-clipper.git
```

Then:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the cloned `notebook-clipper` folder.
4. Pin the extension if you want the side panel one click away.

No `npm install` is needed to run it. The dev dependencies are for linting and
the validation suite only.

## Finding your Notebook ID

Open the notebook in NotebookLM and read the URL:

```
https://notebooklm.google.com/notebook/1a2b3c4d-5e6f-7890-abcd-ef1234567890
                                       ^------------- this is the ID -------^
```

Add it in the side panel under **Notebooks**. Pasting the whole URL works too:
the extension extracts the ID. Notebooks are stored in `chrome.storage.sync`, so
they follow your Chrome profile.

## Development

```bash
npm install
npm run lint
npm run format
npm test
```

`npm test` runs `test/validate.js`, a dependency-free structural suite that
checks the manifest against the files on disk, rejects inline scripts and `eval`,
asserts every message type has a listener, and enforces the repository's
versioning and ref-pinning rules.

To install the commit hooks (GitLeaks, Prettier, validation):

```bash
pre-commit install
```

## Known limitations

- **NotebookLM UI changes will break injection.** The injector matches on visible
  button text and ARIA labels, not on internal class names, which is the most
  durable option available without an API. It is still a scraper: when Google
  renames a control, the run fails with the step that timed out, and the selector
  lists in `content/notebooklm.js` need updating.
- **PDF mode is not implemented.** The toggle is a stub and shows "coming soon".
- **Paste limit.** Markdown over 500,000 characters is truncated, with a marker
  appended.
- **Extraction is heuristic.** The extractor tries `main`, `article`,
  `[role="main"]`, `.content`, `#content`, then `body`, and strips chrome such as
  navigation and sidebars. Heavily app-like pages may extract poorly; use a
  selection, or edit the Markdown in the side panel before sending.
- **NotebookLM must be logged in** in the same browser profile.
- **Google may rate-limit or change its terms.** This drives the normal web UI as
  a signed-in user would.

## Roadmap

Highlights: PDF mode, resilience to NotebookLM UI drift, and multi-page capture.
See [ROADMAP.md](ROADMAP.md) for the full list.

## Disclaimer

Authorised use only. This tool acts on pages and accounts you already have
legitimate access to; it is your responsibility to ensure that clipping and
re-hosting a given page complies with the source's terms of service, your
licence to the content, and applicable law.

Provided without warranty of any kind, express or implied. The user assumes all
responsibility for use of this software.

## Licence

MIT. See [LICENSE](LICENSE).
