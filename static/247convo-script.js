"use strict"; // <-- 1. ALWAYS at the very top!
// File: 247convo-script.js
// Enhanced: Natural language booking intent parsing + smart field detection

(function () {
  const DEFAULT_CLIENT_ID = "default";
  const BASE_CONFIG_URL  = "https://two47ctest.onrender.com/static";
  const API_BASE         = "https://two47cbackend.onrender.com";

// ⬇️⬇️⬇️ Add the helper RIGHT HERE ⬇️⬇️⬇️
function apiUrl(path, params = {}) {
  const qp = Object.entries({ ...params, token }).map(
    ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
  ).join('&');
  return `${API_BASE}${path}${qp ? '?' + qp : ''}`;
}

  function linkify(text) {
    return text.replace(/(https?:\/\/[^\s]+)/g, url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
  }

  function getClientID() {
    if (window.__247CONVO_CONFIG__?.client_id) return window.__247CONVO_CONFIG__.client_id;
    const params = new URLSearchParams(window.location.search);
    if (params.get("client_id")) return params.get("client_id");
    const src = document.currentScript?.src || "";
    const m = src.match(/[?&]client_id=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : DEFAULT_CLIENT_ID;
  }

  async function loadConfig(client_id) {
    return window.__247CONVO_CONFIG__ || {};
  }

  const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  function parseBookingIntent(text) {
    const bookingIntent = /\b(book|schedule|appointment|meeting)\b/i.test(text);
    const dateMatch = text.match(/\b(?:\d{4}-\d{2}-\d{2}|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    const timeMatch = text.match(/\b(\d{1,2}(?::\d{2})?\s?(am|pm)?)\b/i);
    return {
      intent: bookingIntent ? "booking" : null,
      date: dateMatch ? dateMatch[0] : null,
      time: timeMatch ? timeMatch[0] : null
    };
  }

function getErrorMsg(err) {
  if (!err) return "Unknown error";
  // Dig deeper for nested error objects
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    if (err.detail && typeof err.detail === "object" && err.detail.error)
      return err.detail.error;
    if (err.detail && typeof err.detail === "string")
      return err.detail;
    if (err.error && typeof err.error === "string")
      return err.error;
    if (err.message && typeof err.message === "string")
      return err.message;
    if (err.error && typeof err.error === "object")
      return getErrorMsg(err.error);
  }
  return JSON.stringify(err);
}

  function enableInput() {
    userInput.disabled = false;
    sendBtn.disabled = false;
  }

  function userCancelled(txt) {
    const cancelPhrases = [
      "cancel",
      "no",
      "stop",
      "don't want",
      "not now",
      "exit",
      "never mind",
      "nope",
      "quit",
      "back",
      "forget it",
      "don’t want",
      "book later",
      "i will book later",
      "maybe another time",
      "some other time",
      "not booking",
      "not booking now",
      "not booking anymore",
      "don’t want to book",
      "i am not booking now",
      "i don't want to book anymore",
      "i’m not booking",
      "will book later"
    ];
    const txtNorm = txt.trim().toLowerCase();
    return cancelPhrases.some(phrase => txtNorm.includes(phrase));
  }

  async function run() {
    const client_id = getClientID();
    const config = window.__247CONVO_CONFIG__ || await loadConfig(client_id);
    const {
      token = "",
      chatbotName  = "247Convo Bot",
      brandName    = "247Convo",
      quickOption1 = "Book Appointment",
      quickOption2 = "How do I integrate?",
      quickOption3 = "Talk to a human",
      supportUrl   = "#",
      avatarUrl    = "",
      bookingProvider = "zoom"
    } = config;

    const getEl       = id => document.getElementById(id);
    const bubble      = getEl("chat-bubble");
    const tooltip     = getEl("chat-bubble-msg");
    const header      = getEl("headerBrand");
    const avatar      = getEl("headerAvatar");
    const support     = getEl("supportLink");
    const bubbleSound = getEl("bubbleSound");
    const replySound  = getEl("replySound");
    const chatBox     = getEl("chat");
    const userInput   = getEl("userInput");
    const sendBtn     = getEl("sendBtn");
    const chatBadge   = getEl("chat-badge");
    if (!bubble || !tooltip || !chatBox || !userInput || !sendBtn) {
      alert("247Convo Chatbot: Missing critical HTML elements! Please check your widget markup and IDs.");
      return;
    }

    function shakeBubble() {
      bubble.classList.remove("bounce");
      void bubble.offsetWidth;
      bubble.classList.add("bounce");
      setTimeout(() => bubble.classList.remove("bounce"), 800);
    }

    function pulseBubble(on = true) {
      bubble.classList.toggle("pulse", on);
    }

    function showBadge(count = 1) {
      if (!chatBadge) return;
      chatBadge.textContent = count;
      chatBadge.style.display = "inline-block";
    }
    function hideBadge() {
      if (!chatBadge) return;
      chatBadge.style.display = "none";
    }

    function typewriterTooltip(text, speed = 33) {
      if (!tooltip) return;
      tooltip.classList.remove('typewriter');
      tooltip.innerText = '';
      let i = 0;
      function type() {
        if (i <= text.length) {
          tooltip.innerText = text.slice(0, i);
          i++;
          setTimeout(type, speed);
        } else {
          tooltip.classList.add('typewriter');
          setTimeout(() => tooltip.classList.remove('typewriter'), 1800);
        }
      }
      type();
    }

    let chatLog       = "";
    let userName      = "";
    let userEmail     = "";
    let leadSubmitted = false;
    let collecting    = "name";
    let bookingState  = { inProgress: false, date: null, time: null };

    let conversationHistory = [];
    function updateConversationHistory(user, bot) {
      conversationHistory.push({ user, bot });
      if (conversationHistory.length > (config.memoryLimit || 5)) conversationHistory.shift();
    }

    function resetBookingState() {
      bookingState = { inProgress: false, date: null, time: null };
    }

    function insertRatingWidget() {
      const old = document.getElementById('chatRatingWidget');
      if (old) old.remove();
      const div = document.createElement('div');
      div.id = "chatRatingWidget";
      div.style = "margin:1em 0;text-align:center;";
      let html = `<div style="font-size:1.1em;margin-bottom:4px;">${config.ratingPrompt || "How would you rate this experience?"}</div>`;
      for (let i = 1; i <= 5; i++) {
        html += `<button data-rate="${i}" style="font-size:2em;cursor:pointer;border:none;background:none;">⭐️</button>`;
      }
      div.innerHTML = html;
      chatBox.appendChild(div);
      div.querySelectorAll('button[data-rate]').forEach(btn => {
        btn.onclick = async (e) => {
          const score = e.target.getAttribute("data-rate");
          div.innerHTML = `${config.ratingThanks || "Thank you for your feedback!"}`;
          try {
            await fetchWithTimeout(`${API_BASE}/rating`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                client_id,
                user: userName || "",
                email: userEmail || "",
                score,
                context: conversationHistory,
              })
            });
          } catch (err) {
            console.error("[insertRatingWidget] Rating error:", err);
            botReply(`${config.ratingError || "⚠️ Couldn't send your rating."}`);
            enableInput();
          }
        };
      });
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    function getPersonalizedGreeting() {
      let greet = config.greetingTextMorning || "Good morning!";
      const hour = new Date().getHours();
      if (hour >= 12 && hour < 18) greet = config.greetingTextAfternoon || "Good afternoon!";
      if (hour >= 18) greet = config.greetingTextEvening || "Good evening!";
      if (userName) greet += ` ${userName}`;
      return greet;
    }

    if (header) header.innerText = `${brandName} Assistant`;
    if (avatar && avatarUrl) avatar.style.backgroundImage = `url('${avatarUrl}')`;
    if (support) support.href = supportUrl;
    if (tooltip) {
      tooltip.innerText = config.bubbleMessage || `Need help? Ask ${chatbotName}.`;
    }

    setTimeout(() => {
      const popup = getEl("chatPopup");
      if (
        tooltip &&
        popup && !popup.classList.contains("open") &&
        !window.__247CONVO_BUBBLE_MSG_SHOWN
      ) {
        const provText = (config.proactive && config.proactive.bubble) ||
          config.bubbleMessage ||
          `Need help? Ask ${chatbotName}.`;
        typewriterTooltip(provText);
        shakeBubble();
        pulseBubble(true);
        showBadge(1);
        window.__247CONVO_BUBBLE_MSG_SHOWN = true;
      }
    }, 35000);

    document.addEventListener("mouseleave", e => {
      const popup = getEl("chatPopup");
      if (
        tooltip &&
        e.clientY < 10 &&
        popup && !popup.classList.contains("open") &&
        !window.__247CONVO_BUBBLE_MSG_EXIT_SHOWN
      ) {
        const provText = (config.proactive && config.proactive.exitIntent) ||
          config.bubbleMessage ||
          `Need help? Ask ${chatbotName}.`;
        typewriterTooltip(provText);
        shakeBubble();
        pulseBubble(true);
        showBadge(1);
        window.__247CONVO_BUBBLE_MSG_EXIT_SHOWN = true;
      }
    });

    window.addEventListener("scroll", () => {
      const popup = getEl("chatPopup");
      if (
        tooltip &&
        popup && !popup.classList.contains("open") &&
        !window.__247CONVO_BUBBLE_MSG_SCROLL_SHOWN &&
        (window.scrollY / (document.body.scrollHeight - window.innerHeight)) > 0.6
      ) {
        const provText = (config.proactive && config.proactive.scrollDepth) ||
          config.bubbleMessage ||
          `Need help? Ask ${chatbotName}.`;
        typewriterTooltip(provText);
        shakeBubble();
        pulseBubble(true);
        showBadge(1);
        window.__247CONVO_BUBBLE_MSG_SCROLL_SHOWN = true;
      }
    });

    function showMessage(text, isUser = false, isTyping = false, id = "", isError = false) {
      if (!chatBox) return;
      const cls = isUser ? "user" : "bot";
      const errorClass = isError ? "error" : "";
      const avatarHTML = (!isUser && avatarUrl)
        ? `<div class="bot-avatar" style="background-image:url('${avatarUrl}')"></div>`
        : (!isUser ? `<div class="bot-avatar default-avatar"></div>` : "");
      const typingHTML = isTyping ? `<span class="typing"><span></span><span></span><span></span></span>` : "";
      const tsHTML = !isTyping ? `<span class="timestamp">${now()}</span>` : "";
      const wrapperID = id ? `id="${id}-wrapper"` : "";
      const bubbleID  = id ? `id="${id}"` : "";

      chatBox.insertAdjacentHTML("beforeend", 
        `<div class="msg-wrapper ${cls} new" ${wrapperID}>
          ${avatarHTML}
          <p class="${cls} ${errorClass}" ${bubbleID}>${text}${typingHTML}${tsHTML}</p>
        </div>`
      );
      chatBox.scrollTop = chatBox.scrollHeight;
      setTimeout(() => {
        const last = chatBox.querySelector(".msg-wrapper.new");
        if (last) last.classList.remove("new");
      }, 600);
    }

    function botReply(text, isError = false) {
      showMessage(`${chatbotName}: ${text}`, false, false, "", isError);
      replySound?.play();
    }

    function insertQuickOptions() {
      if (!chatBox) return;
      getEl("quickOpts")?.remove();
      chatBox.insertAdjacentHTML("beforeend", 
        `<div class="quick-options" id="quickOpts">
          <button onclick="quickAsk('${quickOption1}')">${quickOption1}</button>
          <button onclick="quickAsk('${quickOption2}')">${quickOption2}</button>
          <button onclick="quickAsk('${quickOption3}')">${quickOption3}</button>
        </div>`
      );
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    function waitForUserInput() {
      return new Promise(resolve => {
        function onKey(e) {
          if (e.key === "Enter") {
            e.stopImmediatePropagation();
            cleanup();
            resolve(userInput.value.trim());
          }
        }
        function onClick(e) {
          e.stopImmediatePropagation();
          cleanup();
          resolve(userInput.value.trim());
        }
        function cleanup() {
          userInput.removeEventListener("keydown", onKey, true);
          sendBtn.removeEventListener("click", onClick, true);
        }
        userInput.addEventListener("keydown", onKey, true);
        sendBtn.addEventListener("click", onClick, true);
      });
    }

    function fetchWithTimeout(resource, options = {}) {
      const { timeout = 15000 } = options;
      return Promise.race([
        fetch(resource, options),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Network timeout, please try again.")), timeout)
        )
      ]);
    }

async function fetchBusyTimes(dateStr) {
  const res = await fetchWithTimeout(apiUrl(`/availability/${getClientID()}`, { date: dateStr }));
  if (!res.ok) return null;
  const data = await res.json();
  return data.busy || [];
}


async function getAvailableSlots(dateStr) {
  const res = await fetchWithTimeout(apiUrl(`/availability/${client_id}`, { date: dateStr }));
  if (!res.ok) return [];
  const data = await res.json();
  return data.slots || []; // Always use 'slots' key, never 'available'
}


async function showDateTimePicker() {
  return new Promise(async resolve => {
    const wrapper = document.createElement("div");
    wrapper.style.margin = "1em 0";
    wrapper.innerHTML = `
      <label>Select a date:</label><br/>
      <input type="date" id="manualDate" style="padding:5px;margin:5px 0;" />
      <div id="slotButtons" style="margin-top: 1em;"></div>
    `;
    chatBox.appendChild(wrapper);
    chatBox.scrollTop = chatBox.scrollHeight;

    const dateInput = wrapper.querySelector("#manualDate");
    const slotContainer = wrapper.querySelector("#slotButtons");

    // ---- NEW: Disable unavailable weekdays ----
    // Only allow dates with day names in config.availableHours
    const allowedDays = Object.keys(config.availableHours || {});
    // Calculate min/max
    const today = new Date();
    let minDate = today;
    let maxDate = new Date();
    maxDate.setDate(today.getDate() + 60); // 60 days out

    // Helper to format date as YYYY-MM-DD
    const fmt = d => d.toISOString().split("T")[0];
    dateInput.min = fmt(minDate);
    dateInput.max = fmt(maxDate);

    // Disable invalid days (uses input's oninput event)
    dateInput.addEventListener("input", function() {
      const d = new Date(this.value);
      const dayName = d.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
      if (!allowedDays.includes(dayName)) {
        this.setCustomValidity("No slots available on this day.");
        this.value = ""; // Clear the field so user can't proceed
        slotContainer.innerHTML = `<span>❌ No available time slots on this date.</span>`;
        this.reportValidity();
      } else {
        this.setCustomValidity("");
        slotContainer.innerHTML = "";
        // Only fetch slots if valid
        fetchAndRenderSlots(this.value);
      }
    });

    async function fetchAndRenderSlots(dateStr) {
      slotContainer.innerHTML = `<span>Loading available times…</span>`;
      try {
        const res = await fetchWithTimeout(apiUrl(`/availability/${client_id}`, { date: dateStr }));
        const data = await res.json();

        if (!data.slots || data.slots.length === 0) {
          slotContainer.innerHTML = `<span>❌ No available time slots on this date.</span>`;
          return;
        }

        slotContainer.innerHTML = `<p>Pick a time:</p>`;
        data.slots.forEach(slot => {
          const btn = document.createElement("button");
          btn.textContent = new Date(slot).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          btn.style = "padding:6px 12px;margin:4px;border-radius:6px;";
          btn.onclick = () => {
            wrapper.remove();
            resolve(new Date(slot));
          };
          slotContainer.appendChild(btn);
        });
      } catch (err) {
        slotContainer.innerHTML = `<span>⚠️ Couldn’t load availability.</span>`;
      }
    }

    // (Optional) Prefill the picker with the first valid day
    let probe = new Date(today);
    for (let i = 0; i < 60; i++) {
      const dayName = probe.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
      if (allowedDays.includes(dayName)) {
        dateInput.value = fmt(probe);
        fetchAndRenderSlots(fmt(probe));
        break;
      }
      probe.setDate(probe.getDate() + 1);
    }
  });
}

async function showAvailableSlotsPicker(date, busySlots, config) {
  return new Promise(resolve => {
    const wrapper = document.createElement("div");
    wrapper.style.margin = "1em 0";

    // Generate slots in working hours
    const dayName = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
const hours = config.availableHours?.[dayName];
if (!hours) {
  wrapper.innerHTML = `<p>😞 No available slots for ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}.</p>`;
  chatBox.appendChild(wrapper);
  chatBox.scrollTop = chatBox.scrollHeight;
  return;
}
const [start, end] = hours;
const startTime = new Date(date); startTime.setHours(...start.split(":").map(Number), 0, 0);
const endTime = new Date(date); endTime.setHours(...end.split(":").map(Number), 0, 0);

    const duration = config.meetingDuration || 40;
    const slots = [];

    while (startTime < endTime) {
      const slotStart = new Date(startTime);
      const slotEnd = new Date(startTime.getTime() + duration * 60 * 1000);

      const overlaps = busySlots.some(b => {
        const bStart = new Date(b.start);
        const bEnd = new Date(b.end);
        return slotStart < bEnd && bStart < slotEnd;
      });

      if (!overlaps) {
        slots.push(new Date(slotStart));
      }

      startTime.setMinutes(startTime.getMinutes() + 30);
    }

    if (slots.length === 0) {
      wrapper.innerHTML = `<p>😞 No available slots today.</p>`;
    } else {
      wrapper.innerHTML = `<p>📅 Available times for ${date.toDateString()}:</p>`;
      for (const s of slots) {
        const btn = document.createElement("button");
        btn.innerText = s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        btn.style.margin = "3px";
        btn.onclick = () => {
          wrapper.remove();
          resolve(s);
        };
        wrapper.appendChild(btn);
      }
    }

    const changeBtn = document.createElement("button");
    changeBtn.innerText = "Pick another date";
    changeBtn.style = "margin-top: 10px; display: block;";
    changeBtn.onclick = async () => {
      wrapper.remove();
      const picker = document.createElement("input");
      picker.type = "date";
      picker.onchange = async () => {
        const pickedDate = new Date(picker.value);
        const iso = pickedDate.toISOString().split("T")[0];
        const res = await fetchWithTimeout(apiUrl(`/availability/${getClientID()}`, { date: iso }));
        const data = await res.json();
        const next = await showAvailableSlotsPicker(pickedDate, data.busy || [], config);
        resolve(next);
      };
      chatBox.appendChild(picker);
      chatBox.scrollTop = chatBox.scrollHeight;
    };

    wrapper.appendChild(document.createElement("br"));
    wrapper.appendChild(changeBtn);
    chatBox.appendChild(wrapper);
    chatBox.scrollTop = chatBox.scrollHeight;
  });
}

async function startBookingFlow() {
  bookingInProgress = true; // <--- ADD THIS
  if (!leadSubmitted) {
    botReply("Before booking, may I have your name and email?");
    enableInput();
    return;
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const availability = (config.availableHours && typeof config.availableHours === "object" && !Array.isArray(config.availableHours)) ? config.availableHours : null;

  if (availability) {
    const days = Object.keys(availability);
    const windows = days.map(day => {
      const [start, end] = Array.isArray(availability[day]) ? availability[day] : ["09:00", "17:00"];
      return `${day.charAt(0).toUpperCase() + day.slice(1)}: ${start} - ${end}`;
    }).join('<br>');
    botReply(
      `📆 <b>Available booking windows</b>:<br>${windows}<br><br>What date and time would you like? <br><i>(e.g., 2025-08-01 4 PM or 'next Friday at noon')</i>`
    );
    enableInput();
  } else {
    botReply(
      "What date and time would you like? <br><i>(e.g., 2025-08-01 4 PM or 'next Friday at noon')</i>"
    );
    enableInput();
  }

  const rawInput = await waitForUserInput();
  showMessage(rawInput, true); // Always show user input first!
  if (userCancelled(rawInput)) {
    resetBookingState();
    userInput.value = ""; // Always clear the field
    await sendMessage("Booking cancelled.");
    const feedback = await waitForUserInput();
    if (userCancelled(feedback)) {
      userInput.value = ""; // Clear again after feedback
      insertQuickOptions();
      return;
    }
    userInput.value = ""; // Clear before echoing/processing feedback
    showMessage(feedback, true);
    await sendMessage(feedback);
    insertQuickOptions();
    return;
  }
  userInput.value = "";
  // 🧠 First try native JavaScript parsing
  let parsed = new Date(rawInput);

  // ✅ Chrono fallback only if native Date fails
  if (!parsed || isNaN(parsed.getTime())) {
    if (typeof chrono === "undefined" || typeof chrono.parseDate !== "function") {
      botReply("⚠️ Internal error: time parser not available.");
      enableInput();
      return;
    }

    parsed = chrono.parseDate(rawInput);
    if (!parsed || isNaN(parsed.getTime())) {
      botReply("❌ I couldn’t understand the time. Please pick manually:");
      enableInput();
      const today = new Date();
      const iso = today.toISOString().split("T")[0];
      const res = await fetchWithTimeout(`${API_BASE}/availability/${getClientID()}?date=${iso}&token=${token}`);
      const data = await res.json();
      parsed = await showAvailableSlotsPicker(today, data.busy || [], config);
      if (!parsed) {
        const feedback = await waitForUserInput();
        if (userCancelled(feedback)) {
          userInput.value = "";
          insertQuickOptions();
          return;
        }
        userInput.value = "";
        showMessage(feedback, true);
        await sendMessage(feedback);
        insertQuickOptions();
        return;
      }
    }
  }

// ❌ If all fail, show fallback picker
if (!parsed || isNaN(parsed.getTime())) {
  botReply("❌ I couldn’t understand the time. Please pick manually:");
  enableInput();
  const today = new Date();
  const iso = today.toISOString().split("T")[0];
  const res = await fetchWithTimeout(`${API_BASE}/availability/${getClientID()}?date=${iso}&token=${token}`);
  const data = await res.json();
  parsed = await showAvailableSlotsPicker(today, data.busy || [], config);
  if (!parsed) {
    const feedback = await waitForUserInput();
    if (userCancelled(feedback)) {
      userInput.value = "";
      insertQuickOptions();
      return;
    }
    userInput.value = "";
    showMessage(feedback, true);
    await sendMessage(feedback);
    insertQuickOptions();
    return;
  }
}

  const datetime = parsed.toISOString();

  // ⛔ Block outside of available hours if set
  const day = parsed.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const hours = availability?.[day];
  if (hours) {
    const [startHour, endHour] = hours;
    const [startH, startM] = startHour.split(':').map(Number);
    const [endH, endM] = endHour.split(':').map(Number);
    const duration = config.meetingDuration || 40;

    // Create Date objects for slot start and end (in local time)
    const slotStart = new Date(parsed); // when the meeting starts
    const slotEnd = new Date(parsed.getTime() + duration * 60 * 1000);

    const availStart = new Date(parsed);
    availStart.setHours(startH, startM, 0, 0);
    const availEnd = new Date(parsed);
    availEnd.setHours(endH, endM, 0, 0);

    if (slotStart < availStart || slotEnd > availEnd) {
      botReply(`❌ That time is outside your availability for ${day}. Please try a different time.`);
      enableInput();
      return;
    }
  }

// 📝 Ask for purpose
botReply("What’s the purpose of this meeting?");
const purpose = await waitForUserInput();
if (userCancelled(purpose)) {
  resetBookingState();
  await sendMessage("Booking cancelled.");
  const feedback = await waitForUserInput();
  if (userCancelled(feedback)) {
    insertQuickOptions();
    return;
  }
  // If not cancelled, treat as normal chat
  await sendMessage(feedback);
  insertQuickOptions();
  return;
}
const lastPurpose = purpose;
userInput.value = "";
showMessage(purpose, true);

// ✅ Show full summary and ask for final confirmation
const duration = config.meetingDuration || 40;
botReply(
  `📅 Meeting at: ${parsed.toLocaleString()} (${timezone})\n📝 Purpose: ${purpose}\n⏱️ Duration: ${duration} minutes`
);
botReply("Confirm this booking? (yes / no)");
const confirm = await waitForUserInput();
if (userCancelled(confirm) || !/^y(es)?$/i.test(confirm)) {
  resetBookingState();
  bookingInProgress = false; // <--- ADD THIS
  userInput.value = "";
  await sendMessage("Booking cancelled.");
  userInput.disabled = false;
  sendBtn.disabled = false;
  const feedback = await waitForUserInput();
  if (userCancelled(feedback)) {
    userInput.value = "";
    insertQuickOptions();
    return;
  }
  userInput.value = "";
  showMessage(feedback, true);
  await sendMessage(feedback);
  insertQuickOptions();
  return;
}
userInput.value = "";
showMessage(confirm, true);

console.log("Booking payload:", {
  client_id, token,
  name: userName,
  email: userEmail,
  datetime,
  timezone,
  purpose,
  bookingProvider: config.bookingProvider
});

// ✅ Send booking request
showMessage("Booking your appointment…", false, true);
if (replySound) replySound.play();
try {
  const res = await fetchWithTimeout(`${API_BASE}/book`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id, token,
      name: userName,
      email: userEmail,
      datetime,
      timezone,
      purpose,
      bookingProvider: config.bookingProvider
    })
  });

  const typingEl = chatBox.querySelector(".msg-wrapper.bot .typing");
  if (typingEl) typingEl.closest(".msg-wrapper").remove();

  if (!res.ok) {
    let err = {}, msg = "Unknown error";
    try {
      err = await res.json();
      msg = getErrorMsg(err);
    } catch (e) {
      msg = await res.text() || "Unknown error";
    }

    // Handle backend error: Outside available hours
    if (typeof msg === "string" && msg.toLowerCase().includes("outside available hours")) {
      botReply("The time you selected is outside our available hours. Would you like to pick another time? (yes/no)");
      const response = await waitForUserInput();
      if (userCancelled(response)) {
        resetBookingState();
        userInput.value = "";
        await sendMessage("Booking cancelled!");
        const feedback = await waitForUserInput();
        if (userCancelled(feedback)) {
          userInput.value = "";
          insertQuickOptions();
          return;
        }
        userInput.value = "";
        showMessage(feedback, true);
        await sendMessage(feedback);
        insertQuickOptions();
        return;
      } else if (/^y(es)?$/i.test(response)) {
        // Show time picker logic here
        const today = new Date();
        const iso = today.toISOString().split("T")[0];
        const res2 = await fetchWithTimeout(apiUrl(`/availability/${getClientID()}`, { date: iso }));
        const data2 = await res2.json();
        const picked = await showAvailableSlotsPicker(today, data2.busy || [], config);
        if (!picked) {
          const feedback = await waitForUserInput();
          if (userCancelled(feedback)) {
            userInput.value = "";
            insertQuickOptions();
            return;
          }
          userInput.value = "";
          showMessage(feedback, true);
          await sendMessage(feedback);
          insertQuickOptions();
          return;
        }
        // Continue booking with picked time if needed
        // Optionally ask for new purpose here
      } else {
        // fallback, treat as cancel
        resetBookingState();
        await sendMessage("Booking cancelled.");
        botReply("Okay, no booking for now. What else can I help with?");
        const feedback = await waitForUserInput();
        if (userCancelled(feedback)) {
          insertQuickOptions();
          return;
        }
        // If not cancelled, treat as normal chat
        await sendMessage(feedback);
        insertQuickOptions();
        return;
      }
    }

    // Clean up ugly error objects if backend returns JSON as a string
    if (typeof msg === "string") {
      msg = msg.replace(/^({?"error":")/, '').replace(/"}$/, '');
    }

    console.error("Booking error:", err);

    // 🧠 Check for suggested time (e.g. backend gives next available)
    if (err && typeof err === "object" && err.suggested) {
      const suggestedDate = new Date(err.suggested);
      botReply(`⚠️ ${msg}`);
      botReply(`📅 Next available time: ${suggestedDate.toLocaleString()} — Want to book this instead? (yes / no)`);
      const retry = await waitForUserInput();
      userInput.value = "";
      showMessage(retry, true);

      if (/^y(es)?$/i.test(retry)) {
        // If user wants to use suggested, ask if they want to reuse the previous purpose
        botReply("Use the same purpose as before? (yes / no)");
        const useSamePurpose = await waitForUserInput();
        userInput.value = "";
        showMessage(useSamePurpose, true);

        if (/^y(es)?$/i.test(useSamePurpose)) {
          // Book with previous purpose
          return await bookSlot({
            datetime: suggestedDate.toISOString(),
            purpose: lastPurpose
          });
        } else {
          // Ask for new purpose
          botReply("What's the new purpose of this meeting?");
          const newPurpose = await waitForUserInput();
          userInput.value = "";
          showMessage(newPurpose, true);
          return await bookSlot({
            datetime: suggestedDate.toISOString(),
            purpose: newPurpose
          });
        }
      } else {
        botReply("Okay, you can pick another time.");
        enableInput();
        // Continue to available time picker below if desired
      }
    }

    // 👉 Always show available windows after error!
    if (availability) {
      const days = Object.keys(availability);
      const windows = days.map(day => {
        const [start, end] = availability[day];
        return `${day.charAt(0).toUpperCase() + day.slice(1)}: ${start} - ${end}`;
      }).join('<br>');
      botReply(`⚠️ ${msg}<br><br>📆 <b>Available booking windows</b>:<br>${windows}<br><br>Let’s pick a valid time now:`);
      enableInput();
    } else {
      botReply(`⚠️ ${msg}<br>Let’s pick a valid time now:`);
      enableInput();
    }

    // 🔥 Instantly show available times for today, let user pick
    const today = new Date();
    const iso = today.toISOString().split("T")[0];
    const res2 = await fetchWithTimeout(apiUrl(`/availability/${getClientID()}`, { date: iso }));
    const data2 = await res2.json();
    const picked = await showAvailableSlotsPicker(today, data2.busy || [], config);
    if (!picked) return botReply("❌ Booking cancelled.");

    // Ask if they want to reuse last purpose or enter a new one
    botReply("Would you like to use the same purpose as before? (yes / no)");
    const reusePurpose = await waitForUserInput();
    userInput.value = "";
    showMessage(reusePurpose, true);

    if (/^y(es)?$/i.test(reusePurpose)) {
      // Book with same purpose
      return await bookSlot({ datetime: picked.toISOString(), purpose: lastPurpose });
    } else {
      botReply("What's the new purpose of this meeting?");
      const newPurpose = await waitForUserInput();
      userInput.value = "";
      showMessage(newPurpose, true);
      return await bookSlot({ datetime: picked.toISOString(), purpose: newPurpose });
    }
  }

  // SUCCESS: Got confirmation link
  const { confirmation_link } = await res.json();
  chatLog += `Booked ${datetime}: ${confirmation_link}\n`;
  botReply(`✅ Your appointment is booked for ${parsed.toLocaleString()}!\n${linkify(confirmation_link)}`);
  bookingInProgress = false; // <--- ADD THIS
  botReply("Anything else I can help you with?");
  enableInput();
  insertQuickOptions();
  insertRatingWidget();

} catch (error) {
  console.error("[startBookingFlow] Booking error:", error);
  botReply("⚠️ Couldn’t complete booking. Please try again.", true);
  userInput.disabled = false;
  sendBtn.disabled = false;
}
}

// OUTSIDE startBookingFlow, declare bookSlot:
async function bookSlot({ datetime, purpose }) {
  const parsed = new Date(datetime);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const duration = config.meetingDuration || 40;

  // Confirm booking
  botReply(
    `📅 Suggested: ${parsed.toLocaleString()} (${timezone})\n📝 Purpose: ${purpose}\n⏱️ Duration: ${duration} minutes`
  );
  botReply("Book this time? (yes / no)");
  const confirm = await waitForUserInput();
  if (userCancelled(confirm) || !/^y(es)?$/i.test(confirm)) {
    resetBookingState();
    bookingInProgress = false; // <--- ADD THIS
    userInput.value = "";
    await sendMessage("Booking cancelled.");
    const feedback = await waitForUserInput();
    if (userCancelled(feedback)) {
      userInput.value = "";
      insertQuickOptions();
      return;
    }
    userInput.value = "";
    showMessage(feedback, true);
    await sendMessage(feedback);
    insertQuickOptions();
    return;
  }
  userInput.value = "";
  showMessage(confirm, true);

  showMessage("Booking your appointment…", false, true);
  if (replySound) replySound.play();

  try {
    const res = await fetchWithTimeout(`${API_BASE}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id,
        token,
        name: userName,
        email: userEmail,
        datetime,
        timezone,
        purpose,
        bookingProvider: config.bookingProvider,
      }),
    });

    const typingEl = chatBox.querySelector(".msg-wrapper.bot .typing");
    if (typingEl) typingEl.closest(".msg-wrapper").remove();

    if (!res.ok) {
      let msg = "Unknown error";
      try {
        const err = await res.json();
        msg = getErrorMsg(err);
      } catch (e) {
        msg = await res.text() || "Unknown error";
      }
      botReply(`⚠️ ${msg}`);
      enableInput();
      return;
    }

    const { confirmation_link } = await res.json();
    chatLog += `Booked ${datetime}: ${confirmation_link}\n`;
    botReply(
      `✅ Your appointment is booked for ${parsed.toLocaleString()}!\n${linkify(confirmation_link)}`
    );
    botReply("Anything else I can help you with?");
    enableInput();
    insertQuickOptions();
    insertRatingWidget();
  } catch (error) {
    console.error("[bookSlot] Booking error:", error);
    botReply("⚠️ Couldn’t complete booking. Please try again.", true);
    userInput.disabled = false;
    sendBtn.disabled = false;
  }
}

async function handleInput() {
  const txt = userInput.value.trim();
  if (!txt) return;
  // 🚦 Disable input/button to prevent double submit
  userInput.disabled = true;
  sendBtn.disabled = true;

  showMessage(txt, true);
  userInput.value = "";

  // <--- ADD THIS
  if (bookingInProgress) {
    if (/start over/i.test(txt)) {
      bookingInProgress = false;
      resetBookingState();
      await sendMessage("Booking cancelled.");
      botReply("Booking process reset. What else can I help you with?");
      insertQuickOptions();
      userInput.disabled = false;
      sendBtn.disabled = false;
      return;
    }
    if (/continue/i.test(txt)) {
      return await startBookingFlow();
    }
    // For any other input, continue booking
    return await startBookingFlow();
  }
  // <--- END ADDITION

  // ⬇️ Reset flow if user types "start over"
  if (/start over/i.test(txt)) {
    resetBookingState();
    await sendMessage("Booking cancelled."); // sync to backend/context
    botReply("Booking process reset. What else can I help you with?");
    insertQuickOptions();
    userInput.disabled = false;
    sendBtn.disabled = false;
    return;
  }
  // ⬆️ END OF BLOCK

  // --- Lead capture (name, then email) ---
  if (!leadSubmitted) {
    if (collecting === "name") {
      userName = txt.slice(0, 100);
      collecting = "email";
      userInput.disabled = false;
      sendBtn.disabled = false;
      return botReply(`${getPersonalizedGreeting()} ${config.askEmail || "Now, what’s your email?"}`);
    } else if (collecting === "email") {
      userEmail = txt.slice(0, 100);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
        botReply("❌ Please enter a valid email address.", true);
        userInput.disabled = false;
        sendBtn.disabled = false;
        return;
      }
      leadSubmitted = true;
      collecting = "done";
      userInput.disabled = false;
      sendBtn.disabled = false;
      botReply(`✅ Thanks, ${userName}! I’m ${chatbotName}. How can I help?`);
      return insertQuickOptions();
    }
  }

  // --- Main logic after lead is captured ---
  if (leadSubmitted) {
    // Only trigger booking if user shows booking intent!
    const parsed = parseBookingIntent(txt);
    if (parsed.intent === "booking") {
      bookingState.inProgress = true;
      if (parsed.date) bookingState.date = parsed.date;
      if (parsed.time) bookingState.time = parsed.time;
      return startBookingFlow();
    }

    // Handoff to human agent if user requests it
    if (/human|agent|real person|support|help/i.test(txt)) {
      botReply(config.handoff?.intro || "Connecting you to a human agent...", false);
      if (config.handoff?.whatsapp) showMessage(config.handoff.whatsapp, false);
      userInput.disabled = false;
      sendBtn.disabled = false;
      return;
    }

    // *** DO NOT CALL startBookingFlow() for any other input ***
  }

  // --- All other input just goes to normal chat/AI ---
  await sendMessage(txt);

  // 🚦 Re-enable input/button after handling
  userInput.disabled = false;
  sendBtn.disabled = false;
}

// --- Helpers: stripTags and sendMessage as requested ---

function stripTags(str) {
  const div = document.createElement('div');
  div.innerHTML = str;
  return div.textContent || div.innerText || "";
}

async function sendMessage(txt) {
  const id = `msg-${Date.now()}`;
  showMessage("<em>Loading...</em>", false, true, id); // Shows "Loading..." with typing effect
  chatLog += `You: ${txt}\n`;

  if (!token) {
    const errEl = getEl(id);
    if (errEl) errEl.innerText = "❌ Missing token";
    return;
  }

  try {
    const res = await fetchWithTimeout(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: txt,
        token,
        client_id,
        history: conversationHistory,
        booking: bookingState,
      }),
    });
    const wrapper = getEl(`${id}-wrapper`);
    if (wrapper) wrapper.remove();
    if (!res.ok) {
      botReply("⚠️ Server error. Please try again.", false);
      enableInput();
      return;
    }
    let data = {};
    try {
      data = await res.json();
    } catch (err) {
      botReply("⚠️ Server error. Bad JSON from backend.", false);
      enableInput();
      return;
    }
    const safeAnswer =
      typeof data.answer === "string"
        ? linkify(stripTags(data.answer))
        : (data.answer ? JSON.stringify(data.answer, null, 2) : "No response from bot.");
    showMessage(`${chatbotName}: ${safeAnswer}`, false);
    updateConversationHistory(txt, safeAnswer);
    if (replySound) replySound.play();
    chatLog += `${chatbotName}: ${safeAnswer}\n`;

  } catch (e) {
    const errEl = getEl(id);
    if (errEl) errEl.innerText = "⚠️ Something went wrong";
    console.error("[sendMessage] Error:", e);
    userInput.disabled = false;
    sendBtn.disabled = false;
  }
}

// --- Quick ask and toggleChat event handler (unchanged, but included for completeness) ---

window.quickAsk = txt => {
  getEl("quickOpts")?.remove();
  if (txt === quickOption1) return startBookingFlow();
  userInput.value = txt;
  handleInput();
};

window.toggleChat = () => {
  const p = getEl("chatPopup"), t = getEl("chat-bubble-msg");
  if (!p || !t) return;
  const open = p.classList.contains("open");
  p.classList.toggle("open", !open);
  // Reset effects when chat opens
  pulseBubble(false); // Remove pulse
  hideBadge();        // Hide badge
  t.style.display = open ? "block" : "none";
  if (!open) {
    if (bubbleSound) bubbleSound.play();
    if (!leadSubmitted) botReply(getPersonalizedGreeting() + " " + (config.greetingIntro || "What’s your name?"));
    enableInput();
  }
};

bubble?.addEventListener("click", window.toggleChat);
sendBtn?.addEventListener("click", handleInput);
userInput?.addEventListener("keydown", e => { if (e.key === "Enter") handleInput(); });

window.addEventListener("beforeunload", () => {
  if (leadSubmitted && chatLog.trim()) {
    fetch(`${API_BASE}/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: userName, email: userEmail, chat_log: chatLog, token, client_id }),
    }).catch(() => {});
  }
});

// Play bubble sound once on first user interaction
let played = false;
const playOnce = () => {
  if (!played) {
    if (bubbleSound) bubbleSound.play();
    played = true;
  }
};
["click", "scroll", "mousemove", "keydown"].forEach(ev =>
  window.addEventListener(ev, playOnce, { once: true })
);
  } // <--- CLOSES THE async function run() BLOCK

function waitForChronoThenRun() {
    if (typeof chrono !== "undefined") {
      run();
    } else {
      setTimeout(waitForChronoThenRun, 50);
    }
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", waitForChronoThenRun);
  } else {
    waitForChronoThenRun();
  }

  window.addEventListener("error", function(e) {
    console.error("[GLOBAL ERROR]", e.error || e.message || e);
  });
  window.addEventListener("unhandledrejection", function(e) {
    console.error("[UNHANDLED PROMISE REJECTION]", e.reason);
  });

})();
