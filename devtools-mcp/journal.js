/**
 * DevTools MCP Logger - Log Journal
 */

let allEntries = [];
let filteredEntries = [];
let currentFilter = "all";
let currentSearch = "";
let pollInterval = null;
let autoScroll = true;

const params = new URLSearchParams(window.location.search);
const tabId = parseInt(params.get("tabId"), 10);

document.addEventListener("DOMContentLoaded", () => {
  const entriesContainer = document.getElementById("journal-entries");
  const filterSelect = document.getElementById("filter-category");
  const searchInput = document.getElementById("search-input");
  const copyBtn = document.getElementById("copy-btn");
  const copyJsonBtn = document.getElementById("copy-json-btn");
  const clearBtn = document.getElementById("clear-btn");
  const statusText = document.getElementById("status-text");
  const entryCount = document.getElementById("entry-count");
  const toast = document.getElementById("copy-toast");

  // Filter change
  filterSelect.addEventListener("change", (e) => {
    currentFilter = e.target.value;
    applyFilters();
  });

  // Search
  searchInput.addEventListener("input", (e) => {
    currentSearch = e.target.value.toLowerCase();
    applyFilters();
  });

  // Copy all as text
  copyBtn.addEventListener("click", () => {
    const text = filteredEntries
      .map((e) => {
        const time = formatTime(e.timestamp);
        const summary = summarizeEntry(e);
        return `[${time}] [${e.category}] ${e.type}: ${summary}`;
      })
      .join("\n");
    copyToClipboard(text);
  });

  // Copy as JSON
  copyJsonBtn.addEventListener("click", () => {
    copyToClipboard(JSON.stringify(filteredEntries, null, 2));
  });

  // Clear
  clearBtn.addEventListener("click", () => {
    allEntries = [];
    filteredEntries = [];
    renderEntries();
  });

  // Auto-scroll detection
  entriesContainer.addEventListener("scroll", () => {
    const { scrollTop, scrollHeight, clientHeight } = entriesContainer;
    autoScroll = scrollHeight - scrollTop - clientHeight < 50;
  });

  function applyFilters() {
    filteredEntries = allEntries.filter((entry) => {
      if (currentFilter !== "all" && entry.category !== currentFilter) return false;
      if (currentSearch) {
        const text = JSON.stringify(entry).toLowerCase();
        return text.includes(currentSearch);
      }
      return true;
    });
    renderEntries();
  }

  function renderEntries() {
    entryCount.textContent = `${filteredEntries.length} entries`;
    if (filteredEntries.length === 0) {
      entriesContainer.innerHTML = `
        <div class="empty-state">
          <p>No log entries${currentFilter !== "all" ? " for this category" : ""}.</p>
          <p>Activate the extension on a page to start recording.</p>
        </div>`;
      return;
    }

    // Render (limit to last 2000 for performance)
    const toRender = filteredEntries.slice(-2000);
    const fragment = document.createDocumentFragment();
    for (const entry of toRender) {
      fragment.appendChild(createEntryElement(entry));
    }
    entriesContainer.innerHTML = "";
    entriesContainer.appendChild(fragment);

    if (autoScroll) {
      entriesContainer.scrollTop = entriesContainer.scrollHeight;
    }
  }

  function createEntryElement(entry) {
    const div = document.createElement("div");
    div.className = `log-entry ${entry.category}`;

    const time = document.createElement("span");
    time.className = "log-time";
    time.textContent = formatTime(entry.timestamp);

    const cat = document.createElement("span");
    cat.className = `log-category ${entry.category}`;
    cat.textContent = entry.category;

    const type = document.createElement("span");
    type.className = "log-type";
    type.textContent = entry.type;

    const data = document.createElement("span");
    data.className = "log-data";
    data.textContent = summarizeEntry(entry);

    const copyBtnEl = document.createElement("button");
    copyBtnEl.className = "log-entry-copy";
    copyBtnEl.textContent = "📋";
    copyBtnEl.title = "Copy this entry";
    copyBtnEl.addEventListener("click", (e) => {
      e.stopPropagation();
      copyToClipboard(JSON.stringify(entry, null, 2));
    });

    div.appendChild(time);
    div.appendChild(cat);
    div.appendChild(type);
    div.appendChild(data);
    div.appendChild(copyBtnEl);

    return div;
  }

  function summarizeEntry(entry) {
    const d = entry.data;
    if (!d) return "";

    switch (entry.category) {
      case "error":
        return d.text || d.description || d.errorText || JSON.stringify(d);
      case "network":
        if (entry.type === "request") return `${d.method || "GET"} ${d.url || ""}`;
        if (entry.type === "response") return `${d.status} ${d.url || ""}`;
        if (entry.type === "loading_failed") return `FAILED: ${d.errorText} ${d.requestId || ""}`;
        return JSON.stringify(d);
      case "console":
        return d.text || (d.args || []).join(" ") || JSON.stringify(d);
      case "dom":
        if (entry.type === "frame_navigated") return d.url || "";
        return JSON.stringify(d);
      case "performance":
        if (entry.type === "metrics") {
          const m = d.metrics;
          if (Array.isArray(m)) {
            return m.map((metric) => `${metric.name}=${metric.value}`).join(", ");
          }
        }
        return JSON.stringify(d);
      case "source":
        return d.url || "";
      default:
        return JSON.stringify(d);
    }
  }

  function formatTime(ts) {
    if (!ts) return "--:--:--";
    const date = new Date(ts);
    return date.toLocaleTimeString("en-US", { hour12: false }) + "." + 
           String(date.getMilliseconds()).padStart(3, "0");
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast("Copied to clipboard!");
    });
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), 2000);
  }

  // Poll for updates
  function pollJournal() {
    if (!tabId || isNaN(tabId)) {
      statusText.textContent = "No tab ID specified";
      return;
    }

    chrome.runtime.sendMessage({ action: "getJournal", tabId }, (resp) => {
      if (chrome.runtime.lastError) {
        statusText.textContent = "Extension disconnected";
        return;
      }

      if (!resp) {
        statusText.textContent = "No response from extension";
        return;
      }

      statusText.textContent = resp.active ? "● Recording" : "○ Inactive";
      statusText.style.color = resp.active ? "#a6e3a1" : "#6c7086";

      if (resp.journal && resp.journal.length !== allEntries.length) {
        allEntries = resp.journal;
        applyFilters();
      }
    });
  }

  pollJournal();
  pollInterval = setInterval(pollJournal, 1000);
});
