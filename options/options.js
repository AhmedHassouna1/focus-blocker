// options.js
const STATS_KEY = "focusBlocker_stats";

document.addEventListener("DOMContentLoaded", async () => {
  const sitesEl = document.getElementById("sites");
  const saveBtn = document.getElementById("save");
  const clearBtn = document.getElementById("clear");
  const statsEl = document.getElementById("stats");

  const data = await chrome.storage.local.get(["blockedSites", STATS_KEY]);
  if (data.blockedSites) sitesEl.value = data.blockedSites.join("\n");
  const stats = data[STATS_KEY] || { sessions: 0, focusedMinutes: 0, breaks: 0, attemptsBlocked: 0 };
  renderStats(stats);

  saveBtn.addEventListener("click", async () => {
    const lines = sitesEl.value.split("\n").map(l => l.trim()).filter(Boolean);
    await chrome.storage.local.set({ blockedSites: lines });
    alert("تم الحفظ");
  });

  clearBtn.addEventListener("click", async () => {
    sitesEl.value = "";
    await chrome.storage.local.remove("blockedSites");
    alert("تم المسح");
  });

  function renderStats(s) {
    statsEl.innerHTML = `
      <div>عدد الجلسات: <strong>${s.sessions || 0}</strong></div>
      <div>مجموع دقائق التركيز: <strong>${s.focusedMinutes || 0}</strong></div>
      <div>محاولات فتح مواقع محظورة: <strong>${s.attemptsBlocked || 0}</strong></div>
    `;
  }
});
