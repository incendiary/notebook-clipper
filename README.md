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

## Usage

### First run

1. Click the extension icon to open the side panel. It opens on the **Configure**
   view.
2. Under **Notebooks**, give the notebook a name, paste its ID (or its full
   NotebookLM URL), and click **Save notebook**.
3. Set **Default notebook** if you saved more than one. The first notebook you
   add becomes the default automatically.
4. Leave **Mode** on **Markdown**. PDF is a stub.

You only do this once. Notebooks persist in `chrome.storage.sync`.

### Clipping a page

1. Make sure you are signed in to NotebookLM in the same Chrome profile.
2. Go to the page you want to capture. To clip only part of it, select that part
   first: if a selection exists, only the selection is converted.
3. Right-click and choose **Send to NotebookLM**.
4. The side panel switches to the **Send** view showing the page title, source
   URL, and the first 500 characters of the Markdown.
5. Check the notebook in the picker. Click **Edit Markdown** if you want to fix
   the conversion by hand before sending; click **Done editing** to return to the
   preview.
6. Click **Send to NotebookLM**. The extension opens or focuses a NotebookLM tab,
   navigates to the notebook, and drives the **Add source → Copied text** dialog.
7. Watch the status line: **Sending…**, then **Success** or an error naming the
   step that failed.

Leave the NotebookLM tab alone while it runs. The injector is clicking real
controls, so interacting with the dialog at the same time can make it fail.

### When it fails

Errors name the step, for example `Timed out after 5s at step: finding the
"Add source" button`. That almost always means one of three things:

- You are not signed in to NotebookLM in this profile.
- The notebook ID is wrong, so the notebook never loaded.
- Google has renamed a control, and the matching text in
  `content/notebooklm.js` needs updating.

Open the NotebookLM tab's DevTools console and filter on `[NotebookClipper]` for
the full error. The extracted Markdown is still in the side panel, so nothing is
lost: fix the cause and click send again, or copy the text out manually.

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
