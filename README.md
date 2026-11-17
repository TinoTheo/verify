# IWH Certificate Verification Portal

A static, Vercel-ready site that lets anyone scan the QR code on a printed IWH
(Institute for Work at Height) Rope Access Technician certificate and land on
a public verification page showing the holder's details and validity status.

## Project layout

```
vercel-verify/
├── index.html                       Landing page listing all holders
├── cert/
│   ├── DM154752-19/index.html       Prosper Mudzamiri verification page
│   └── DM174684-18/index.html       Tonderai Muyengwa verification page
├── assets/
│   ├── qr_prosper.png               Same QR that's stamped on Prosper's PDF
│   └── qr_tonderai.png              Same QR that's stamped on Tonderai's PDF
├── vercel.json                      Clean URLs + security headers
└── README.md                        This file
```

The URL paths (`/cert/DM154752-19/`, `/cert/DM174684-18/`) match exactly what
the QR codes on the stamped PDFs encode, so scanning a certificate opens the
correct page with no redirects.

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

The QR codes currently encode:

- `https://verify.heightsafety.co.za/cert/DM154752-19`
- `https://verify.heightsafety.co.za/cert/DM174684-18`

To make them resolve:

1. In the Vercel project, go to **Settings → Domains**.
2. Add `verify.heightsafety.co.za` (or any domain you own).
3. Follow Vercel's DNS instructions — typically add a `CNAME` record pointing
   `verify` to `cname.vercel-dns.com` at your registrar.
4. Once DNS propagates, scanning the QR on either certificate opens the
   matching verification page.

If you want a different domain (say `verify.yourcompany.co.za`), tell me and
I'll regenerate both stamped PDFs so the QR codes point at the new URLs.

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
