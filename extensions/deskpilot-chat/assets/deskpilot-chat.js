/* DeskPilot storefront chat. Plain JS, no dependencies.
 * Talks only to /apps/deskpilot/messages (Shopify app proxy, signed by Shopify).
 * Message text is always rendered with textContent (never innerHTML). */
(function (global) {
  "use strict";

  var TOKEN_KEY = "deskpilot-chat-token";
  var EMAIL_KEY = "deskpilot-chat-email";
  var OPEN_POLL = 4000;
  var CLOSED_POLL = 30000;
  var MAX_BACKOFF = 60000;

  // ---- Pure helpers (unit-tested) ------------------------------------------

  /** Merge new messages into the list by id, keeping time order. */
  function mergeMessages(current, incoming) {
    var byId = {};
    var out = [];
    current.concat(incoming).forEach(function (m) {
      if (!m || !m.id || byId[m.id]) return;
      byId[m.id] = true;
      out.push(m);
    });
    return out.sort(function (a, b) {
      return a.at < b.at ? -1 : a.at > b.at ? 1 : 0;
    });
  }

  /** Next poll delay: normal cadence, doubling after errors (capped). */
  function nextDelay(open, failures) {
    var base = open ? OPEN_POLL : CLOSED_POLL;
    return failures > 0 ? Math.min(base * Math.pow(2, failures), MAX_BACKOFF) : base;
  }

  /** Is the shopper waiting for a reply (their message is the latest)? */
  function awaitingReply(messages) {
    return messages.length > 0 && messages[messages.length - 1].from === "you";
  }

  function newToken() {
    var bytes = new Uint8Array(32);
    global.crypto.getRandomValues(bytes);
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return global.btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  global.DeskPilotChat = { mergeMessages: mergeMessages, nextDelay: nextDelay, awaitingReply: awaitingReply };

  if (typeof document === "undefined") return;
  var root = document.getElementById("deskpilot-chat");
  if (!root || root.getAttribute("data-ready")) return;
  root.setAttribute("data-ready", "1");

  // ---- Storage (private mode may throw) ------------------------------------

  function load(key) {
    try {
      return global.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function save(key, value) {
    try {
      global.localStorage.setItem(key, value);
    } catch {
      /* chat still works for this page view */
    }
  }

  var token = load(TOKEN_KEY);
  var endpoint = root.getAttribute("data-endpoint");
  var state = { open: false, messages: [], failures: 0, unread: 0, sending: false, timer: null };

  // ---- DOM -----------------------------------------------------------------

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  var launcher = el("button", "dpc-launcher");
  launcher.type = "button";
  launcher.setAttribute("aria-label", root.getAttribute("data-open-label") || "Open chat");
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML =
    '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z"/></svg>';
  var badge = el("span", "dpc-badge");
  badge.hidden = true;
  launcher.appendChild(badge);

  var panel = el("div", "dpc-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", root.getAttribute("data-title") || "Chat");
  panel.hidden = true;

  var header = el("div", "dpc-header");
  var titles = el("div", "dpc-titles");
  titles.appendChild(el("strong", "", root.getAttribute("data-title") || "Chat with us"));
  titles.appendChild(el("span", "dpc-sub", "AI assistant · a person can take over"));
  var close = el("button", "dpc-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", root.getAttribute("data-close-label") || "Close chat");
  header.appendChild(titles);
  header.appendChild(close);

  var list = el("div", "dpc-list");
  list.setAttribute("aria-live", "polite");
  var hint = el("p", "dpc-hint");
  var error = el("p", "dpc-error");
  error.setAttribute("role", "alert");

  var form = el("form", "dpc-form");
  var email = el("input", "dpc-email");
  email.type = "email";
  email.placeholder = "Your email (optional, so we can follow up)";
  email.setAttribute("aria-label", "Your email (optional)");
  email.value = load(EMAIL_KEY) || "";
  var row = el("div", "dpc-row");
  var input = el("textarea", "dpc-input");
  input.rows = 1;
  input.maxLength = 2000;
  input.placeholder = "Type your message…";
  input.setAttribute("aria-label", "Your message");
  var send = el("button", "dpc-send", "Send");
  send.type = "submit";
  row.appendChild(input);
  row.appendChild(send);
  form.appendChild(email);
  form.appendChild(row);

  panel.appendChild(header);
  panel.appendChild(list);
  panel.appendChild(hint);
  panel.appendChild(error);
  panel.appendChild(form);
  root.appendChild(panel);
  root.appendChild(launcher);
  root.hidden = false;

  function render() {
    list.textContent = "";
    var greeting = root.getAttribute("data-greeting");
    if (greeting) list.appendChild(el("div", "dpc-msg dpc-agent", greeting));
    state.messages.forEach(function (m) {
      list.appendChild(el("div", "dpc-msg " + (m.from === "you" ? "dpc-you" : "dpc-agent"), m.body));
    });
    hint.textContent = awaitingReply(state.messages) ? "Thanks! We'll reply here shortly." : "";
    email.hidden = state.messages.length > 0 && !!email.value;
    list.scrollTop = list.scrollHeight;
    badge.hidden = state.open || state.unread === 0;
    badge.textContent = state.unread > 9 ? "9+" : String(state.unread);
  }

  // ---- Network -------------------------------------------------------------

  function lastAt() {
    return state.messages.length ? state.messages[state.messages.length - 1].at : "";
  }

  function apply(messages) {
    var before = state.messages.length;
    state.messages = mergeMessages(state.messages, messages || []);
    if (!state.open) {
      for (var i = before; i < state.messages.length; i++) if (state.messages[i].from === "agent") state.unread++;
    }
    render();
  }

  function schedule() {
    clearTimeout(state.timer);
    if (!token) return;
    state.timer = setTimeout(poll, nextDelay(state.open, state.failures));
  }

  function poll() {
    if (!token || document.hidden) return schedule();
    var url = endpoint + "?token=" + encodeURIComponent(token) + (lastAt() ? "&after=" + encodeURIComponent(lastAt()) : "");
    fetch(url, { headers: { Accept: "application/json" }, credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then(function (data) {
        state.failures = 0;
        apply(data.messages);
      })
      .catch(function () {
        state.failures++;
      })
      .then(schedule);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || state.sending) return;
    if (!token) {
      token = newToken();
      save(TOKEN_KEY, token);
    }
    if (email.value) save(EMAIL_KEY, email.value.trim());
    state.sending = true;
    send.disabled = true;
    error.textContent = "";
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ token: token, text: text, email: email.value.trim() || undefined }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data && data.error ? data.error : "Couldn't send. Please try again.");
          return data;
        });
      })
      .then(function (data) {
        input.value = "";
        apply(data.messages);
        schedule();
      })
      .catch(function (err) {
        error.textContent = err && err.message ? err.message : "Couldn't send. Please try again.";
      })
      .then(function () {
        state.sending = false;
        send.disabled = false;
        input.focus();
      });
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  });

  function setOpen(open) {
    state.open = open;
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    root.classList.toggle("dpc-is-open", open);
    if (open) {
      state.unread = 0;
      render();
      input.focus();
      poll();
    } else {
      launcher.focus();
      schedule();
    }
  }

  launcher.addEventListener("click", function () {
    setOpen(!state.open);
  });
  close.addEventListener("click", function () {
    setOpen(false);
  });
  panel.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setOpen(false);
  });

  render();
  if (token) poll();
})(typeof window !== "undefined" ? window : globalThis);
