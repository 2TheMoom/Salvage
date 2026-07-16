// Service worker: does the actual network call so content scripts never hit
// a page's own Content-Security-Policy, and so the check runs with the
// extension's own cross-origin privileges rather than the page's.

const API_BASE = 'https://www.usesalvage.xyz';
const CACHE_TTL_MS = 10 * 60 * 1000; // an address rarely changes contract-ness mid-session

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'CHECK_ADDRESS' || !msg.address) return false;

  checkAddress(msg.address).then(sendResponse);
  return true; // keep the message channel open for the async response
});

async function checkAddress(address) {
  const key = address.toLowerCase();
  const cached = await getCached(key);
  if (cached) return cached;

  try {
    const res = await fetch(`${API_BASE}/api/is-contract?address=${key}`);
    if (!res.ok) return { success: false };
    const data = await res.json();
    await setCached(key, data);
    return data;
  } catch {
    return { success: false };
  }
}

async function getCached(key) {
  const store = await chrome.storage.session.get(key);
  const entry = store[key];
  if (!entry || Date.now() - entry.at > CACHE_TTL_MS) return null;
  return entry.data;
}

async function setCached(key, data) {
  await chrome.storage.session.set({ [key]: { data, at: Date.now() } });
}
