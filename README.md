# OLEMOLLEL ONLINE SHOPPING

A responsive musical-instrument storefront with a small, dependency-free Node.js backend.

## Run locally

Requires Node.js 20 or newer. No package installation is needed.

```sh
npm start
```

Open `http://localhost:4173`.

## Create the owner account

Set the owner email and a unique password of at least 12 characters before the **first** launch. The owner account is created on the server; the password is salted and hashed and is never sent back to the browser. No default admin password is configured.

PowerShell:

```powershell
$env:ADMIN_EMAIL = "owner@example.com"
$env:ADMIN_PASSWORD = "use-a-unique-password-of-at-least-12-characters"
npm start
```

macOS / Linux:

```sh
ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD='use-a-unique-password-of-at-least-12-characters' npm start
```

Open **Owner sign in** in the footer to manage the catalog, uploaded product photos, categories, verified reviews, customer enquiries, contact details and FAQ. Customer accounts can be created from the account button. General account passwords are also stored as salted hashes. Guest carts and wishlists stay in the browser; signed-in carts and wishlists sync to the customer account across devices. Comparison and recently viewed items stay in the browser. Account enquiries are saved on the server.

## Ordering and business setup

The site does not take card payments. Customers save a cart enquiry and continue to WhatsApp to confirm current pricing, stock and delivery with the business. Direct product questions, calls and customer-care links use the supplied business number: **+225 767 777 778**.

The starter catalog contains 1,000 distinct sample listings across eight categories. All listings now show real instrument photography: where a listing does not have its own supplied photo, the site uses a representative photo from the same category. These are not verified photos of the exact listed models. The original 12 sample prices were converted from XOF using an indicative 27 September 2026 reference rate of 1 XOF = 4.5879 TZS; the additional listings use sample Tanzanian-shilling price estimates. Confirm the actual products, model-specific photos, prices, stock, and delivery/return terms before accepting orders. Add a verified support email in **Store settings** when one is available. No sample ratings or testimonials are displayed.

## Deployment notes

Put the Node server behind HTTPS before collecting account credentials or customer enquiries. In production, `NODE_ENV=production` enables the `Secure` session-cookie flag. Use a single server instance with persistent access to `data/` and `public/uploads/`; the current session store is in memory, so restarts end active sessions and multiple app instances need a shared session store. Keep `data/users.json` and `data/inquiries.json` private and back them up securely. Set `HOST=0.0.0.0` only when a deployment platform requires the process to listen on all interfaces; local runs bind to `127.0.0.1`.

No payment provider or third-party account provider is connected. The in-store contact flow and owner inquiry dashboard are ready to use without either.

## GitHub Pages

The included GitHub Actions workflow publishes the storefront when changes are pushed to `main`. It copies the public storefront and catalog into a static Pages site. Product browsing and WhatsApp links work on Pages; customer accounts, saved server-side preferences, owner sign-in, image uploads, and the owner inquiry dashboard require the Node.js server and are not available on the static Pages link. The Pages deployment provides the public website URL in the workflow run summary.
