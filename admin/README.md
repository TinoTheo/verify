# Admin Panel — IWH Certificate Generator

A browser-based UI for generating stamped certificate PDFs and verification
pages. Lives at `/admin/` inside the vercel-verify project, so when you deploy
the project to Vercel the admin is accessible at:

```
https://verify-heightsafety.vercel.app/admin/
```

## What it does

Three tabs:

1. **Add Member** — upload a PNG of the certificate + fill in holder details
   (name, ID, registration, dates). Generates:
   - Stamped A4 PDF with QR code at the demo position
   - Standalone QR PNG
   - Verification HTML page
   - Updated `members.json` and landing `index.html`
   - Full project zip containing all of the above plus the existing project
     state — unzip over your local `vercel-verify/` folder and commit.

2. **Batch Upload** — select multiple PNG files + a CSV describing each
   member. CSV columns (header row required):
   ```
   png,name,id,reg,issue,expiry,designation,serial
   ```
   The `png` column should match the filenames of the uploaded PNGs.
   `designation` and `serial` are optional. Generates a single project zip
   with all new members added.

3. **Members** — loads the current `members.json` from the project root and
   shows a table of all registered holders. Each row has:
   - **Page** — download just that member's verification HTML
   - **Remove** — remove from registry and download an updated project zip
   - **Download full project zip** (top button) — bundle the entire
     `vercel-verify/` project state as a zip

## How it works

Everything runs in the browser. **No file ever leaves your computer** — the
PNG you upload, the CSV, the generated PDF, QR and HTML are all produced
client-side using:

- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) — QR matrix
- [pdf-lib](https://pdf-lib.js.org/) — PDF creation + QR overlay
- [JSZip](https://stuk.github.io/jszip/) — zip bundling
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/) — download triggers

These load from CDN, so the admin folder itself stays tiny (~38 KB).

## Workflow

1. Open the admin URL in any modern browser (Chrome, Firefox, Edge, Safari).
2. Go to **Add Member** tab.
3. Drag a certificate PNG into the dropzone (or click browse).
4. Fill in the form. The slug preview shows the verification URL as you type
   the registration number.
5. Click **Generate & Download**.
6. The Result card appears with a thumbnail preview and four download
   buttons. Click **Full project zip** for a complete bundle.
7. Unzip the downloaded `vercel-verify.zip` over your local `vercel-verify/`
   project folder. It will:
   - Add `cert/<slug>/index.html` (the new verification page)
   - Update `members.json` (registry now includes the new member)
   - Update `index.html` (landing page now lists the new member)
   - Place the stamped PDF at the root for your records
8. Commit and push to GitHub:
   ```bash
   cd vercel-verify
   git add .
   git commit -m "Add member: <name>"
   git push
   ```
9. Vercel auto-deploys. Within seconds the new verification page is live at
   `https://verify-heightsafety.vercel.app/cert/<slug>` and the QR on the
   printed PDF resolves.

## Batch workflow

1. Prepare a folder of certificate PNGs.
2. Prepare a `members.csv` (see format above). The `png` column should
   contain just the filename (e.g. `Fixwell.jpg`), matching one of the
   uploaded PNGs.
3. Go to **Batch Upload** tab.
4. Drag all PNGs into the first dropzone (or click browse and select them
   all).
5. Drag the CSV into the second dropzone.
6. Click **Process All & Download Zip**.
7. Watch the processing log — each row reports OK or an error.
8. The resulting `vercel-verify-batch.zip` contains the updated project
   with all new members added. Unzip, commit, push.

## Files

```
admin/
├── index.html    Page structure + CDN script tags
├── admin.css     Admin panel styling (navy + gold + white cards)
├── admin.js      All the logic: PNG→PDF+QR, members registry, batch CSV
└── README.md     This file
```

## Security note

The admin panel is publicly accessible at `/admin/` on your live Vercel site.
It can only **generate** files locally in the browser — it cannot modify
your deployed site, your GitHub repo, or anyone else's data. Anyone with
the URL can generate stamped PDFs that look like real IWH certificates,
which is a potential abuse vector if you want strict control.

If you want to restrict access, use one of:

- **Vercel Password Protection** (Pro plan): Settings → Domains → enable
  password protection on the production deployment.
- **Vercel Access Pass** (free with auth): a simple basic-auth wrapper
  deployed as a separate middleware.
- **Move admin out of the public project** — host the admin folder
  separately (e.g. on a different Vercel project, or just run it locally
  with `python -m http.server` and never deploy it).

## Browser support

Tested in current Chrome, Firefox, Edge, and Safari. Requires:

- FileReader API (for reading uploaded PNGs)
- Canvas API (for QR matrix rendering)
- fetch API (for loading the existing `members.json`)
- ES2017+ JavaScript (async/await)

All modern browsers have these.
