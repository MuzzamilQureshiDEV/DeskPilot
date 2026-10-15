// AstaDesk chat, copy-paste embed (stores connected with their own Shopify app).
// <script src="https://www.astadesk.com/astadesk-chat.js" data-key="…" async></script>
// Creates the widget's root element and stylesheet, then the shared widget code runs.
(function () {
  if (typeof document === "undefined" || document.getElementById("deskpilot-chat")) return;
  var script =
    document.currentScript ||
    (function () {
      var all = document.querySelectorAll("script[data-key][src*='astadesk-chat']");
      return all[all.length - 1];
    })();
  if (!script) return;
  var key = script.getAttribute("data-key");
  if (!key) return;
  var base = new URL(script.src).origin + "/api/widget/" + encodeURIComponent(key);
  var css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = new URL(script.src).origin + "/astadesk-chat.css";
  document.head.appendChild(css);
  var root = document.createElement("div");
  root.id = "deskpilot-chat";
  root.className = "dpc-root dpc-right";
  root.hidden = true;
  root.setAttribute("data-endpoint", base + "/messages");
  root.setAttribute("data-config", base + "/config");
  document.body.appendChild(root);
})();
