/* ═══════════════════════════════════════════════════════════
   persona.js — AMI Browser Persona Page Logic
   Text parsing for profile import
   ═══════════════════════════════════════════════════════════ */
'use strict';

const PERSONA_FIELDS = [
  'name','firstName','lastName','email','phone','company','jobTitle',
  'address','city','zip','country','website','bio','skills','education','languages'
];

/* ══════════════ Storage helpers ══════════════ */
function storeGet(key, fallback) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, d => resolve(d[key] ?? fallback));
  });
}
function storeSet(key, val) {
  return new Promise(resolve => chrome.storage.local.set({ [key]: val }, resolve));
}

/* ══════════════ Toast ══════════════ */
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2500);
}

/* ══════════════ Load / Save ══════════════ */
async function loadPersona() {
  const persona = await storeGet('ami_persona', {});
  PERSONA_FIELDS.forEach(f => {
    const el = document.getElementById(`persona-${f}`);
    if (el && persona[f]) el.value = persona[f];
  });
}

function getPersonaFromForm() {
  const persona = {};
  PERSONA_FIELDS.forEach(f => {
    const el = document.getElementById(`persona-${f}`);
    if (el && el.value.trim()) persona[f] = el.value.trim();
  });
  return persona;
}

async function savePersona() {
  const persona = getPersonaFromForm();
  await storeSet('ami_persona', persona);
  showToast('✅ Persona saved');
}

function applyPersonaToForm(data) {
  PERSONA_FIELDS.forEach(f => {
    const el = document.getElementById(`persona-${f}`);
    if (el && data[f]) el.value = data[f];
  });
}

