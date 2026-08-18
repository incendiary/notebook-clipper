# Roadmap

## Features (upcoming)

- [ ] PDF mode: render the page to PDF and upload it as a file source (Priority: HIGH)
- [ ] Selector-drift detection: report which NotebookLM control could not be found, and
      surface a one-click "report selector" diagnostic dump
- [ ] Multi-page capture: queue several tabs and send them as a batch
- [ ] Per-notebook default title template (e.g. `{site} — {title}`)
- [ ] Readability-style extraction as an alternative to the current selector cascade
- [ ] Keyboard shortcut to clip without using the context menu
- [ ] Retry with backoff when the NotebookLM dialog is slow to appear

## In Progress

- [ ] Nothing in flight

## Shipped (v0.1.0)

- [x] Context-menu clip for full page and for a selection
- [x] Turndown-based HTML to Markdown conversion, bundled locally
- [x] Side panel with notebook management, default notebook, and Markdown preview
- [x] In-panel Markdown editing before sending
- [x] NotebookLM injection via the Add source → Copied text dialog
- [x] Truncation at the 500,000-character paste limit
- [x] Dependency-free structural validation suite and CI (lint, format, GitLeaks)
