// File: static/247convo-loader.js
// Purpose: Inject per-client config, CSS, HTML fragment, and main chat logic—no CORS fetches.

(function(){
  // ── 0️⃣ Determine client_id from this loader’s own <script> URL
  let client_id = 'default';
  (function(){
    const scripts = document.getElementsByTagName('script');
    for (let s of scripts) {
      const m = (s.src || '').match(/[?&]client_id=([^&]+)/);
      if (m) {
        client_id = decodeURIComponent(m[1]);
        break;
      }
    }
  })();

  // ── 1️⃣ Inject per-client config script (no JSON fetch)
  const configScript = document.createElement('script');
  configScript.src   = `https://two47convo.onrender.com/static/config-${client_id}.js`;
  configScript.defer = true;
  document.head.appendChild(configScript);

  // ── 2️⃣ Load widget CSS via <link> (avoids CORS)
  const link = document.createElement('link');
  link.rel  = 'stylesheet';
  link.href = 'https://two47convo.onrender.com/static/247convo-style.css';
  document.head.appendChild(link);

  // ── 3️⃣ Inject the HTML fragment via script tag
  const fragmentScript = document.createElement('script');
  fragmentScript.src   = 'https://two47convo.onrender.com/static/widget-fragment.js';
  fragmentScript.defer = true;
  document.body.appendChild(fragmentScript);

// Load chrono bundle first, then widget script
const chronoScript = document.createElement('script');
chronoScript.src = 'https://two47convo.onrender.com/static/chrono.bundle.js';
chronoScript.onload = () => {
  const widgetScript = document.createElement('script');
  widgetScript.src   = `https://two47convo.onrender.com/static/247convo-script.js?client_id=${client_id}`;
  widgetScript.defer = true;
  document.body.appendChild(widgetScript);
};
document.head.appendChild(chronoScript);

})();
