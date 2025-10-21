// service_worker.js
// Focus Blocker v2.0 - background service worker
const STATE_KEY = "focusBlocker_state";
const STATS_KEY = "focusBlocker_stats"; // للتتبّع البسيط

// نمط مطابق مبسّط
function urlMatchesPatterns(url, patterns = []) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    for (const p of patterns) {
      const pattern = p.trim().toLowerCase();
      if (!pattern) continue;
      if (pattern.startsWith("*.") && (host === pattern.slice(2) || host.endsWith("." + pattern.slice(2)))) return true;
      if (host === pattern || host.endsWith("." + pattern) || host.includes(pattern)) return true;
      if (url.toLowerCase().includes(pattern)) return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

// حقن سكربت الحجب في تبويب محدد
async function injectBlock(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content_block.js']
    });
  } catch (err) {
    // صامت — بعض الصفحات لا تسمح بالحقن
  }
}

// طلب إزالة الـ overlay من تبويب
async function removeBlock(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: "removeOverlay" });
  } catch (e) { }
}

// فحص تبويب واحد
async function checkTab(tab) {
  if (!tab || !tab.id || !tab.url) return;
  const data = await chrome.storage.local.get(STATE_KEY);
  const state = data[STATE_KEY];
  const now = Date.now();
  if (state && state.endTime && !state.cancelled && now < state.endTime) {
    const pausedUntil = state.pausedUntil || 0;
    if (now < pausedUntil) {
      await removeBlock(tab.id);
      return;
    }
    const patterns = state.blockedSites || [];
    if (urlMatchesPatterns(tab.url, patterns)) {
      await injectBlock(tab.id);
    } else {
      await removeBlock(tab.id);
    }
  } else {
    // جلسة غير فعالة -> إزالة إذا موجود
    await removeBlock(tab.id);
  }
}

// فحص كل التبويبات الحالية (عند بدء الجلسة فوراً)
async function checkAllTabs() {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    await checkTab(t);
  }
}

// بدء جلسة: يخزن الحالة ويخلق منبّه
async function startSession({ minutes, blockedSites }) {
  const now = Date.now();
  const endTime = now + minutes * 60 * 1000;
  const state = {
    createdAt: now,
    endTime,
    blockedSites,
    pausedUntil: 0,
    cancelled: false
  };
  await chrome.storage.local.set({ [STATE_KEY]: state });
  await chrome.alarms.clear("focus_end");
  chrome.alarms.create("focus_end", { when: endTime });
  // احصاء بسيط
  const stats = (await chrome.storage.local.get(STATS_KEY))[STATS_KEY] || { sessions: 0, focusedMinutes: 0, breaks: 0, attemptsBlocked: 0 };
  stats.sessions = (stats.sessions || 0) + 1;
  await chrome.storage.local.set({ [STATS_KEY]: stats });
  // إشعار بداية الجلسة
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "Focus Blocker",
    message: `بدأت جلسة تركيز لمدة ${minutes} دقيقة. بالتوفيق!`
  });
  // فحص كل التبويبات الآن
  await checkAllTabs();
}

// إيقاف الجلسة
async function stopSession() {
  await chrome.storage.local.remove(STATE_KEY);
  await chrome.alarms.clear("focus_end");
  // حاول إزالة overlays من كل التبويبات
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    try { await chrome.tabs.sendMessage(t.id, { action: "removeOverlay" }); } catch (e) { }
  }
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "Focus Blocker",
    message: "تم إيقاف جلسة التركيز."
  });
}

// تعامل مع رسائل من الـ popup/content
chrome.runtime.onMessage.addListener((msg, sender, sendResp) => {
  if (!msg || !msg.type) return;
  if (msg.type === "start") {
    startSession({ minutes: msg.minutes, blockedSites: msg.blockedSites });
  } else if (msg.type === "stop") {
    stopSession();
  } else if (msg.type === "pauseFor") {
    // وضع استراحة قصيرة
    (async () => {
      const data = await chrome.storage.local.get(STATE_KEY);
      const state = data[STATE_KEY];
      if (!state) return;
      state.pausedUntil = Date.now() + (msg.minutes || 5) * 60 * 1000;
      await chrome.storage.local.set({ [STATE_KEY]: state });
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Focus Blocker",
        message: `تم تفعيل استراحة لمدة ${msg.minutes || 5} دقائق.`
      });
      // إزالة overlays حالياً
      const tabs = await chrome.tabs.query({});
      for (const t of tabs) {
        try { await chrome.tabs.sendMessage(t.id, { action: "removeOverlay" }); } catch (e) { }
      }
    })();
  } else if (msg.type === "reportAttempt") {
    // زوّد عداد المحاولات المحجوبة
    (async () => {
      const stats = (await chrome.storage.local.get(STATS_KEY))[STATS_KEY] || { sessions: 0, focusedMinutes: 0, breaks: 0, attemptsBlocked: 0 };
      stats.attemptsBlocked = (stats.attemptsBlocked || 0) + 1;
      await chrome.storage.local.set({ [STATS_KEY]: stats });
    })();
  }
});

// عند تغيير/تفعيل تبويب
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    checkTab(tab);
  }
});
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  checkTab(tab);
});

// عندما ينتهي المنبه
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "focus_end") {
    // احسب كم دقيقة ركّز المستخدم لتحديث الإحصاء
    const data = await chrome.storage.local.get(STATE_KEY);
    const state = data[STATE_KEY];
    if (state && state.endTime && state.createdAt) {
      const mins = Math.round((state.endTime - state.createdAt) / 60000);
      const stats = (await chrome.storage.local.get(STATS_KEY))[STATS_KEY] || { sessions: 0, focusedMinutes: 0, breaks: 0, attemptsBlocked: 0 };
      stats.focusedMinutes = (stats.focusedMinutes || 0) + mins;
      await chrome.storage.local.set({ [STATS_KEY]: stats });
    }
    // أنهِ الجلسة وابلغ المستخدم
    await stopSession();
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Focus Blocker",
      message: "انتهت جلسة التركيز — أحسنت!"
    });
  }
});

// عند تثبيت/تحديث الإضافة، تهيئة إن لزم
chrome.runtime.onInstalled.addListener(() => {
  // إعداد افتراضي بسيط
  chrome.storage.local.get(["blockedSites"], (res) => {
    if (!res.blockedSites) {
      chrome.storage.local.set({ blockedSites: ["youtube.com", "facebook.com", "twitter.com", "tiktok.com"] });
    }
  });
});
