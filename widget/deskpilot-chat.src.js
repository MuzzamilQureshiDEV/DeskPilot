/* AstaDesk storefront chat. Plain JS, no dependencies.
 * Talks only to /apps/deskpilot/messages (Shopify app proxy, signed by Shopify).
 * Message text is always rendered with textContent (never innerHTML). */
(function (global) {
  "use strict";

  var TOKEN_KEY = "deskpilot-chat-token";
  var EMAIL_KEY = "deskpilot-chat-email";
  var OPEN_POLL = 4000;
  var FAST_POLL = 1500;
  var CLOSED_POLL = 30000;
  var MAX_BACKOFF = 60000;
  var TYPING_WINDOW = 60000; // show "typing…" this long after the shopper's last message

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

  /** Next poll delay: fast while a reply is expected, normal when open, slow when closed; doubles after errors. */
  function nextDelay(open, failures, fast) {
    var base = fast ? FAST_POLL : open ? OPEN_POLL : CLOSED_POLL;
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
  var title = root.getAttribute("data-title") || "Chat with us";
  var state = {
    open: false,
    messages: [], // confirmed by the server
    pending: [], // optimistic: { id, body, at, failed }
    failures: 0,
    unread: 0,
    loading: false,
    sentAt: 0,
    timer: null,
    tempId: 0,
  };

  // ---- DOM -----------------------------------------------------------------

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }
  function svg(path, size) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("width", size || 22);
    s.setAttribute("height", size || 22);
    s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", path);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "2");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    s.appendChild(p);
    return s;
  }
  var ICON_CHAT = "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z";
  var ICON_CLOSE = "M6 6l12 12M18 6 6 18";
  var ICON_SEND = "M5 12h14M13 6l6 6-6 6";
  var ICON_DOWN = "M6 9l6 6 6-6";

  var launcher = el("button", "dpc-launcher");
  launcher.type = "button";
  launcher.setAttribute("aria-label", root.getAttribute("data-open-label") || "Open chat");
  launcher.setAttribute("aria-expanded", "false");
  var iconOpen = el("span", "dpc-icon dpc-icon-open");
  iconOpen.appendChild(svg(ICON_CHAT, 26));
  var iconClose = el("span", "dpc-icon dpc-icon-close");
  iconClose.appendChild(svg(ICON_DOWN, 26));
  launcher.appendChild(iconOpen);
  launcher.appendChild(iconClose);
  var badge = el("span", "dpc-badge");
  badge.hidden = true;
  launcher.appendChild(badge);

  var panel = el("div", "dpc-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", title);
  panel.hidden = true;

  // Header: avatar + title + online status.
  var header = el("div", "dpc-header");
  var who = el("div", "dpc-who");
  var agent = (root.getAttribute("data-agent") || "").trim();
  var avatar = el("span", "dpc-avatar", agent ? agent.charAt(0).toUpperCase() : "");
  if (!agent) avatar.appendChild(svg("M12 3l1.8 4.9L19 9.5l-5.2 1.6L12 16l-1.8-4.9L5 9.5l5.2-1.6z", 20));
  avatar.appendChild(el("span", "dpc-online"));
  var titles = el("div", "dpc-titles");
  titles.appendChild(el("strong", "dpc-title", title));
  titles.appendChild(el("span", "dpc-sub", (agent ? agent + " · " : "") + "AI assistant · replies in seconds"));
  who.appendChild(avatar);
  who.appendChild(titles);
  var close = el("button", "dpc-close");
  close.type = "button";
  close.setAttribute("aria-label", root.getAttribute("data-close-label") || "Close chat");
  close.appendChild(svg(ICON_CLOSE, 18));
  header.appendChild(who);
  header.appendChild(close);

  var list = el("div", "dpc-list");
  list.setAttribute("aria-live", "polite");
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
  input.placeholder = "Write a message…";
  input.setAttribute("aria-label", "Your message");
  var send = el("button", "dpc-send");
  send.type = "submit";
  send.setAttribute("aria-label", "Send");
  send.appendChild(svg(ICON_SEND, 18));
  row.appendChild(input);
  row.appendChild(send);
  form.appendChild(email);
  form.appendChild(row);
  var foot = el("p", "dpc-foot", "AI replies can make mistakes · a person can take over");

  panel.appendChild(header);
  panel.appendChild(list);
  panel.appendChild(error);
  panel.appendChild(form);
  panel.appendChild(foot);
  root.appendChild(panel);
  root.appendChild(launcher);
  root.hidden = false;

  // ---- Rendering -------------------------------------------------------------

  function timeLabel(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function bubble(m, extraClass) {
    var b = el("div", "dpc-msg " + (m.from === "you" ? "dpc-you" : "dpc-agent") + (extraClass ? " " + extraClass : ""), m.body);
    if (m.at) b.title = timeLabel(m.at);
    return b;
  }

  function typing() {
    var t = el("div", "dpc-msg dpc-agent dpc-typing");
    t.setAttribute("aria-label", "Typing");
    for (var i = 0; i < 3; i++) t.appendChild(el("span", "dpc-dot"));
    return t;
  }

  function waitingForReply() {
    return state.pending.length > 0 || awaitingReply(state.messages);
  }
  function typingNow() {
    return waitingForReply() && Date.now() - state.sentAt < TYPING_WINDOW;
  }

  var rendered = {};
  function render() {
    list.textContent = "";
    var greeting = root.getAttribute("data-greeting");
    if (greeting) list.appendChild(bubble({ from: "agent", body: greeting }, "dpc-greeting"));
    if (state.loading && state.messages.length === 0) list.appendChild(el("div", "dpc-skeleton"));
    state.messages.forEach(function (m) {
      list.appendChild(bubble(m, rendered[m.id] ? "" : "dpc-new"));
      rendered[m.id] = true;
    });
    state.pending.forEach(function (p) {
      var b = bubble({ from: "you", body: p.body, at: p.at }, p.failed ? "dpc-failed" : "dpc-sending");
      if (p.failed) {
        var retry = el("button", "dpc-retry", "Not sent · tap to retry");
        retry.type = "button";
        retry.addEventListener("click", function () {
          state.pending = state.pending.filter(function (x) {
            return x !== p;
          });
          deliver(p.body);
        });
        var wrap = el("div", "dpc-failed-wrap");
        wrap.appendChild(b);
        wrap.appendChild(retry);
        list.appendChild(wrap);
      } else {
        list.appendChild(b);
      }
    });
    if (typingNow()) list.appendChild(typing());
    else if (waitingForReply() && state.pending.length === 0) {
      list.appendChild(el("p", "dpc-hint", "Thanks! A teammate will reply here shortly."));
    }
    email.hidden = (state.messages.length > 0 || state.pending.length > 0) && !!email.value;
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
    state.timer = setTimeout(poll, nextDelay(state.open, state.failures, state.open && typingNow()));
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
        state.loading = false;
        apply(data.messages);
      })
      .catch(function () {
        state.failures++;
        state.loading = false;
        render();
      })
      .then(schedule);
  }

  /** Show the message immediately, then confirm it with the server. */
  function deliver(text) {
    if (!token) {
      token = newToken();
      save(TOKEN_KEY, token);
    }
    var temp = { id: "tmp-" + ++state.tempId, body: text, at: new Date().toISOString(), failed: false };
    state.pending.push(temp);
    state.sentAt = Date.now();
    error.textContent = "";
    render();

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
        state.pending = state.pending.filter(function (x) {
          return x !== temp;
        });
        apply(data.messages);
        schedule();
      })
      .catch(function (err) {
        temp.failed = true;
        error.textContent = err && err.message ? err.message : "Couldn't send. Please try again.";
        render();
      });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    if (email.value) save(EMAIL_KEY, email.value.trim());
    input.value = "";
    autosize();
    deliver(text);
    input.focus();
  });

  function autosize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
    send.disabled = !input.value.trim();
  }
  input.addEventListener("input", autosize);
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
    launcher.setAttribute("aria-label", open ? root.getAttribute("data-close-label") || "Close chat" : root.getAttribute("data-open-label") || "Open chat");
    root.classList.toggle("dpc-is-open", open);
    if (open) {
      state.unread = 0;
      if (token && state.messages.length === 0) state.loading = true;
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

  autosize();
  render();
  if (token) poll();
})(typeof window !== "undefined" ? window : globalThis);
