// content_block.js
(function () {
    if (window.__focusBlockerInjected) return;
    window.__focusBlockerInjected = true;
  
    const container = document.createElement("div");
    container.id = "focus-blocker-overlay";
    Object.assign(container.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      background: "linear-gradient rgba(0,0,0,0.88), rgba(0,0,0,0.95)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      boxSizing: "border-box",
      color: "#fff",
      fontFamily: "Inter, Arial, sans-serif",
      textAlign: "center"
    });
  
    const box = document.createElement("div");
    Object.assign(box.style, {
      maxWidth: "900px",
      width: "100%",
      background: "rgba(0,0,0,0.55)",
      borderRadius: "12px",
      padding: "26px",
      boxSizing: "border-box",
      boxShadow: "0 10px 30px rgba(0,0,0,0.6)"
    });
  
    const title = document.createElement("h1");
    title.innerText = "🚫 ركّز — Focus Mode";
    title.style.margin = "0 0 8px 0";
    title.style.fontSize = "28px";
  
    const quote = document.createElement("p");
    quote.id = "fb-quote";
    quote.style.margin = "6px 0 18px 0";
    quote.style.fontSize = "16px";
  
    // progress text (اختياري)
    const info = document.createElement("div");
    info.id = "fb-info";
    info.style.margin = "8px 0 16px 0";
    info.style.fontSize = "13px";
  
    const buttons = document.createElement("div");
    Object.assign(buttons.style, { display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" });
  
    const pauseBtn = document.createElement("button");
    pauseBtn.innerText = "استراحة قصيرة";
    styleButton(pauseBtn, "#ffc107", "#000");
  
    const stopBtn = document.createElement("button");
    stopBtn.innerText = "أوقف الجلسة";
    styleButton(stopBtn, "#e74c3c", "#fff");
  
    buttons.appendChild(pauseBtn);
    buttons.appendChild(stopBtn);
  
    box.appendChild(title);
    box.appendChild(quote);
    box.appendChild(info);
    box.appendChild(buttons);
    container.appendChild(box);
    document.documentElement.appendChild(container);
  
    // اقتباسات تحفيزية
    const quotes = [
      "ابدأ الآن، الأفضل لم يأت بعد.",
      "التركيز عبارة عن عادة — تمرّن عليها.",
      "دقيقة عمل أفضل من ساعة ندم.",
      "استثمر وقتك، فكل دقيقة تحسب.",
      "التركيز اليوم هو راحة الغد."
    ];
  
    // تغيّر الاقتباس كل 60 ثانية
    let quoteInterval = null;
    function rotateQuote() {
      const q = quotes[Math.floor(Math.random() * quotes.length)];
      const el = document.getElementById("fb-quote");
      if (el) el.innerText = q;
    }
    rotateQuote();
    quoteInterval = setInterval(rotateQuote, 60 * 1000);
  
    // طلب معلومات عن الجلسة من التخزين لعرض الوقت المتبقي
    let countdownInterval = null;
    async function startCountdownUI() {
      const data = await chrome.storage.local.get("focusBlocker_state");
      const state = data.focusBlocker_state;
      if (!state || !state.endTime) return;
      function update() {
        const now = Date.now();
        const remaining = Math.max(0, state.endTime - now);
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        const infoEl = document.getElementById("fb-info");
        if (infoEl) infoEl.innerText = `الوقت المتبقي: ${mins} دقيقة و ${secs} ثانية.`;
        if (remaining <= 0) {
          removeOverlay();
        }
      }
      update();
      countdownInterval = setInterval(update, 1000);
    }
    startCountdownUI();
  
    // زر الاستراحة: نرسل رسالة للخلفية لتمديد pausedUntil
    pauseBtn.addEventListener("click", async () => {
      // افتراضي 5 دقائق استراحة
      chrome.runtime.sendMessage({ type: "pauseFor", minutes: 5 });
      removeOverlay();
    });
  
    stopBtn.addEventListener("click", async () => {
      chrome.runtime.sendMessage({ type: "stop" });
      removeOverlay();
    });
  
    // تنبيه للخلفية بأن المستخدم حاول فتح موقع محظور (للاحصاء)
    chrome.runtime.sendMessage({ type: "reportAttempt" });
  
    function removeOverlay() {
      if (quoteInterval) clearInterval(quoteInterval);
      if (countdownInterval) clearInterval(countdownInterval);
      const el = document.getElementById("focus-blocker-overlay");
      if (el) el.remove();
      window.__focusBlockerInjected = false;
    }
  
    // استمع لطلبات الإزالة من الخلفية
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.action === "removeOverlay") {
        removeOverlay();
      }
    });
  
    function styleButton(btn, bg, color) {
      btn.style.padding = "10px 16px";
      btn.style.border = "none";
      btn.style.cursor = "pointer";
      btn.style.borderRadius = "8px";
      btn.style.background = bg;
      btn.style.color = color;
      btn.style.fontSize = "14px";
    }
  })();
  