# Jason Yuan replica instructions

User requirement (2026-10-11): recreate https://jasonyuan.design/ 1:1, including all visual details and public interactions. Preserve its original content first; the user will replace text and images later. Do not redesign, personalize, apply the earlier portfolio's Klein-blue theme or add language controls unless the user requests those changes.

This project is independent of `../portfolio-prototype`. Keep that earlier prototype intact.

The current implementation serves the captured original frontend runtime, CSS, fonts, images and videos locally. Preserve the compiled filenames, especially `public/assets/index-CtCmjgre.js`, because the lazy Mercury essay imports its named exports. `src/main.jsx` dynamically imports the original bundle with Vite processing disabled. The captured application performs its own React mount; do not add a second React root or starter/global CSS.

No private or locally gated tools/editors are enabled. Exclude the source's `design`, `perf` and `tune` developer modules from the served asset set. Keep the source gate intact.

Readable replacement materials live in `content/`. Original typography, content, media ratios, responsive srcsets and motion remain the acceptance target until explicit later changes. Source capture and screenshots live in `../evidence/jason-yuan-source` and the parent task's evidence directory.

Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, `tests/sites-worker.test.mjs`, and the Product Design Vite hosting configuration intact. `npm run build` must emit `dist/client/index.html`, `dist/server/index.js` and `dist/.openai/hosting.json`; run `npm run test:sites` before a Sites handoff.

The user explicitly requested on 2026-10-12 that this project's latest completed website changes always synchronize to the same Sites website. Reuse `project_id` from `.openai/hosting.json` for every update, preserve its audience, and publish after validation unless the user later requests local-only work or no publication. In the user's local workspace, `jason-yuan-replica/` is the active source of truth and `sites/dragonlee-portfolio/` is only the hosting mirror. Make edits in the active source, then run its `node scripts/prepare-sites-checkout.mjs` and use the Sites source workflow in the refreshed hosting mirror to build, push, package and deploy that exact state. Do not run the synchronization script inside the hosting mirror. In a standalone restored Sites checkout where the local active source does not exist, work in that restored checkout directly using the Sites workflow. Do not create another Site or publish a stale copy. Keep the user's local preview at port 4174.

The user confirmed that the current page content, including remaining examples and attribution, should stay while the Site runs independently. Serve runtime modules, fonts, images and videos from this Site's own assets; do not load from or make changes to the reference website.

Run the local preview yourself. Build first, then `npm run preview:persistent` for the reliable detached preview at http://127.0.0.1:4174/. Logs and PID live in `.preview/`. Keep the preview running and let the parent task perform browser QA and `design-qa.md` before final handoff.

User personalization: keep the page heading `Dragonlee` and browser tab title exactly `Dragonlee`. Navigation, biography and future project descriptions should be in English; replacement artwork may contain Chinese.
