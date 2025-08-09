"use strict"; // <-- 1. ALWAYS at the very top!
// File: 247convo-script.js
// Enhanced: Natural language booking intent parsing + smart field detection

(function () {
  const DEFAULT_CLIENT_ID = "default";
  const BASE_CONFIG_URL  = "https://two47ctest.onrender.com/static";
  const API_BASE         = "https://two47cbackend.onrender.com";

  
// Helper to build API URLs

// Smart name extractor for EN/FR/ES prefixes
function extractName(text) {
  const patterns = [
    // English
    /my name is\s+([^\.,!]+)/i,
    /\bname is\s+([^\.,!]+)/i,
    /\bi am\s+([^\.,!]+)/i,
    /\bi’m\s+([^\.,!]+)/i,
    /\bthis is\s+([^\.,!]+)/i,
    /you can call me\s+([^\.,!]+)/i,
    /they call me\s+([^\.,!]+)/i,
    /\bcall me\s+([^\.,!]+)/i,
    /name:\s*([^\.,!]+)/i,
    // French
    /mon nom est\s+([^\.,!]+)/i,
    /je m'appelle\s+([^\.,!]+)/i,
    /je suis\s+([^\.,!]+)/i,
    /vous pouvez m'appeler\s+([^\.,!]+)/i,
    /appelez-moi\s+([^\.,!]+)/i,
    /on m'appelle\s+([^\.,!]+)/i,
    /prénom\s+([^\.,!]+)/i,
    /nom:\s*([^\.,!]+)/i,
    // Spanish
    /mi nombre es\s+([^\.,!]+)/i,
    /me llamo\s+([^\.,!]+)/i,
    /\bsoy\s+([^\.,!]+)/i,
    /puedes llamarme\s+([^\.,!]+)/i,
    /llámame\s+([^\.,!]+)/i,
    /nombre:\s*([^\.,!]+)/i,
  ];
    for (const pat of patterns) {
      const m = text.match(pat);
      if (m && m[1]) return m[1].trim();
    }
    // Fallback: first two words
    const parts = text.trim().split(/\s+/);
    return parts.slice(0, Math.min(2, parts.length)).join(' ');
  }

  // Smart email extractor (pulls first valid address)
  function extractEmail(text) {
    const emailRegex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
    const m = text.match(emailRegex);
    return m ? m[0].trim() : text.trim();
  }

  function apiUrl(path, params = {}, token = "") {
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

  function getErrorMsg(err) {
    if (!err) return "Unknown error";
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
      "cancel", "no", "stop", "don't want", "not now", "exit", "never mind", "nope",
      "quit", "back", "forget it", "don’t want", "book later", "i will book later", "maybe another time",
      "some other time", "not booking", "not booking now", "not booking anymore", "don’t want to book",
      "i am not booking now", "i don't want to book anymore", "i’m not booking", "will book later"
    ];
    const txtNorm = txt.trim().toLowerCase();
    return cancelPhrases.some(phrase => txtNorm.includes(phrase));
  }

  function getEl(id) { return document.getElementById(id); }
  let bubble, tooltip, header, avatar, support, bubbleSound, replySound, chatBox, userInput, sendBtn, chatBadge;

  async function run() {
    const client_id = getClientID();
    const config = window.__247CONVO_CONFIG__ || await loadConfig(client_id);
    const {
      token = "",
      chatbotName  = "247Convo Bot",
      brandName    = "247Convo",
      supportUrl   = "#",
      avatarUrl    = "",
      bookingProvider = "zoom"
    } = config;

    // Assign global DOM references here:
    bubble      = getEl("chat-bubble");
    tooltip     = getEl("chat-bubble-msg");
    header      = getEl("headerBrand");
    avatar      = getEl("headerAvatar");
    support     = getEl("supportLink");
    bubbleSound = getEl("bubbleSound");
    replySound  = getEl("replySound");
    chatBox     = getEl("chat");
    userInput   = getEl("userInput");
    sendBtn     = getEl("sendBtn");
    chatBadge   = getEl("chat-badge");

    if (!bubble || !tooltip || !chatBox || !userInput || !sendBtn) {
      alert("247Convo Chatbot: Missing critical HTML elements! Please check your widget markup and IDs.");
      return;
    }

    const langPack = config.lang_pack || {};
    let LANG = "en"; // Default language

    function t(key) {
      return (langPack[LANG] && langPack[LANG][key]) ||
             (langPack["en"] && langPack["en"][key]) ||
             key;
    }

    // Quick options now use language pack:
    const quickOption1 = t("quick_1");
    const quickOption2 = t("quick_2");
    const quickOption3 = t("quick_3");

const langSelector = getEl("lang-select");
if (langSelector) {
  Object.keys(langPack).forEach(code => {
    const opt = document.createElement("option");
    opt.value = code;
    // Use flag and full label for user-friendliness
    if (code === "en") {
      opt.innerText = "🇺🇸 English";
    } else if (code === "fr") {
      opt.innerText = "🇫🇷 Français";
    } else if (code === "es") {
      opt.innerText = "🇪🇸 Español";
    } else {
      opt.innerText = code.toUpperCase();
    }
    langSelector.appendChild(opt);
  });
  langSelector.value = LANG;
  langSelector.onchange = function() {
    LANG = this.value;
    if (header) header.innerText = `${brandName} Assistant`;
    if (avatar && avatarUrl) avatar.style.backgroundImage = `url('${avatarUrl}')`;
    if (support) {
      support.href = supportUrl;
      support.textContent = t("support_link");
    }
    if (tooltip) tooltip.innerText = t("bubble");
    if (userInput) userInput.placeholder = t("input_placeholder");
    // if (sendBtn) sendBtn.textContent = t("send");
    getEl("quickOpts")?.remove();
    insertQuickOptions();
    if (tooltip && !(getEl("chatPopup")?.classList.contains("open"))) {
      tooltip.innerText = t("bubble");
    }
  };
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
    let bookingInProgress = false;

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
      let html = `<div style="font-size:1.1em;margin-bottom:4px;">${t("rating_prompt")}</div>`;
      for (let i = 1; i <= 5; i++) {
        html += `<button data-rate="${i}" style="font-size:2em;cursor:pointer;border:none;background:none;">⭐️</button>`;
      }
      div.innerHTML = html;
      chatBox.appendChild(div);
      div.querySelectorAll('button[data-rate]').forEach(btn => {
        btn.onclick = async (e) => {
          const score = e.target.getAttribute("data-rate");
          div.innerHTML = t("rating_thanks");
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
            botReply(t("rating_error"));
            enableInput();
          }
        };
      });
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    function getPersonalizedGreeting() {
      let greet = t("greeting");
      const hour = new Date().getHours();
      if (hour >= 12 && hour < 18) greet = t("greeting_afternoon");
      if (hour >= 18) greet = t("greeting_evening");
      if (userName) greet += ` ${userName}`;
      return greet;
    }

    if (header) header.innerText = `${brandName} Assistant`;
    if (avatar && avatarUrl) avatar.style.backgroundImage = `url('${avatarUrl}')`;
    if (support) support.href = supportUrl;
    if (tooltip) tooltip.innerText = t("bubble");
    if (userInput) userInput.placeholder = t("input_placeholder");
    // if (sendBtn) sendBtn.textContent = t("send");
    if (support) support.textContent = t("support_link");

    setTimeout(() => {
      const popup = getEl("chatPopup");
      if (
        tooltip &&
        popup && !popup.classList.contains("open") &&
        !window.__247CONVO_BUBBLE_MSG_SHOWN
      ) {
        const provText = t("proactive_bubble");
        typewriterTooltip(provText);
        shakeBubble();
        pulseBubble(true);
        showBadge(1);
        window.__247CONVO_BUBBLE_MSG_SHOWN = true;
      }
    }, 60000);

    document.addEventListener("mouseleave", e => {
      const popup = getEl("chatPopup");
      if (
        tooltip &&
        e.clientY < 10 &&
        popup && !popup.classList.contains("open") &&
        !window.__247CONVO_BUBBLE_MSG_EXIT_SHOWN
      ) {
        const provText = t("proactive_exitIntent");
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
        const provText = t("proactive_scrollDepth");
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
      showMessage(`${text}`, false, false, "", isError);
      replySound?.play();
      setTimeout(() => userInput.focus(), 0);
    }

    function insertQuickOptions() {
      if (!chatBox) return;
      getEl("quickOpts")?.remove();

      const div = document.createElement("div");
      div.className = "quick-options";
      div.id = "quickOpts";

      const quicks = [t("quick_1"), t("quick_2"), t("quick_3")];
      quicks.forEach(q => {
        const btn = document.createElement("button");
        btn.textContent = q;
        btn.type = "button";
        btn.addEventListener("click", () => quickAsk(q));
        div.appendChild(btn);
      });

      chatBox.appendChild(div);
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    function waitForUserInput() {
      return new Promise(resolve => {
        function onKey(e) {
          if (e.key === "Enter") {
            e.stopImmediatePropagation();
            cleanup();
            const val = userInput.value.trim();
            userInput.value = "";
            setTimeout(() => userInput.focus(), 0);
            resolve(val);
          }
        }
        function onClick(e) {
          e.stopImmediatePropagation();
          cleanup();
          const val = userInput.value.trim();
          userInput.value = "";
          setTimeout(() => userInput.focus(), 0);
          resolve(val);
        }
        function cleanup() {
          userInput.removeEventListener("keydown", onKey, true);
          sendBtn.removeEventListener("click", onClick, true);
        }
        userInput.addEventListener("keydown", onKey, true);
        sendBtn.addEventListener("click", onClick, true);
        sendBtn.disabled = false;
        userInput.disabled = false;
        setTimeout(() => userInput.focus(), 0);
      });
    }

    function fetchWithTimeout(resource, options = {}) {
      const { timeout = 35000 } = options;
      return Promise.race([
        fetch(resource, options),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Network timeout, please try again.")), timeout)
        )
      ]);
    }

    async function getAvailableSlots(dateStr) {
      const res = await fetchWithTimeout(apiUrl('/availability/' + getClientID(), { date: dateStr }, token));
      if (!res.ok) return [];
      const data = await res.json();
      return data.slots || [];
    }

    async function startBookingFlow() {
      bookingInProgress = true;

      if (!leadSubmitted) {
        botReply(t("book_lead_prompt") || "Before booking, may I have your name and email?");
        enableInput();
        return;
      }

      const businessTimezone = config.timezone || "UTC";
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      botReply(
        (t("book_timezones") || 
          `All available times are shown in <b>your local timezone</b>: {userTZ}.<br>Business location timezone: <b>{bizTZ}</b>.`)
          .replace("{userTZ}", userTimezone)
          .replace("{bizTZ}", businessTimezone)
      );

      const pickedDate = await showDatePicker(config);
      if (!pickedDate) {
        botReply(t("book_cancelled"));
        bookingInProgress = false;
        bookingState.inProgress = false;
        bookingState = { inProgress: false, date: null, time: null };
        userInput.disabled = false;
        sendBtn.disabled = false;
        insertQuickOptions();
        setTimeout(() => userInput.focus(), 0);
        return;
      }

      const isoDate = pickedDate.toISOString().split("T")[0];
      const slots = await getAvailableSlots(isoDate);
      if (!slots.length) {
        botReply(t("book_no_slots"));
        bookingInProgress = false;
        return startBookingFlow();
      }

      const slotMap = slots.map(slotUTC => ({
        utc: slotUTC,
        userLocal: new Date(slotUTC).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: userTimezone }),
        bizLocal: new Date(slotUTC).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: businessTimezone }),
        raw: slotUTC
      }));

      botReply(
        (t("book_times_for_date") || "Available times for {date}:")
          .replace("{date}", pickedDate.toLocaleDateString(undefined, {weekday:"long", year:"numeric", month:"short", day:"numeric"}))
      );
      const pickedSlot = await showTimePicker(slotMap, userTimezone, businessTimezone);
      if (!pickedSlot) {
        botReply(t("book_cancelled"));
        bookingInProgress = false;
        bookingState.inProgress = false;
        bookingState = { inProgress: false, date: null, time: null };
        userInput.disabled = false;
        sendBtn.disabled = false;
        insertQuickOptions();
        setTimeout(() => userInput.focus(), 0);
        return;
      }

      const slotUserTZ = new Date(pickedSlot.utc).toLocaleString(undefined, { timeZone: userTimezone });
      const slotBizTZ = new Date(pickedSlot.utc).toLocaleString(undefined, { timeZone: businessTimezone });
      botReply(
        (t("book_confirm_details") ||
          "Confirm booking:<br><b>{userTime} (your time: {userTZ})</b><br><b>{bizTime} (business time: {bizTZ})</b><br>Duration: {duration} min"
        )
          .replace("{userTime}", slotUserTZ)
          .replace("{userTZ}", userTimezone)
          .replace("{bizTime}", slotBizTZ)
          .replace("{bizTZ}", businessTimezone)
          .replace("{duration}", config.meetingDuration || 40)
      );
      botReply(t("book_confirm"));
      enableInput();
      const confirm = await waitForUserInput();
      if (!/^y(es)?$/i.test(confirm)) {
        botReply(t("book_cancelled"));
        bookingInProgress = false;
        bookingState.inProgress = false;
        bookingState = { inProgress: false, date: null, time: null };
        userInput.disabled = false;
        sendBtn.disabled = false;
        insertQuickOptions();
        setTimeout(() => userInput.focus(), 0);
        return;
      }

      botReply(t("book_purpose"));
      enableInput();
      const purpose = await waitForUserInput();

      showMessage(t("book_in_progress") || "Booking your appointment…", false, true);

      try {
        const res = await fetchWithTimeout(`${API_BASE}/book`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: getClientID(),
            token: config.token,
            name: userName,
            email: userEmail,
            datetime: pickedSlot.utc,
            timezone: userTimezone,
            business_timezone: businessTimezone,
            purpose,
            bookingProvider: config.bookingProvider
          })
        });

        if (!res.ok) {
          let msg = "Couldn’t book slot. Try again.";
          try {
            const err = await res.json();
            if (err.error) msg = err.error;
          } catch { }
          botReply(msg);
          bookingInProgress = false;
          bookingState = { inProgress: false, date: null, time: null };
          userInput.disabled = false;
          sendBtn.disabled = false;
          insertQuickOptions();
          setTimeout(() => userInput.focus(), 0);
          return;
        }

        const { confirmation_link, booking_status, reset_history } = await res.json();
        botReply(
          (t("book_success") || "✅ Appointment booked!<br><a href=\"{link}\" target=\"_blank\">View details</a><br>You'll receive a confirmation email.")
            .replace("{link}", confirmation_link)
        );
        bookingInProgress = false;
        bookingState.inProgress = false;
        bookingState = { inProgress: false, date: null, time: null };
        if (reset_history) conversationHistory = [];
        userInput.disabled = false;
        sendBtn.disabled = false;
        insertQuickOptions();
        insertRatingWidget();
        setTimeout(() => userInput.focus(), 0);
        console.log('[Booking] Done. Booking state reset. Ready for main chat.');
      } catch (error) {
        botReply(t("book_fail"), true);
        bookingInProgress = false;
        userInput.disabled = false;
        sendBtn.disabled = false;
      }
    }

    async function showDatePicker(config) {
      return new Promise(resolve => {
        const wrapper = document.createElement("div");
        wrapper.style.margin = "1em 0";
        wrapper.innerHTML = `
          <label>${t("select_date")}</label><br/>
          <input type="text" id="manualDate" style="padding:5px;margin:5px 0;" autocomplete="off" placeholder="${t("date_placeholder")}" readonly />
          <div style="font-size:0.85em;color:#888;">${t("date_helptext")}</div>
        `;
        chatBox.appendChild(wrapper);
        chatBox.scrollTop = chatBox.scrollHeight;

        const dateInput = wrapper.querySelector("#manualDate");
        const allowedDays = Object.keys(config.availableHours || {}).map(s => s.toLowerCase());
        setTimeout(() => {
          flatpickr(dateInput, {
            minDate: "today",
            maxDate: new Date().fp_incr(180),
            dateFormat: "Y-m-d",
            disable: [
              function(date) {
                const dayName = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
                return !allowedDays.includes(dayName);
              }
            ],
            onChange: function(selectedDates) {
              if (selectedDates.length) {
                resolve(selectedDates[0]);
                wrapper.remove();
              }
            }
          });
        }, 0);
      });
    }

    async function showTimePicker(slotMap, userTimezone, businessTimezone) {
      return new Promise(resolve => {
        const wrapper = document.createElement("div");
        wrapper.style.margin = "1em 0";
        wrapper.innerHTML = `<p>${t("pick_time")}</p>`;
        slotMap.forEach(slot => {
          const btn = document.createElement("button");
          btn.textContent = slot.userLocal;
          btn.style = "padding:6px 12px;margin:4px;border-radius:6px;";
          btn.onclick = () => {
            wrapper.remove();
            resolve(slot);
          };
          wrapper.appendChild(btn);
        });
        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = t("cancel");
        cancelBtn.style = "margin-left:12px;";
        cancelBtn.onclick = () => {
          wrapper.remove();
          resolve(null);
        };
        wrapper.appendChild(cancelBtn);

        chatBox.appendChild(wrapper);
        chatBox.scrollTop = chatBox.scrollHeight;
      });
    }

    async function handleInput() {
      const txt = userInput.value.trim();
      console.log("Input received:", txt, "bookingInProgress:", bookingInProgress);

      if (!txt) return;
      sendBtn.disabled = true;

      showMessage(txt, true);
      userInput.value = "";

      if (bookingInProgress) {
        if (!bookingState.inProgress) {
          bookingInProgress = false;
          resetBookingState();
          insertQuickOptions();
          setTimeout(() => userInput.focus(), 0);
          return;
        }
        if (/start over|cancel|exit/i.test(txt)) {
          bookingInProgress = false;
          bookingState.inProgress = false;
          resetBookingState();
          await sendMessage("Booking cancelled.");
          insertQuickOptions();
          setTimeout(() => userInput.focus(), 0);
          return;
        }
        if (/continue/i.test(txt)) {
          return await startBookingFlow();
        }
        return await startBookingFlow();
      }

      if (/start over/i.test(txt)) {
        resetBookingState();
        await sendMessage(t("book_cancelled"));
        bookingInProgress = false;
        bookingState = { inProgress: false, date: null, time: null };
        userInput.disabled = false;
        sendBtn.disabled = false;
        insertQuickOptions();
        setTimeout(() => userInput.focus(), 0);
        return;
      }

      // **Lead capture: Name then Email**
      if (!leadSubmitted) {
        if (collecting === "name") {
          // Extract and store only the person’s name
          const rawName = extractName(txt);
          userName = rawName.slice(0, 100);
          collecting = "email";
          enableInput();
          return botReply(`${getPersonalizedGreeting()} ${t("ask_email")}`);
        } else if (collecting === "email") {
          // Extract and store only the email address
          const rawEmail = extractEmail(txt);
          userEmail = rawEmail.slice(0, 100);
          // Validate email format
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
            botReply(t("error_email"), true);
            enableInput();
            return;
          }
          leadSubmitted = true;
          collecting = "done";
          enableInput();
          botReply(
            (t("lead_thanks") || "✅ Thanks, {name}! I’m {bot}. How can I help?")
              .replace("{name}", userName)
              .replace("{bot}", chatbotName)
          );
          return insertQuickOptions();
        }
      }

      if (leadSubmitted) {
        if (
          /\b(book|schedule|appointment|meeting)\b/i.test(txt) &&
          !bookingInProgress && !bookingState.inProgress
        ) {
          bookingState.inProgress = true;
          bookingInProgress = true;
          return startBookingFlow();
        }
        bookingState.inProgress = false;
        bookingInProgress = false;

        if (/human|agent|real person|support|help/i.test(txt)) {
          botReply(t("handoff_intro"), false);
          if (t("handoff_whatsapp")) showMessage(t("handoff_whatsapp"), false);
          userInput.disabled = false;
          sendBtn.disabled = false;
          return;
        }
      }

      await sendMessage(txt);

      userInput.disabled = false;
      sendBtn.disabled = false;
    }

    function stripTags(str) {
      const div = document.createElement('div');
      div.innerHTML = str;
      return div.textContent || div.innerText || "";
    }

    async function sendMessage(txt) {
      const id = `msg-${Date.now()}`;
      showMessage("<em>Loading...</em>", false, true, id);
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
            lang: LANG
          }),
        });
        const wrapper = getEl(`${id}-wrapper`);
        if (wrapper) wrapper.remove();
        if (!res.ok) {
          botReply(t("error_generic"), false);
          enableInput();
          return;
        }
        let data = {};
        try {
          data = await res.json();
        } catch (err) {
          botReply(t("error_generic"), false);
          enableInput();
          return;
        }
        const safeAnswer =
          typeof data.answer === "string"
            ? linkify(stripTags(data.answer))
            : (data.answer ? JSON.stringify(data.answer, null, 2) : t("no_response") || "No response from bot.");
        showMessage(`${safeAnswer}`, false);
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
      pulseBubble(false);
      hideBadge();
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
  } // End of run()

  function waitForFlatpickrThenRun() {
    if (typeof flatpickr !== "undefined") {
      run();
    } else {
      setTimeout(waitForFlatpickrThenRun, 30);
    }
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", waitForFlatpickrThenRun);
  } else {
    waitForFlatpickrThenRun();
  }
  window.addEventListener("error", function(e) {
    console.error("[GLOBAL ERROR]", e.error || e.message || e);
  });
  window.addEventListener("unhandledrejection", function(e) {
    console.error("[UNHANDLED PROMISE REJECTION]", e.reason);
  });

})(); // End IIFE