function normalizeImportedText(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitSections(text) {
  const lines = text.split('\n').map(l => l.trim());
  const sectionNames = [
    'summary', 'about', 'profile', 'experience', 'work experience', 'employment',
    'education', 'skills', 'languages', 'projects', 'certifications', 'contact',
  ];
  const sections = {};
  let current = 'root';
  sections[current] = [];

  for (const line of lines) {
    const norm = line.toLowerCase().replace(/[:：]$/, '').trim();
    if (sectionNames.includes(norm)) {
      current = norm;
      if (!sections[current]) sections[current] = [];
      continue;
    }
    if (line) sections[current].push(line);
  }
  return sections;
}

/* ══════════════ Text parsing engine (local) ══════════════ */
function parseTextToPersona(text) {
  text = normalizeImportedText(text);
  const result = {};
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const fullText = text;
  const sections = splitSections(fullText);

  // Email
  const emailMatch = fullText.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (emailMatch) result.email = emailMatch[0];

  // Phone — international formats
  const phoneMatch = fullText.match(/(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{1,4}\)?[-.\s]?)?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{2,4}/);
  if (phoneMatch) {
    const cleaned = phoneMatch[0].replace(/[^\d+()-\s]/g, '').trim();
    if (cleaned.replace(/\D/g, '').length >= 7) result.phone = cleaned;
  }

  // Website / URL
  const urlMatch = fullText.match(/https?:\/\/[\w.-]+(?:\.[\w.-]+)+[^\s,)>]*/i);
  if (urlMatch) result.website = urlMatch[0];

  // LinkedIn URL extraction
  const linkedinMatch = fullText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i);
  if (linkedinMatch && !result.website) result.website = linkedinMatch[0].startsWith('http') ? linkedinMatch[0] : `https://${linkedinMatch[0]}`;

  // Name — try labeled patterns first, then heuristic
  const namePatterns = [
    /(?:full\s*name|name)\s*[:：]\s*(.+)/i,
    /(?:^|\n)\s*([A-ZÀ-Ý][a-zA-ZÀ-ÿ'\-]+\s+[A-ZÀ-Ý][a-zA-ZÀ-ÿ'\-]+(?:\s+[A-ZÀ-Ý][a-zA-ZÀ-ÿ'\-]+){0,2})\s*(?:\n|$)/,
    /(?:^|\n)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*(?:\n|$)/,
  ];
  for (const p of namePatterns) {
    const m = fullText.match(p);
    if (m) { result.name = m[1].trim(); break; }
  }
  if (!result.name && lines.length) {
    const firstLine = lines[0];
    if (/^[A-Z][a-zA-ZÀ-ÿ'-]+(?:\s+[A-Z][a-zA-ZÀ-ÿ'-]+){0,3}$/.test(firstLine) && firstLine.length < 60) {
      result.name = firstLine;
    }
  }

  // Split name into first/last
  if (result.name) {
    const parts = result.name.split(/\s+/);
    if (parts.length >= 2) {
      result.firstName = parts[0];
      result.lastName = parts.slice(1).join(' ');
    } else {
      result.firstName = result.name;
    }
  }

  // Email-based name extraction fallback
  if (!result.name && result.email) {
    const local = result.email.split('@')[0];
    const nameParts = local.split(/[._-]/).filter(p => p.length > 1);
    if (nameParts.length >= 2) {
      result.firstName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1);
      result.lastName = nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1);
      result.name = `${result.firstName} ${result.lastName}`;
    }
  }

  // Job title patterns
  const jobPatterns = [
    /(?:title|position|role|job\s*title)\s*[:：]\s*(.+)/i,
    /(?:^|\n)\s*(?:Senior|Junior|Lead|Chief|Head|Director|Manager|Engineer|Developer|Designer|Analyst|Consultant|Specialist|Coordinator|Associate|VP|Vice President|CTO|CEO|CFO|COO|CIO|Founder|Co-founder)\s*.{0,80}(?:\n|$)/i,
  ];
  for (const p of jobPatterns) {
    const m = fullText.match(p);
    if (m) { result.jobTitle = (m[1] || m[0]).trim(); break; }
  }

  // Company
  const compPatterns = [
    /(?:company|organization|employer|org|at)\s*[:：]\s*(.+)/i,
    /(?:at|@)\s+([A-Z][\w\s&.-]{1,40}?)(?:\s*[-–|,]|\n|$)/,
  ];
  for (const p of compPatterns) {
    const m = fullText.match(p);
    if (m) { result.company = m[1].trim(); break; }
  }

  // Address
  const addrMatch = fullText.match(/(?:address)\s*[:：]\s*(.+)/i);
  if (addrMatch) result.address = addrMatch[1].trim();

  // City
  const cityMatch = fullText.match(/(?:city|town|location)\s*[:：]\s*(.+)/i);
  if (cityMatch) result.city = cityMatch[1].trim();

  // Country
  const countryMatch = fullText.match(/(?:country|nation)\s*[:：]\s*(.+)/i);
  if (countryMatch) result.country = countryMatch[1].trim();

  // ZIP
  const zipMatch = fullText.match(/(?:zip|postal\s*code|postcode)\s*[:：]\s*(\d{4,10}[-\s]?\d{0,4})/i);
  if (zipMatch) result.zip = zipMatch[1].trim();

  // Skills
  const skillsMatch = fullText.match(/(?:skills?|expertise|technologies|tech\s*stack)\s*[:：]\s*(.+(?:\n(?!\n).+)*)/i);
  if (skillsMatch) result.skills = skillsMatch[1].replace(/\n/g, ', ').trim();
  if (!result.skills && sections.skills?.length) {
    result.skills = sections.skills
      .map(s => s.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 30)
      .join(', ');
  }

  // Education
  const eduMatch = fullText.match(/(?:education|degree|university|college|school)\s*[:：]\s*(.+(?:\n(?!\n).+)*)/i);
  if (eduMatch) result.education = eduMatch[1].replace(/\n/g, ', ').trim();
  if (!result.education && sections.education?.length) {
    result.education = sections.education.slice(0, 5).join(', ');
  }

  // Languages
  const langMatch = fullText.match(/(?:languages?|speaks?)\s*[:：]\s*(.+)/i);
  if (langMatch) result.languages = langMatch[1].trim();
  if (!result.languages && sections.languages?.length) {
    result.languages = sections.languages
      .map(s => s.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean)
      .join(', ');
  }

  // Bio
  const bioMatch = fullText.match(/(?:about|summary|bio|profile|objective)\s*[:：]?\s*\n?(.{20,700})/is);
  if (bioMatch) result.bio = bioMatch[1].trim().substring(0, 300);
  if (!result.bio && sections.summary?.length) {
    result.bio = sections.summary.join(' ').slice(0, 300);
  } else if (!result.bio && sections.about?.length) {
    result.bio = sections.about.join(' ').slice(0, 300);
  }

  // Fallbacks
  if (!result.jobTitle) {
    const likelyTitle = lines.find(l => /engineer|developer|designer|manager|consultant|analyst|architect|founder|director|lead|product/i.test(l) && l.length <= 100);
    if (likelyTitle) result.jobTitle = likelyTitle;
  }
  if (!result.company) {
    const atPattern = fullText.match(/(?:\b(?:at|chez|@)\s+)([A-Z][\w&.,'\- ]{1,50})/i);
    if (atPattern) result.company = atPattern[1].trim();
  }

  return result;
}

/* ══════════════ File reader ══════════════ */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const out = typeof reader.result === 'string' ? reader.result : '';
      resolve(normalizeImportedText(out));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/* ══════════════ Preview ══════════════ */
let pendingImport = null;

function showPreview(data) {
  pendingImport = data;
  const container = document.getElementById('import-preview');
  const content = document.getElementById('import-preview-content');
  if (!container || !content) return;

  content.innerHTML = '';
  const fields = Object.entries(data).filter(([, v]) => v);
  if (!fields.length) {
    content.innerHTML = '<p style="color:#9ca3af">No data could be extracted. Try pasting more text or a different format.</p>';
    container.classList.remove('hidden');
    return;
  }

  fields.forEach(([k, v]) => {
    const row = document.createElement('div');
    row.className = 'field-row';
    row.innerHTML = `<span class="field-label">${k}:</span><span>${escHtml(String(v).substring(0, 200))}</span>`;
    content.appendChild(row);
  });
  container.classList.remove('hidden');
}

function hidePreview() {
  pendingImport = null;
  const container = document.getElementById('import-preview');
  if (container) container.classList.add('hidden');
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ══════════════ Event bindings ══════════════ */
document.addEventListener('DOMContentLoaded', () => {
  loadPersona();

  // Save
  document.getElementById('btn-save-persona')?.addEventListener('click', savePersona);

  // Export
  document.getElementById('btn-export-persona')?.addEventListener('click', async () => {
    const persona = getPersonaFromForm();
    const blob = new Blob([JSON.stringify(persona, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ami-persona-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📋 Persona exported');
  });

  // Clear
  document.getElementById('btn-clear-persona')?.addEventListener('click', async () => {
    if (!confirm('Clear all persona data?')) return;
    PERSONA_FIELDS.forEach(f => {
      const el = document.getElementById(`persona-${f}`);
      if (el) el.value = '';
    });
    await storeSet('ami_persona', {});
    showToast('🗑️ Persona cleared');
  });

  // JSON import
  document.getElementById('btn-import-json')?.addEventListener('click', () => {
    document.getElementById('file-json')?.click();
  });
  document.getElementById('file-json')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const data = JSON.parse(text);
      showPreview(data);
      showToast(`📋 Loaded ${Object.keys(data).length} fields from JSON`);
    } catch {
      showToast('❌ Invalid JSON file');
    }
    e.target.value = '';
  });

  // Text import
  document.getElementById('btn-import-text')?.addEventListener('click', () => {
    document.getElementById('text-import-area')?.classList.remove('hidden');
  });
  document.getElementById('btn-cancel-text')?.addEventListener('click', () => {
    document.getElementById('text-import-area')?.classList.add('hidden');
  });
  document.getElementById('btn-parse-text')?.addEventListener('click', () => {
    const input = document.getElementById('text-import-input');
    if (!input?.value.trim()) { showToast('Paste some text first'); return; }
    const parsed = parseTextToPersona(input.value);
    showPreview(parsed);
    document.getElementById('text-import-area')?.classList.add('hidden');
    showToast(`📝 Extracted ${Object.keys(parsed).length} fields`);
  });

  // Apply imported data
  document.getElementById('btn-apply-import')?.addEventListener('click', async () => {
    if (!pendingImport) return;
    applyPersonaToForm(pendingImport);
    await savePersona();
    hidePreview();
    showToast('✅ Persona updated from import');
  });
  document.getElementById('btn-cancel-import')?.addEventListener('click', hidePreview);
});
