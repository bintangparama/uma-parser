# Local Lens

Client-side English OCR for screenshots and photos. All recognition runs in a Tesseract.js Web Worker/WebAssembly in your browser. There are no image uploads, cloud OCR calls, API keys, or accounts. The Node server only serves static files and the three sample images; it accepts no uploads. A same-origin Content Security Policy prevents external connections.

## Run locally

Requires Node.js 20 or newer.

```sh
cd "/Users/bintangparama/Codex/OCR Project"
npm install
npm start
```

Open http://localhost:5173 in a modern Chrome, Edge, Firefox, or Safari. Installation downloads the engine and English model once and copies them into `public/vendor/`. After installation, localhost works without internet. Keep the server running while using the app. Stop it with Ctrl+C. To use another port: `PORT=5180 npm start`.

## Try it

1. Choose, drop, or paste an image.
2. Select a layout and preparation. **Brown text** isolates the warm lettering in these game screens. Use **Grayscale + contrast** or **Original colors** for other images. Brown text intentionally excludes other colors, including some stat grades and white headings.
3. Click **Extract text**. Progress shows each section. Cancel stops the OCR worker; you can retry.
4. Review and edit the result, then copy it or download `.txt` or `.json`. JSON contains original OCR lines, confidence and bounding boxes in source-image coordinates; its top-level text includes your edits.

Images may have different dimensions and any number of visible text lines. Processing uses overlapping sections at up to 1800 × 1800 pixels, with source-coordinate ownership to avoid duplicate overlap lines. Images narrower than 900 px are enlarged up to 2×. Very wide images are reduced to 1800 px, so tiny lettering may require cropping first. Files are limited to 40 MB, 80 megapixels, and 60,000 pixels on either axis to avoid browser exhaustion; decoding still depends on device memory. English only is bundled. OCR is imperfect: stylized ranks, icons, circled symbols, and low-resolution lettering may need correction. It reads only text visible in the image, not off-screen game content.

## Development

- `npm test` checks section coverage, overlap deduplication, reading order and text filtering.
- `npm start` runs the loopback-only static server.
- `node scripts/vendor.mjs` rebuilds local engine assets after dependency changes.
- Application source is in `public/`; no frontend build is required.

Tesseract.js: https://github.com/naptha/tesseract.js (Apache-2.0). English model: `@tesseract.js-data/eng`. Dependency licenses are retained in `node_modules`.

## Umamusume and skill matching

After OCR, section 02 automatically identifies the character and outfit, extracts the five stats when a complete stat row is visible, and matches visible skills to canonical names and IDs using your supplied `skillnames.json` and `umas.json`. Matching is entirely browser-side. The dictionaries are copied into `public/data/` when you run `npm start`; update the root JSON files and restart to refresh them. The sample build JSON files are validation references only and are never loaded by the app.

- Wrapped skill text is joined within its own column. Fuzzy spelling matches are scored; close alternatives and missing circle variants are marked **Review**.
- Own unique skills and inherited versions share names but have different IDs. The matcher uses level text or the first card together with the detected outfit to distinguish them. Other matching unique-skill names use the inherited ID. Check these if the screenshot is cropped or the character was not identified.
- ○ and ◎ variants keep separate IDs. The original image is inspected for concentric rings; a small image excerpt appears alongside these matches so you can check the variant. Tiny or damaged symbols can still be wrong.
- Select a different ID, confirm a suggestion, exclude a row, or add a missing skill by name/ID. Unresolved/excluded entries are omitted from the build's skill array. Duplicate IDs are removed.
- **Build JSON** exports the same field structure as the supplied examples. Mood defaults to **Great (2)** and can be changed to Awful (−2), Bad (−1), Normal (0), or Good (1). Strategy and chosen distance/surface/strategy aptitudes require your selection; they remain `null` when unknown. The raw OCR `.json` export remains available separately.
- Editing raw OCR text does not change the matching table. Use the match controls to correct the build, or rerun OCR with a different preparation.

The Agnes image visibly contains 22 skills. Its reference JSON lists 20, omitting **Top Pick** (`201672`) and **Lead the Charge!** (`201681`). The app retains both visible skills; exclude them to reproduce the reference's skill set. Skill-array order follows detected reading order and need not match the reference order.

Validation includes browser OCR on all three provided images, comparison with the two reference builds, and automated checks for wrapped lines, inherited IDs, ambiguity, stats, schema, and a compressed double-circle crop from the actual Taiki image. Run `npm test` for the automated suite.

The interface has two sections: image upload and skill checks. Raw OCR runs internally; the raw-text panel and its copy/download controls have been removed. Use the skill controls and Build JSON export for results.

## Deploy to GitHub Pages

1. Commit and push this project to your repository's `main` branch. Include `package-lock.json`, the root name dictionaries, the sample JSON/test fixtures used by the tests, `public/`, `scripts/`, `tests/`, and `.github/workflows/pages.yml`. Keep `node_modules/` and `public/vendor/` ignored.
2. In the repository, open **Settings → Pages → Build and deployment → Source**, and choose **GitHub Actions**.
3. Open **Actions → Deploy GitHub Pages** and run the workflow if the initial push happened before Pages was enabled. Subsequent pushes to `main` deploy automatically. If your default branch has a different name, update `branches: [main]` in the workflow.
4. The deployment job reports your Pages URL. The app supports both a root domain and a repository subpath such as `https://username.github.io/repository/`.

The workflow installs locked dependencies with `npm ci`, runs the tests, generates local OCR assets and dictionaries with `npm run build`, and uploads only `public/`. The generated vendor assets are included in the deployment artifact even though Git ignores them. The original sample images and JSON reference builds are not published. No server, credentials, or OCR API keys are required at runtime; OCR and matching continue to run on the visitor's device. GitHub serves the static application assets.

For a local build check, run `npm run build` and `npm test`. The existing `npm start` command still serves the app locally. GitHub Pages does not use `scripts/server.mjs`, so the local server's custom security headers do not apply there.
