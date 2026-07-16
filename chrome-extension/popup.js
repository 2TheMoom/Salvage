const input = document.getElementById('address');
const result = document.getElementById('result');
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

let timer = null;

input.addEventListener('input', () => {
  clearTimeout(timer);
  const value = input.value.trim();

  if (!value) {
    setResult('Checks if it\'s a wallet or a contract.', 'muted');
    return;
  }
  if (!ADDRESS_RE.test(value)) {
    setResult('Not a valid address yet…', 'muted');
    return;
  }

  setResult('Checking…', 'muted');
  timer = setTimeout(() => check(value), 250);
});

function check(address) {
  chrome.runtime.sendMessage({ type: 'CHECK_ADDRESS', address: address.toLowerCase() }, (res) => {
    if (chrome.runtime.lastError || !res?.success) {
      setResult('Could not reach Salvage — try again.', 'muted');
      return;
    }
    if (res.eth || res.base) {
      const chains = [res.eth && 'Ethereum', res.base && 'Base'].filter(Boolean).join(' + ');
      setResult(`⚠️ Contract address (${chains}). Sending ERC-20 tokens here may strand them.`, 'warn');
    } else {
      setResult('✓ No contract code found on Ethereum or Base — looks like a regular wallet.', 'safe');
    }
  });
}

function setResult(text, cls) {
  result.textContent = text;
  result.className = cls;
}
