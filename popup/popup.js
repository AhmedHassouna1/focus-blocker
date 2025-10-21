// popup.js - UI logic with countdown + progress bar + notifications
const STATE_KEY = "focusBlocker_state";

document.addEventListener("DOMContentLoaded", async () => {
  const durationEl = document.getElementById("duration");
  const breakEl = document.getElementById("breakDuration");
  const sitesEl = document.getElementById("sites");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const statusText = document.getElementById("statusText");
  const progressFill = document.getElementById("progressFill");

  // Load saved blocked sites if موجودة
  const saved = await chrome.storage.local.get("blockedSites");
  if (saved.blockedSites) sitesEl.value = saved.blockedSites.join("\n");

  // Update UI every second if session نشطة
  let uiInterval = null;
  async function refreshUI() {
    const data = await chrome.storage.local.get(STATE_KEY);
    const state = data[STATE_KEY];
    if (state && state.endTime) {
      const now = Date.now();
      const total = Math.max(1, state.endTime - state.createdAt);
      const remaining = Math.max(0, state.endTime - now);
      const percent = Math.min(100, Math.round(((total - remaining) / total) * 100));
      progressFill.style.width = percent + "%";
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      statusText.innerText = `جلسة نشطة — تبقى ${mins} دقيقة و ${secs} ثانية.`;
      startBtn.disabled = true;
    } else {
      progressFill.style.width = "0%";
      statusText.innerText = "لا توجد جلسة نشطة.";
      startBtn.disabled = false;
    }
  }

  uiInterval = setInterval(refreshUI, 1000);
  await refreshUI();

  // Start
  startBtn.addEventListener("click", async () => {
    const minutes = parseInt(durationEl.value, 10) || 25;
    const breakMinutes = parseInt(breakEl.value, 10) || 5;
    const sites = sitesEl.value.split("\n").map(s => s.trim()).filter(Boolean);
    // حفظ المواقع
    await chrome.storage.local.set({ blockedSites: sites });
    // أرسل رسالة للخلفية لبدء الجلسة
    chrome.runtime.sendMessage({ type: "start", minutes, blockedSites: sites });
    // إشعار محلي كذلك
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Focus Blocker",
      message: `بدأت جلسة لمدة ${minutes} دقيقة.`
    });
    await refreshUI();
    // فوراً اطلب فحص كل التبويبات (الخلفية تقوم بذلك لكن نضمن)
    chrome.runtime.sendMessage({ type: "ping" });
  });

  // Stop
  stopBtn.addEventListener("click", async () => {
    chrome.runtime.sendMessage({ type: "stop" });
    await chrome.storage.local.remove(STATE_KEY);
    await chrome.alarms.clear("focus_end");
    statusText.innerText = "الجلسة أوقفت.";
    progressFill.style.width = "0%";
  });

  // زر الاستراحة السريعة في الواجهة (لو حبيت تضيف زر هنا لاحقاً)
  // مثال: نرسل رسالة pauseFor مع قيمة breakMinutes
  // chrome.runtime.sendMessage({ type: "pauseFor", minutes: breakMinutes });

  // حدث حفظ المواقع تلقائياً عند الخروج
  window.addEventListener("unload", async () => {
    const sites = sitesEl.value.split("\n").map(s => s.trim()).filter(Boolean);
    await chrome.storage.local.set({ blockedSites: sites });
  });
});
