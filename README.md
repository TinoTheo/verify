# IWH Certificate Verification Portal

A static, Vercel-ready site that lets anyone scan the QR code on a printed IWH
(Institute for Work at Height) Rope Access Technician certificate and land on
a public verification page showing the holder's details and validity status.

## Project layout

```
vercel-verify/
├── index.html                       Landing page listing all holders (auto-generated)
├── members.json                     Registry of all members (drives the landing page)
├── cert/
│   ├── DM154752-19/index.html       Prosper Mudzamiri verification page
│   └── DM174684-18/index.html       Tonderai Muyengwa verification page
├── admin/                           Browser-based generator UI (see admin/README.md)
│   ├── index.html                   Admin panel — open at /admin/ on the live site
│   ├── admin.css
│   ├── admin.js
│   └── README.md
└── vercel.json                      Clean URLs + security headers
```

The URL paths (`/cert/DM154752-19/`, `/cert/DM174684-18/`) match exactly what
the QR codes on the stamped PDFs encode, so scanning a certificate opens the
correct page with no redirects.

The `/admin/` folder is a browser-based UI for generating new stamped PDFs and
verification pages without the Python CLI. Open it at
`https://verify-heightsafety.vercel.app/admin/` — everything runs client-side,
nothing is uploaded to any server.

## How pages get here

This project is maintained by the **`cert-generator`** CLI tool (in the
sibling `../cert-generator/` folder). Don't edit `index.html` or the
`cert/*/index.html` files by hand — they're auto-generated from templates and
the `members.json` registry. To add or remove a member:

```bash
# From the cert-generator folder:
python generate.py single \
  --png /path/to/new_cert.png \
  --name "New Member" \
  --id "43-XXXXXXX" \
  --reg "DM XXXXXX/XX" \
  --issue 2026-01-28 \
  --expiry 2029-01-28 \
  --project ../vercel-verify \
  --output ../download
```

The generator updates `members.json`, regenerates this `index.html`, writes
the new `cert/<slug>/index.html`, and drops the stamped PDF in `../download/`.
Then commit and push to deploy.

## Deploy to Vercel

### Option A — Vercel dashboard (easiest)

1. Zip this folder: `cd vercel-verify && zip -r ../vercel-verify.zip .`
2. Push the folder to a GitHub / GitLab / Bitbucket repo.
3. Go to <https://vercel.com/new> and import the repo.
4. Vercel auto-detects it as a static site — accept the defaults and click
   **Deploy**.
5. You'll get a URL like `https://vercel-verify.vercel.app`. The QR codes will
   work immediately against that URL, but you'll want to set the production
   domain (see below).

### Option B — Vercel CLI

```bash
npm i -g vercel            # one-time
cd vercel-verify
vercel                     # preview deploy
vercel --prod              # production deploy
```

## Point the QR codes at your real domain

The QR codes stamped on the PDFs encode:

- `https://verify-heightsafety.vercel.app/cert/DM154752-19`
- `https://verify-heightsafety.vercel.app/cert/DM174684-18`

Your Vercel project is named `verify-heightsafety` (correctly spelled), and
Vercel auto-assigns the matching subdomain `verify-heightsafety.vercel.app`.
The QR codes resolve immediately once the project is deployed — no DNS
configuration needed.

If you later want a custom domain (e.g. `verify.heightsafety.co.za`):

1. In the Vercel project, go to **Settings → Domains**.
2. Add `verify.heightsafety.co.za`.
3. Add the `CNAME` record Vercel shows you at your DNS provider
   (`verify` → `cname.vercel-dns.com`).
4. Tell me the new domain so I can regenerate the stamped PDFs with QR
   codes pointing at the new URLs.

## Adding more certificate holders later

Drop a new folder under `cert/` using the registration number with the slash
and space stripped, e.g. `cert/DM200000-25/index.html`. Copy one of the
existing pages, swap the holder details, drop the matching QR PNG in
`assets/`, and update `index.html` with a new card. The folder name becomes
the URL path that goes into the next QR code.

## Tech notes

- 100% static HTML, no build step, no framework.
- Inline CSS, system fonts (Inter if installed, otherwise native sans-serif).
- Mobile-first responsive — most people will arrive via a phone camera scan.
- `vercel.json` enables clean URLs (`/cert/DM154752-19` works without
  trailing slash), security headers (X-Content-Type-Options, X-Frame-Options,
  Referrer-Policy), short cache for HTML and immutable long cache for
  `/assets/*`.
