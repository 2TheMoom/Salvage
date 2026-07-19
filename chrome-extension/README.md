# Salvage — Stranded Token Warning (Chrome extension)

Watches text inputs on any page for a pasted or typed EVM address. If the
address has contract code on Ethereum or Base, it shows a small warning next
to the field — sending ERC-20 tokens to a contract instead of a wallet is the
single most common way tokens get permanently stranded, which is exactly what
Salvage (usesalvage.xyz) exists to recover from. This catches it before it
happens.

## How it works

- `content.js` runs on every page, watches `input`/`paste` events on text
  fields, and extracts a `0x`-prefixed 40-hex-char address once one appears.
- It asks `background.js` (the service worker) whether that address is a
  contract on Ethereum or Base, via `/api/is-contract` on the main Salvage
  API — the same Alchemy-backed check the scanner itself uses.
- If either chain reports contract code, a small warning bubble appears
  under the field (rendered in a closed Shadow DOM so it can't be styled
  away by the host page, and never touches the page's own JS or blocks
  submission).
- The toolbar popup (`popup.html`) lets you paste an address to check
  manually, outside of any form field.

## Loading it locally (unpacked)

Load unpacked from a plain folder **outside this repo** (e.g. copy
`chrome-extension/` to `C:\salvage-ext-test` or similar), not from this
`chrome-extension/` path directly. On at least one dev machine, loading
unpacked straight from the repo path caused Chrome to intermittently fail
to fetch the service worker script ("Service worker registration failed.
Status code: 3"), with the popup taking anywhere from several seconds to
several minutes to open before the extension was flagged as crashed — root
cause traced to something blocking Chrome's file access to that specific
path (not the extension's code; a fresh copy at an unrelated path loaded
instantly). This is a local dev-environment quirk, not something that
affects real users once the extension is published — the Chrome Web Store
copies the packed extension into Chrome's own profile directory, never
touching a developer's repo path.

1. Copy this `chrome-extension/` folder somewhere outside the repo
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**, select the copied folder
5. Visit any page with a text input and paste in a known contract address
   (e.g. USDC's mainnet contract: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`)
   to see the warning fire
6. After editing source in this repo, re-copy to the loaded folder and
   click the reload icon on the extension's card in `chrome://extensions`

## Before publishing to the Chrome Web Store

- `manifest.json`'s `host_permissions` only lists `https://www.usesalvage.xyz/*`
  — update if the API domain ever changes.
- Icons are generated from `public/icon-512.png` in the main repo (16/48/128).
- No remote code, no analytics, no data leaves the browser except the
  address itself being checked against Salvage's own API.
