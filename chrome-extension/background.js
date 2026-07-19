// Service worker: does the actual network call so content scripts never hit
// a page's own Content-Security-Policy, and so the check runs with the
// extension's own cross-origin privileges rather than the page's.

const API_BASE = 'https://www.usesalvage.xyz';
const CACHE_TTL_MS = 10 * 60 * 1000; // an address rarely changes contract-ness mid-session
const FETCH_TIMEOUT_MS = 8000; // never let a hung request hold the message channel open indefinitely
const RESPONSE_TIMEOUT_MS = 9000; // hard ceiling on the whole op — a stuck chrome.storage call
                                   // (not just fetch) must never hold the channel open forever,
                                   // since Chrome reports an unresponsive message handler as a crash

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'CHECK_ADDRESS' || !msg.address) return false;

  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve({ success: false }), RESPONSE_TIMEOUT_MS);
  });

  Promise.race([checkAddress(msg.address), timeout])
    .then(sendResponse)
    .catch(() => sendResponse({ success: false })); // never leave the caller hanging
  return true; // keep the message channel open for the async response
});

async function checkAddress(address) {
  const key = address.toLowerCase();

  try {
    const cached = await getCached(key);
    if (cached) return cached;
  } catch {
    // storage unavailable — fall through and check live instead of hanging
  }

  try {
    const res = await fetch(`${API_BASE}/api/is-contract?address=${key}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { success: false };
    const data = await res.json();
    setCached(key, data).catch(() => {}); // best-effort, never blocks the response
    return data;
  } catch {
    return { success: false };
  }
}

async function getCached(key) {
  const store = await chrome.storage.session.get(key);
  const entry = store[key];
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    chrome.storage.session.remove(key).catch(() => {}); // stale — stop it accumulating forever
    return null;
  }
  return entry.data;
}

async function setCached(key, data) {
  await chrome.storage.session.set({ [key]: { data, at: Date.now() } });
}
