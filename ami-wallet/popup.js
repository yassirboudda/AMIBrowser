'use strict';

// Core Wallet extension ID on Chrome Web Store
const CORE_WALLET_CWS_URL = 'https://chromewebstore.google.com/detail/core-crypto-wallet-nft-de/agoakfejjabomempkjlepdflaleeobhb';

// Check if Core Wallet is installed by looking for its provider
async function isCoreInstalled() {
  return new Promise(resolve => {
    chrome.management.getAll(exts => {
      if (chrome.runtime.lastError) {
        resolve(false);
        return;
      }
      const core = exts.find(e =>
        e.name.toLowerCase().includes('core') &&
        (e.description || '').toLowerCase().includes('wallet')
      );
      resolve(!!core && core.enabled);
    });
  });
}

async function init() {
  const coreInstalled = await isCoreInstalled();

  const coreStatus = document.getElementById('core-status');
  const installBtn = document.getElementById('install-core');

  if (coreInstalled) {
    coreStatus.style.display = 'block';
    installBtn.closest('.card').querySelector('.card-title').textContent = 'Installed';
    installBtn.querySelector('.wallet-desc').textContent = 'Core Wallet is active. Click to open Core Wallet settings.';
    installBtn.querySelector('.badge').textContent = 'Installed';
    installBtn.querySelector('.badge').className = 'badge badge-builtin';
  }

  installBtn.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: CORE_WALLET_CWS_URL });
  });
}

init();
