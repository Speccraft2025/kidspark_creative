# KidSpark Store — Setup Guide

This turns the KidSpark site into a **self-hosted store**: your own Paystack
checkout + secure download delivery, no Selar.

**Golden rule:** every secret key below goes into **Netlify's environment
variables** (or your local `.env`). Never paste a secret key into the website
code, into git, or into chat.

---

## How it fits together

```
store.html  ──▶  /api/create-checkout  ──▶  Paystack Checkout
                                                   │  buyer pays
success.html ◀── (redirect) ──────────────────────┤
     │                                             └──▶ /api/paystack-webhook  (marks PAID, emails link)
     └──▶ /api/verify ──▶ /api/download ──▶ Supabase private file (signed link)
```

- **Netlify** hosts the site + the `/api/*` functions.
- **Supabase** holds the PDFs (private bucket) + orders/grants tables.
- **Paystack** takes the money (your business account).
- **Resend** emails the download link.

---

## Step 1 — Package the printables into sellable files

Right now each pack is many single-page PDFs in folders. Buyers should get **one
file per pack**. Decide, per pack, one of:

- a single combined **PDF**, or
- a single **ZIP** of the pages.

Target file names (these match `netlify/functions/_shared/products.js`):

| Product            | File to create                         |
| ------------------ | -------------------------------------- |
| Complete Bundle    | `kidspark-complete-bundle.zip`         |
| Alphabet           | `alphabet.pdf`                         |
| Food               | `food.pdf`                             |
| Fruits             | `fruits.pdf`                           |
| Wildlife           | `wildlife.pdf`                         |
| Mazes              | `mazes.pdf`                            |
| Join-the-Dots      | `join-the-dots.pdf`                    |

> Ask me and I can generate these combined PDFs/ZIP from the existing folders.

---

## Step 2 — Supabase (files + database)

1. Create a project at [supabase.com](https://supabase.com).
2. **Storage → New bucket** → name it `printables` → **uncheck "Public"** (must be private).
3. Upload your packaged files to these exact paths inside the bucket:
   - `bundle/kidspark-complete-bundle.zip`
   - `packs/alphabet.pdf`, `packs/food.pdf`, `packs/fruits.pdf`,
     `packs/wildlife.pdf`, `packs/mazes.pdf`, `packs/join-the-dots.pdf`
4. **SQL Editor** → paste and run `supabase/schema.sql` from this repo.
5. **Project Settings → API** → copy:
   - `Project URL`  → `SUPABASE_URL`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`  (⚠️ secret)

---

## Step 3 — Paystack

1. In your Paystack Dashboard, start in **Test mode** while building.
2. **Settings → API Keys & Webhooks** → copy the **Secret** and **Public** test keys.
3. Leave the webhook for now — you'll set it in Step 6 once you have your live URL.

---

## Step 4 — Resend (delivery email)

1. Create an account at [resend.com](https://resend.com).
2. **Domains → Add domain** → add your Kidspark domain and add the DNS records it
   gives you (this is what lets emails land in inboxes, not spam).
3. **API Keys → Create** → copy it → `RESEND_API_KEY`.
4. Set `EMAIL_FROM` to something on that domain, e.g. `KidSpark <downloads@yourdomain.com>`.

---

## Step 5 — Deploy on Netlify

1. Push this repo to GitHub (already at `Speccraft2025/Kidspark-2`).
2. In [Netlify](https://app.netlify.com): **Add new site → Import from GitHub** → pick the repo.
   Build settings come from `netlify.toml` (no build command, functions auto-detected).
3. **Site settings → Environment variables** → add every key from `.env.example`:
   `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` (=`printables`),
   `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL`.
4. **Domain settings** → add your custom domain and let Netlify provision HTTPS.
5. Set `SITE_URL` to your final `https://` domain (no trailing slash) and redeploy.

---

## Step 6 — Wire the Paystack webhook

1. Paystack Dashboard → **Settings → API Keys & Webhooks → Webhook URL**:
   `https://yourdomain.com/api/paystack-webhook`
2. Save. This is what confirms payments even if the buyer closes their browser.

---

## Step 7 — Test end to end (test mode)

1. Open `https://yourdomain.com/store.html`, add a pack, enter your email, pay
   with a [Paystack test card](https://paystack.com/docs/payments/test-payments/).
2. You should land on `success.html` with working download buttons, and get the email.
3. Check the Supabase `orders` row flips to `paid` and `download_grants` rows exist.

---

## Step 8 — Go live

1. Set your real **prices** in `netlify/functions/_shared/products.js` (currently placeholders).
2. Swap Paystack **test** keys for **live** keys in Netlify env vars.
3. Confirm the webhook URL is set on the **live** Paystack account too.
4. Remove the old Selar product once sales are flowing here.

---

## Local development (optional)

```bash
npm install
cp .env.example .env   # fill in your keys
npx netlify dev        # serves site + functions at http://localhost:8888
```

---

## Security notes

- PDFs are **private**; the browser only ever gets a signed URL that expires in ~2 minutes.
- Prices are computed **server-side** from `products.js`; the browser can't change them.
- The webhook signature is verified, so only real Paystack calls fulfill orders.
- Download links expire after 72h and allow a limited number of downloads
  (tunable in `netlify/functions/_shared/fulfill.js`).
- ⚠️ The old `download.html` / `download_dots.html` / `download_maze1.html` pages
  link to PDFs **directly and publicly**. Once selling here, delete those pages
  (and stop committing the raw PDFs to the public repo) so the paid files aren't
  free to anyone with the link.
```
