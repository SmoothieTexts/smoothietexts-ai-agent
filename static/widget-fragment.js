// File: static/widget-fragment.js
// Purpose: Injects the chat widget HTML fragment into the host page’s <body> without inline event handlers

(function() {
  document.body.insertAdjacentHTML('beforeend', `
    <!-- 1. Chat Bubble Shell -->
    <div id="chat-bubble">💬
  <span id="chat-badge"></span></div>
    <div id="chat-bubble-msg">Need help? Ask us anything.</div>

    <!-- 2. Chat Popup Container -->
    <div class="chat-popup" id="chatPopup">
      <div class="chat-header">
        <div class="header-avatar" id="headerAvatar"></div>
        <span id="headerBrand">Assistant</span>
        <button class="close-btn" id="closeBtn">➖</button>
      </div>

      <div id="chatBox">
        <div class="chatbox" id="chat">
          <!-- Quick options injected here -->
          <div class="quick-options" id="quickOpts"></div>
        </div>

        <div class="support-link">
          <a href="#" target="_blank" id="supportLink">
            📞 Need more help? Contact Support
          </a>
        </div>

        <div class="input-section">
          <input
            type="text"
            id="userInput"
            placeholder="Type your message…"
          />
          <button id="sendBtn">Send</button>
        </div>
      </div>

      <!-- 3. Notification Sounds -->
      <audio
        id="bubbleSound"
        src="https://two47convo.onrender.com/static/chatopen.wav"
        preload="auto"
      ></audio>
      <audio
        id="replySound"
        src="https://two47convo.onrender.com/static/response.wav"
        preload="auto"
      ></audio>
    </div>
  `);

  // Attach event listeners now that elements exist
  const closeBtn = document.getElementById('closeBtn');
  closeBtn?.addEventListener('click', () => window.toggleChat());
})();
