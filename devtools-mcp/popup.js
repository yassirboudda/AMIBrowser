/**
 * DevTools MCP Logger - Popup Script
 */

let currentTabId = null;
let isActive = false;
let statsInterval = null;

document.addEventListener("DOMContentLoaded", async () => {
  const toggleBtn = document.getElementById("toggle-btn");
  const toggleText = document.getElementById("toggle-text");
  const journalBtn = document.getElementById("journal-btn");
  const tabUrlEl = document.getElementById("tab-url");
  const statsEl = document.getElementById("stats");
  const serverStatus = document.getElementById("server-status");
  const serverWarning = document.getElementById("server-warning");

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    tabUrlEl.textContent = "No active tab";
    return;
  }
  currentTabId = tab.id;
  tabUrlEl.textContent = tab.url || "unknown";

  // Check MCP server status
  chrome.runtime.sendMessage({ action: "checkMcpServer" }, (resp) => {
    if (resp?.connected) {
      serverStatus.classList.remove("disconnected");
      serverStatus.classList.add("connected");
      serverWarning.classList.add("hidden");
    } else {
      serverStatus.classList.remove("connected");
      serverStatus.classList.add("disconnected");
      serverWarning.classList.remove("hidden");
    }
    toggleBtn.disabled = false;
  });

  // Check current status
  chrome.runtime.sendMessage({ action: "getStatus", tabId: currentTabId }, (resp) => {
    if (resp?.active) {
      setActiveState(true);
    }
  });

  // Toggle button
  toggleBtn.addEventListener("click", async () => {
    toggleBtn.disabled = true;
    if (isActive) {
      chrome.runtime.sendMessage({ action: "deactivate", tabId: currentTabId }, (resp) => {
        setActiveState(false);
        toggleBtn.disabled = false;
      });
    } else {
      chrome.runtime.sendMessage({ action: "activate", tabId: currentTabId }, (resp) => {
        if (resp?.success) {
          setActiveState(true);
        } else {
          alert("Failed to activate: " + (resp?.error || "Unknown error"));
        }
        toggleBtn.disabled = false;
      });
    }
  });

  // Journal button
  journalBtn.addEventListener("click", () => {
    chrome.windows.create({
      url: chrome.runtime.getURL(`journal.html?tabId=${currentTabId}`),
      type: "popup",
      width: 800,
      height: 600,
    });
  });

  function setActiveState(active) {
    isActive = active;
    if (active) {
      toggleText.textContent = "Deactivate";
      toggleBtn.classList.remove("btn-activate");
      toggleBtn.classList.add("btn-deactivate", "recording");
      statsEl.classList.remove("hidden");
      startStatsPolling();
    } else {
      toggleText.textContent = "Activate";
      toggleBtn.classList.remove("btn-deactivate", "recording");
      toggleBtn.classList.add("btn-activate");
      statsEl.classList.add("hidden");
      stopStatsPolling();
      // Reset stats
      document.getElementById("stat-logs").textContent = "0";
      document.getElementById("stat-errors").textContent = "0";
      document.getElementById("stat-network").textContent = "0";
      document.getElementById("stat-console").textContent = "0";
    }
  }

  function startStatsPolling() {
    updateStats();
    statsInterval = setInterval(updateStats, 2000);
  }

  function stopStatsPolling() {
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }
  }

  function updateStats() {
    chrome.runtime.sendMessage({ action: "getJournal", tabId: currentTabId }, (resp) => {
      if (!resp?.journal) return;
      const journal = resp.journal;
      const errors = journal.filter((e) => e.category === "error").length;
      const network = journal.filter((e) => e.category === "network").length;
      const consoleMsgs = journal.filter((e) => e.category === "console").length;
      document.getElementById("stat-logs").textContent = journal.length;
      document.getElementById("stat-errors").textContent = errors;
      document.getElementById("stat-network").textContent = network;
      document.getElementById("stat-console").textContent = consoleMsgs;
    });
  }
});
