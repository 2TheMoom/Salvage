// Watches every text input/textarea on the page for a pasted or typed EVM
// address, asks the background worker whether it's a contract on Ethereum
// or Base, and — if so — shows a non-blocking warning next to the field.
// Purely additive: never reads form values beyond extracting the address
// pattern, never touches the page's own JS, never blocks submission.

const ADDRESS_RE = /0x[a-fA-F0-9]{40}/;
const DEBOUNCE_MS = 400;
const PASTE_DEBOUNCE_MS = 120;

const timers = new WeakMap();
const lastChecked = new WeakMap();
let activeWarning = null; // { host, target, cleanup }

function extractAddress(value) {
  const match = value.match(ADDRESS_RE);
  return match ? match[0] : null;
}

function isTextField(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    return ['text', 'search', 'url', ''].includes(type);
  }
  return false;
}

function scheduleCheck(el, delay) {
  clearTimeout(timers.get(el));
  timers.set(el, setTimeout(() => runCheck(el), delay));
}

function runCheck(el) {
  const value = el.value || '';
  const address = extractAddress(value);

  if (!address) {
    if (activeWarning?.target === el) dismissWarning();
    return;
  }

  const key = address.toLowerCase();
  if (lastChecked.get(el) === key) return;
  lastChecked.set(el, key);

  chrome.runtime.sendMessage({ type: 'CHECK_ADDRESS', address: key }, (result) => {
    if (chrome.runtime.lastError) return; // extension context gone (page unloaded, etc.)
    if (!result?.success) return;
    if (el.value !== value) return; // field changed while we were waiting

    if (result.eth || result.base) {
      showWarning(el, result);
    } else if (activeWarning?.target === el) {
      dismissWarning();
    }
  });
}

function dismissWarning() {
  if (!activeWarning) return;
  activeWarning.cleanup();
  activeWarning = null;
}

function showWarning(el, result) {
  dismissWarning();

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'closed' });

  const chains = [result.eth && 'Ethereum', result.base && 'Base'].filter(Boolean).join(' and ');

  shadow.innerHTML = `
    <style>
      .bubble {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: #1a1410; color: #ffe9c7; border: 1px solid #d97706;
        border-radius: 10px; padding: 12px 14px; max-width: 320px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35); font-size: 13px; line-height: 1.5;
      }
      .title { font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
      .close {
        margin-left: auto; cursor: pointer; opacity: 0.6; border: none; background: none;
        color: inherit; font-size: 15px; line-height: 1; padding: 0 0 0 8px;
      }
      .close:hover { opacity: 1; }
      a { color: #ffb864; text-decoration: underline; }
    </style>
    <div class="bubble">
      <div class="title">⚠️ Contract address, not a wallet<button class="close" title="Dismiss">×</button></div>
      <div>This address has contract code on ${chains}. Sending ERC-20 tokens here may strand them permanently instead of reaching a wallet.</div>
      <div style="margin-top:6px;"><a href="https://www.usesalvage.xyz" target="_blank" rel="noopener">Check it on Salvage →</a></div>
    </div>
  `;

  document.body.appendChild(host);
  shadow.querySelector('.close').addEventListener('click', dismissWarning);

  const position = () => {
    const rect = el.getBoundingClientRect();
    host.style.left = `${Math.max(8, rect.left)}px`;
    host.style.top = `${rect.bottom + 6}px`;
  };
  position();

  window.addEventListener('scroll', position, true);
  window.addEventListener('resize', position);

  activeWarning = {
    target: el,
    cleanup() {
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
      host.remove();
    },
  };
}

document.addEventListener('input', (e) => {
  if (!isTextField(e.target)) return;
  scheduleCheck(e.target, DEBOUNCE_MS);
}, true);

document.addEventListener('paste', (e) => {
  if (!isTextField(e.target)) return;
  scheduleCheck(e.target, PASTE_DEBOUNCE_MS);
}, true);

document.addEventListener('blur', (e) => {
  if (activeWarning?.target === e.target) {
    setTimeout(dismissWarning, 200); // allow the "Check it on Salvage" click to register first
  }
}, true);
