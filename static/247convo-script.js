// File: 247convo-script.js
// Enhanced: Natural language booking intent parsing + smart field detection

(function () {
  const DEFAULT_CLIENT_ID = "default";
  const BASE_CONFIG_URL  = "https://two47ctest.onrender.com/static";
  const API_BASE         = "https://two47cbackend.onrender.com";

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

  // ... existing utility functions above ...
  function getErrorMsg(err) {
    if (!err) return "Unknown error";
    if (typeof err === "string") return err;
    if (err.error && typeof err.error === "string") return err.error;
    if (err.message && typeof err.message === "string") return err.message;
    if (err.detail && typeof err.detail === "string") return err.detail;
    if (err.error && typeof err.error === "object") return getErrorMsg(err.error);
    return JSON.stringify(err);
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
      bookingProvider = "zoom" // default fallback
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

// --- UI EFFECTS FOR BUBBLE/TOOLTIP --- //

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

// ---- Typewriter/reveal animation for tooltip ----
function typewriterTooltip(text, speed = 33) {
  if (!tooltip) return;
  tooltip.classList.remove('typewriter');
  tooltip.innerText = ''; // reset
  let i = 0;
  function type() {
    if (i <= text.length) {
      tooltip.innerText = text.slice(0, i);
      i++;
      setTimeout(type, speed);
    } else {
      tooltip.classList.add('typewriter');
      setTimeout(() => tooltip.classList.remove('typewriter'), 1800); // Optional: remove after reveal
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

let conversationHistory = []; // NEW: For memory

function updateConversationHistory(user, bot) {
  conversationHistory.push({ user, bot });
  if (conversationHistory.length > (config.memoryLimit || 5)) conversationHistory.shift();
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
        await fetch(`${API_BASE}/rating`, {
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
        showMessage(`${config.ratingError || "⚠️ Couldn't send your rating."}`);
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


    // Branding setup
    if (header) header.innerText = `${brandName} Assistant`;
    if (avatar && avatarUrl) avatar.style.backgroundImage = `url('${avatarUrl}')`;
    if (support) support.href = supportUrl;
    if (tooltip) {
  tooltip.innerText = config.bubbleMessage || `Need help? Ask ${chatbotName}.`;
}

// --- Proactive, Exit-Intent, and Scroll-Depth Messages on the chat bubble (tooltip), BEFORE chat is opened ---

// Time-on-page: Show proactive bubble after 35s if chat not opened
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

typewriterTooltip(provText); // <-- Reveal effect for message
shakeBubble();               // <-- Bubble bounce
pulseBubble(true);           // <-- Bubble pulse highlight
showBadge(1);                // <-- Show 1 notification badge

    window.__247CONVO_BUBBLE_MSG_SHOWN = true;
  }
}, 35000);

// Exit intent: Show proactive bubble when user moves mouse out the top
document.addEventListener("mouseleave", e => {
  const popup = getEl("chatPopup");
  if (
    tooltip &&
    e.clientY < 10 &&
    popup && !popup.classList.contains("open") &&
    !window.__247CONVO_BUBBLE_MSG_EXIT_SHOWN
  ) {
const provText = (config.proactive && config.proactive.bubble) ||
  config.bubbleMessage ||
  `Need help? Ask ${chatbotName}.`;

typewriterTooltip(provText); // <-- Reveal effect for message
shakeBubble();               // <-- Bubble bounce
pulseBubble(true);           // <-- Bubble pulse highlight
showBadge(1);                // <-- Show 1 notification badge

    window.__247CONVO_BUBBLE_MSG_EXIT_SHOWN = true;
  }
});

// Scroll depth: Show proactive bubble if user scrolls 60% of the page
window.addEventListener("scroll", () => {
  const popup = getEl("chatPopup");
  if (
    tooltip &&
    popup && !popup.classList.contains("open") &&
    !window.__247CONVO_BUBBLE_MSG_SCROLL_SHOWN &&
    (window.scrollY / (document.body.scrollHeight - window.innerHeight)) > 0.6
  ) {
const provText = (config.proactive && config.proactive.bubble) ||
  config.bubbleMessage ||
  `Need help? Ask ${chatbotName}.`;

typewriterTooltip(provText); // <-- Reveal effect for message
shakeBubble();               // <-- Bubble bounce
pulseBubble(true);           // <-- Bubble pulse highlight
showBadge(1);                // <-- Show 1 notification badge

    window.__247CONVO_BUBBLE_MSG_SCROLL_SHOWN = true;
  }
});


    // document.title = `${brandName} Chat`;

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

  chatBox.insertAdjacentHTML("beforeend", `
    <div class="msg-wrapper ${cls} new" ${wrapperID}>
      ${avatarHTML}
      <p class="${cls} ${errorClass}" ${bubbleID}>${text}${typingHTML}${tsHTML}</p>
    </div>
  `);
  chatBox.scrollTop = chatBox.scrollHeight;
  setTimeout(() => {
    const last = chatBox.querySelector(".msg-wrapper.new");
    if (last) last.classList.remove("new");
  }, 600);
}


    function insertQuickOptions() {
      if (!chatBox) return;
      chatBox.insertAdjacentHTML("beforeend", `
        <div class="quick-options" id="quickOpts">
          <button onclick="quickAsk('${quickOption1}')">${quickOption1}</button>
          <button onclick="quickAsk('${quickOption2}')">${quickOption2}</button>
          <button onclick="quickAsk('${quickOption3}')">${quickOption3}</button>
        </div>
      `);
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

async function fetchBusyTimes(dateStr) {
  const res = await fetch(`${API_BASE}/availability/${getClientID()}?date=${dateStr}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.busy || [];
}


async function getAvailableSlots(dateStr) {
  const res = await fetch(`${API_BASE}/availability/${client_id}?date=${dateStr}&token=${token}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.available || [];
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

    async function fetchAndRenderSlots(dateStr) {
      slotContainer.innerHTML = `<span>Loading available times…</span>`;

      try {
        const res = await fetch(`${API_BASE}/availability/${client_id}?date=${dateStr}&token=${token}`);
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

    dateInput.onchange = e => {
      const selected = e.target.value;
      if (selected) fetchAndRenderSlots(selected);
    };
  });
}


async function showAvailableSlotsPicker(date, busySlots, config) {
  return new Promise(resolve => {
    const wrapper = document.createElement("div");
    wrapper.style.margin = "1em 0";

    // Generate slots in working hours
    const dayName = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
    const [start, end] = (config.availableHours?.[dayName] || ["09:00", "17:00"]);
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
        const res = await fetch(`${API_BASE}/availability/${getClientID()}?date=${iso}`);
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
  if (!leadSubmitted) {
    return showMessage("Before booking, may I have your name and email?");
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const availability = config.availableHours;

  // 📅 Show available booking windows before asking
if (availability) {
  const days = Object.keys(availability);
  const windows = days.map(day => {
    const [start, end] = availability[day];
    return `${day.charAt(0).toUpperCase() + day.slice(1)}: ${start} - ${end}`;
  }).join('<br>');
  showMessage(
    `📆 <b>Available booking windows</b>:<br>${windows}<br><br>What date and time would you like? <br><i>(e.g., 2025-08-01 4 PM or 'next Friday at noon')</i>`
  );
} else {
  showMessage(
    "What date and time would you like? <br><i>(e.g., 2025-08-01 4 PM or 'next Friday at noon')</i>"
  );
}
  const rawInput = await waitForUserInput();
  userInput.value = "";
  showMessage(rawInput, true);

  // 🧠 First try native JavaScript parsing
  let parsed = new Date(rawInput);

  // ✅ Chrono fallback only if native Date fails
  if (!parsed || isNaN(parsed.getTime())) {
    if (typeof chrono === "undefined" || typeof chrono.parseDate !== "function") {
      showMessage("⚠️ Internal error: time parser not available.");
      return;
    }

    parsed = chrono.parseDate(rawInput);
    if (!parsed || isNaN(parsed.getTime())) {
showMessage("❌ I couldn’t understand the time. Please pick manually:");
const today = new Date();
const iso = today.toISOString().split("T")[0];
const res = await fetch(`${API_BASE}/availability/${getClientID()}?date=${iso}`);
const data = await res.json();
parsed = await showAvailableSlotsPicker(today, data.busy || [], config);
if (!parsed) return showMessage("❌ Booking cancelled.");
    }
  }

  // ❌ If all fail, show fallback picker
  if (!parsed || isNaN(parsed.getTime())) {
showMessage("❌ I couldn’t understand the time. Please pick manually:");
const today = new Date();
const iso = today.toISOString().split("T")[0];
const res = await fetch(`${API_BASE}/availability/${getClientID()}?date=${iso}`);
const data = await res.json();
parsed = await showAvailableSlotsPicker(today, data.busy || [], config);
if (!parsed) return showMessage("❌ Booking cancelled.");

  }

  const datetime = parsed.toISOString();

  // ⛔ Block outside of available hours if set
  const day = parsed.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const hours = availability?.[day];
  if (hours) {
const [startHour, endHour] = hours;
const selectedMinutes = parsed.getHours() * 60 + parsed.getMinutes();
const [startH, startM] = startHour.split(':').map(Number);
const [endH, endM] = endHour.split(':').map(Number);
const startMinutes = startH * 60 + startM;
const endMinutes = endH * 60 + endM;

if (selectedMinutes < startMinutes || selectedMinutes > endMinutes) {
  return showMessage(`❌ That time is outside your availability for ${day}. Please try a different time.`);
}

  }

  // 📝 Ask for purpose
  showMessage("What’s the purpose of this meeting?");
  const purpose = await waitForUserInput();
  const lastPurpose = purpose;
  userInput.value = "";
  showMessage(purpose, true);

  // ✅ Show full summary and ask for final confirmation
  const duration = config.meetingDuration || 40;
  showMessage(`📅 Meeting at: ${parsed.toLocaleString()} (${timezone})\n📝 Purpose: ${purpose}\n⏱️ Duration: ${duration} minutes`);
  showMessage("Confirm this booking? (yes / no)");
  const confirm = await waitForUserInput();
  userInput.value = "";
  showMessage(confirm, true);
  if (!/^y(es)?$/i.test(confirm)) {
    return showMessage("Okay, booking canceled. Let me know if you want to try again.");
  }

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
  try {
    const res = await fetch(`${API_BASE}/book`, {
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
    msg = getErrorMsg(err);     // <-- changed line
  } catch (e) {
    msg = await res.text() || "Unknown error";
  }
  // ... rest unchanged


  // Clean up ugly error objects if backend returns JSON as a string
  if (typeof msg === "string") {
    msg = msg.replace(/^({?"error":")/, '').replace(/"}$/, '');
  }

  console.error("Booking error:", err);

  // 🧠 Check for suggested time (e.g. backend gives next available)
  if (err && typeof err === "object" && err.suggested) {
    const suggestedDate = new Date(err.suggested);
    showMessage(`⚠️ ${msg}`, false, false, "", true);
    showMessage(`📅 Next available time: ${suggestedDate.toLocaleString()} — Want to book this instead? (yes / no)`);
    const retry = await waitForUserInput();
    userInput.value = "";
    showMessage(retry, true);

    if (/^y(es)?$/i.test(retry)) {
      // If user wants to use suggested, ask if they want to reuse the previous purpose
      showMessage("Use the same purpose as before? (yes / no)");
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
        showMessage("What's the new purpose of this meeting?");
        const newPurpose = await waitForUserInput();
        userInput.value = "";
        showMessage(newPurpose, true);
        return await bookSlot({
          datetime: suggestedDate.toISOString(),
          purpose: newPurpose
        });
      }
    } else {
      showMessage("Okay, you can pick another time.");
      // Continue to available time picker below
    }
  }

  // 👉 Always show available windows after error!
  if (availability) {
    const days = Object.keys(availability);
    const windows = days.map(day => {
      const [start, end] = availability[day];
      return `${day.charAt(0).toUpperCase() + day.slice(1)}: ${start} - ${end}`;
    }).join('<br>');
    showMessage(`⚠️ ${msg}<br><br>📆 <b>Available booking windows</b>:<br>${windows}<br><br>Let’s pick a valid time now:`);
  } else {
    showMessage(`⚠️ ${msg}<br>Let’s pick a valid time now:`);
  }

  // 🔥 Instantly show available times for today, let user pick
  const today = new Date();
  const iso = today.toISOString().split("T")[0];
  const res2 = await fetch(`${API_BASE}/availability/${getClientID()}?date=${iso}`);
  const data2 = await res2.json();
  const picked = await showAvailableSlotsPicker(today, data2.busy || [], config);
  if (!picked) return showMessage("❌ Booking cancelled.");

  // Ask if they want to reuse last purpose or enter a new one
  showMessage("Would you like to use the same purpose as before? (yes / no)");
  const reusePurpose = await waitForUserInput();
  userInput.value = "";
  showMessage(reusePurpose, true);

  if (/^y(es)?$/i.test(reusePurpose)) {
    // Book with same purpose
    return await bookSlot({ datetime: picked.toISOString(), purpose: lastPurpose });
  } else {
    showMessage("What's the new purpose of this meeting?");
    const newPurpose = await waitForUserInput();
    userInput.value = "";
    showMessage(newPurpose, true);
    return await bookSlot({ datetime: picked.toISOString(), purpose: newPurpose });
  }
}

  // SUCCESS: Got confirmation link
  const { confirmation_link } = await res.json();
  chatLog += `Booked ${datetime}: ${confirmation_link}\n`;
  showMessage(`✅ Your appointment is booked for ${parsed.toLocaleString()}!\n${linkify(confirmation_link)}`);
  showMessage("Anything else I can help you with?");
  insertQuickOptions();
insertRatingWidget();

} catch (error) {
  showMessage("⚠️ Couldn’t complete booking. Please try again.", false, false, "", true);
}
// THIS BRACE BELOW is critical! It closes startBookingFlow
} 

// OUTSIDE startBookingFlow, declare bookSlot:

async function bookSlot({ datetime, purpose }) {
  const parsed = new Date(datetime);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const duration = config.meetingDuration || 40;

  // Confirm booking
  showMessage(`📅 Suggested: ${parsed.toLocaleString()} (${timezone})\n📝 Purpose: ${purpose}\n⏱️ Duration: ${duration} minutes`);
  showMessage("Book this time? (yes / no)");
  const confirm = await waitForUserInput();
  userInput.value = "";
  showMessage(confirm, true);
  if (!/^y(es)?$/i.test(confirm)) {
    return showMessage("Okay, booking canceled. Let me know if you want to try again.");
  }

  showMessage("Booking your appointment…", false, true);
  try {
    const res = await fetch(`${API_BASE}/book`, {
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
  let msg = "Unknown error";
  try {
    const err = await res.json();
    msg = getErrorMsg(err);   // <-- changed line
  } catch (e) {
    msg = await res.text() || "Unknown error";
  }
  return showMessage(`⚠️ ${msg}`);
}


    const { confirmation_link } = await res.json();
    chatLog += `Booked ${datetime}: ${confirmation_link}\n`;
    showMessage(`✅ Your appointment is booked for ${parsed.toLocaleString()}!\n${linkify(confirmation_link)}`);
    showMessage("Anything else I can help you with?");
    insertQuickOptions();
insertRatingWidget();
} catch (error) {
  showMessage("⚠️ Couldn’t complete booking. Please try again.", false, false, "", true);
}
}


    async function handleInput() {
      const txt = userInput.value.trim();
      if (!txt) return;
      showMessage(txt, true);
      userInput.value = "";

      if (!leadSubmitted) {
        if (collecting === "name") {
          userName = txt;
          collecting = "email";
          return showMessage(`${getPersonalizedGreeting()} ${config.askEmail || "Now, what’s your email?"}`);
        } else if (collecting === "email") {
          userEmail = txt;
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
  showMessage("❌ Please enter a valid email address.", false, false, "", true);
  return;
}
leadSubmitted = true;
collecting = "done";
showMessage(`✅ Thanks, ${userName}! I’m ${chatbotName}. How can I help?`);
return insertQuickOptions();

        }
      }

      if (leadSubmitted) {
        const parsed = parseBookingIntent(txt);
        if (parsed.intent === "booking") {
          bookingState.inProgress = true;
          if (parsed.date) bookingState.date = parsed.date;
          if (parsed.time) bookingState.time = parsed.time;
          return startBookingFlow();
        }

        // Handoff to human agent if user requests it
        if (/human|agent|real person|support|help/i.test(txt)) {
          showMessage(config.handoff?.intro || "Connecting you to a human agent...", false);
          // Optionally add WhatsApp or other handoff links:
          if (config.handoff?.whatsapp) showMessage(config.handoff.whatsapp, false);
          return;
        }

      }

      await sendMessage(txt);
    }

function stripTags(str) {
  const div = document.createElement('div');
  div.innerHTML = str;
  return div.textContent || div.innerText || "";
}


    async function sendMessage(txt) {
      const id = `msg-${Date.now()}`;
      showMessage("", false, true, id);
      chatLog += `You: ${txt}\n`;

      if (!token) {
        const errEl = getEl(id);
        if (errEl) errEl.innerText = "❌ Missing token";
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
  question: txt,
  token,
  client_id,
  history: conversationHistory,    // <-- Already in your memory implementation
  booking: bookingState           // <-- NEW: Send booking state!
})
        });
        const wrapper = getEl(`${id}-wrapper`);
        if (wrapper) wrapper.remove();
        if (!res.ok) return showMessage("⚠️ Server error. Please try again.", false);
        const data = await res.json();
const safeAnswer =
  typeof data.answer === "string"
    ? linkify(stripTags(data.answer))
    : (data.answer ? JSON.stringify(data.answer, null, 2) : "No response from bot.");
showMessage(`${chatbotName}: ${safeAnswer}`, false);
updateConversationHistory(txt, safeAnswer); // log conversation
replySound?.play();
chatLog += `${chatbotName}: ${safeAnswer}\n`;

      } catch {
        const errEl = getEl(id);
        if (errEl) errEl.innerText = "⚠️ Something went wrong";
      }
    }

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
        bubbleSound?.play();
        if (!leadSubmitted) showMessage(getPersonalizedGreeting() + " " + (config.greetingIntro || "What’s your name?"));

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
          body: JSON.stringify({ name: userName, email: userEmail, chat_log: chatLog, token, client_id })
        }).catch(() => {});
      }
    });

    // Play bubble sound once
    let played = false;
    const playOnce = () => {
      if (!played) {
        bubbleSound?.play();
        played = true;
      }
    };
        ["click","scroll","mousemove","keydown"].forEach(ev =>
      window.addEventListener(ev, playOnce, { once: true })
    ); // <-- THIS IS THE END OF RUN FUNCTION!
} // <-- ADD THIS CLOSING BRACE


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

})();