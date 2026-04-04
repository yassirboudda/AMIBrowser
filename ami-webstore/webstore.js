/* AMI Web Store — Enable CWS install in AMI Browser */
'use strict';

(function() {
  // Hide the "Switch to Chrome" banner that CWS shows for non-Chrome browsers
  function hideSwitchBanner() {
    const selectors = [
      // "Switch to Chrome to install extensions" banner
      '[role="banner"]',
      '.CtSBdf',  // known CWS banner class
      '.hSHfTb',  // another known banner class
    ];
    
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        const text = el.textContent || '';
        if (/switch to chrome|cambia a chrome|instalar extensiones/i.test(text)) {
          el.style.display = 'none';
        }
      });
    }
  }

  // Add "Add to AMI Browser" button on extension detail pages
  function addInstallButton() {
    // Check if we're on an extension detail page
    const urlMatch = window.location.pathname.match(/\/detail\/[^/]+\/([a-z]{32})/);
    if (!urlMatch) return;
    
    const extensionId = urlMatch[1];
    
    // Don't add if button already exists
    if (document.querySelector('.ami-install-btn')) return;
    
    // Find the CWS primary action area (where "Add to Chrome" would be)
    const actionAreas = document.querySelectorAll('button, [role="button"]');
    let targetArea = null;
    
    for (const btn of actionAreas) {
      const text = (btn.textContent || '').toLowerCase();
      if (text.includes('add to') || text.includes('install') || text.includes('agregar') || text.includes('añadir')) {
        targetArea = btn.parentElement;
        break;
      }
    }
    
    // Create the install button
    const installBtn = document.createElement('button');
    installBtn.className = 'ami-install-btn';
    installBtn.innerHTML = '<span class="ami-install-icon">+</span> Add to AMI Browser';
    installBtn.title = 'Download and install this extension in AMI Browser';
    
    installBtn.addEventListener('click', () => {
      // Construct the direct CRX download URL
      const crxUrl = `https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&prodversion=146.0&x=id%3D${extensionId}%26installsource%3Dondemand%26uc`;
      
      installBtn.textContent = 'Downloading...';
      installBtn.disabled = true;
      
      // Open the download - Chrome will handle the CRX install prompt
      window.location.href = crxUrl;
      
      setTimeout(() => {
        installBtn.innerHTML = '<span class="ami-install-icon">+</span> Add to AMI Browser';
        installBtn.disabled = false;
      }, 3000);
    });
    
    if (targetArea) {
      targetArea.prepend(installBtn);
    } else {
      // Fallback: create a floating install bar at top
      const bar = document.createElement('div');
      bar.className = 'ami-install-bar';
      bar.appendChild(installBtn);
      document.body.prepend(bar);
    }
  }

  // Run on load and on SPA navigation
  function init() {
    hideSwitchBanner();
    addInstallButton();
  }

  // Initial run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-run on SPA navigation (CWS is a SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(init, 500);
    }
    // Also keep hiding banners as they may load dynamically
    hideSwitchBanner();
  }).observe(document.body, { childList: true, subtree: true });
})();
