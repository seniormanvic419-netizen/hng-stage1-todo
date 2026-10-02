/* Ledger — To-Do with notes.
   Talks to /api/tasks (Cloudflare Pages Functions + KV). Each browser gets an
   anonymous list id stored in localStorage; a local cache keeps the UI usable
   if the network is slow or down and syncs when it returns. */
(function () {
  "use strict";

  // ---------- identity & storage --------------------------------------------
  const LIST_KEY = "ledger-list-id";
  const CACHE_KEY = "ledger-cache";
  const THEME_KEY = "ledger-theme";
  let listId = localStorage.getItem(LIST_KEY);
  if (!listId) {
    listId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 36);
    localStorage.setItem(LIST_KEY, listId);
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const els = {
    list: $("#list"), empty: $("#empty"), summary: $("#summary"), progress: $("#progress-bar"), sync: $("#sync"),
    composer: $("#composer"), newTitle: $("#new-title"), newDue: $("#new-due"), newPriority: $("#new-priority"), newNotes: $("#new-notes"),
    search: $("#search"), filterPriority: $("#filter-priority"), sort: $("#sort"), clearDone: $("#clear-done"), theme: $("#theme"), hint: $("#drag-hint"),
    template: $("#task-template"),
  };

  let tasks = loadCache();
  let filter = "all";

  function loadCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]"); } catch { return []; } }
  function saveCache() { try { localStorage.setItem(CACHE_KEY, JSON.stringify(tasks)); } catch {} }

  // ---------- api -------------------------------------------------------------
  let pending = 0;
  function setSync(state, text) {
    els.sync.textContent = text;
    els.sync.className = "sync" + (state ? " is-" + state : "");
  }
  async function api(method, path, body) {
    pending++; setSync("busy", "Saving…");
    try {
      const res = await fetch("/api" + path, {
        method,
        headers: { "Content-Type": "application/json", "X-List-Id": listId },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        let msg = res.statusText;
        try { msg = (await res.json()).error || msg; } catch {}
        throw new Error(msg);
      }
      pending--; if (pending === 0) setSync("", "Saved");
      return res.status === 204 ? null : res.json();
    } catch (err) {
      pending--; setSync("error", "Offline, changes kept locally");
      throw err;
    }
  }

  async function refresh() {
    try {
      tasks = await api("GET", "/tasks");
      saveCache(); render();
    } catch { render(); }
  }

  // ---------- helpers ---------------------------------------------------------
  const today = () => new Date().toISOString().slice(0, 10);
  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
  function dueState(t) {
    if (!t.dueDate || t.done) return "";
    const d = today();
    return t.dueDate < d ? "overdue" : t.dueDate === d ? "today" : "";
  }
  function fmtDue(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function localUpdate(id, patch) {
    const t = tasks.find((x) => x.id === id); if (!t) return;
    Object.assign(t, patch, { updatedAt: new Date().toISOString() });
    saveCache();
  }

  // ---------- render ----------------------------------------------------------
  function visibleTasks() {
    const q = els.search.value.trim().toLowerCase();
    const p = els.filterPriority.value;
    let out = tasks.filter((t) => {
      if (filter === "active" && t.done) return false;
      if (filter === "done" && !t.done) return false;
      if (filter === "overdue" && dueState(t) !== "overdue") return false;
      if (p !== "all" && t.priority !== p) return false;
      if (q && !(t.title.toLowerCase().includes(q) || (t.notes || "").toLowerCase().includes(q))) return false;
      return true;
    });
    const s = els.sort.value;
    if (s === "due") out.sort((a, b) => (a.dueDate || "9999") < (b.dueDate || "9999") ? -1 : (a.dueDate || "9999") > (b.dueDate || "9999") ? 1 : a.order - b.order);
    else if (s === "priority") out.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.order - b.order);
    else if (s === "created") out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    else out.sort((a, b) => a.order - b.order);
    return out;
  }

  function render() {
    const open = new Set($$(".task__details[open]", els.list).map((d) => d.closest(".task").dataset.id));
    const focused = document.activeElement && document.activeElement.closest(".task") ? document.activeElement.closest(".task").dataset.id : null;
    els.list.replaceChildren();
    const shown = visibleTasks();
    const manual = els.sort.value === "manual" && !els.search.value && filter === "all" && els.filterPriority.value === "all";
    els.hint.textContent = manual ? "Drag the handle to reorder. Click “Notes” on a task to add a note." : "Reordering is available with Sort set to Manual and no filters.";

    for (const t of shown) {
      const node = els.template.content.firstElementChild.cloneNode(true);
      node.dataset.id = t.id;
      node.draggable = manual;
      node.classList.toggle("is-done", t.done);
      $(".task__check", node).checked = t.done;
      $(".task__title", node).textContent = t.title;
      const pr = $(".badge--priority", node); pr.textContent = t.priority; pr.className = "badge badge--priority is-" + t.priority;
      const due = $(".badge--due", node);
      if (t.dueDate) { const st = dueState(t); due.textContent = (st === "overdue" ? "Overdue · " : st === "today" ? "Today · " : "Due ") + fmtDue(t.dueDate); due.className = "badge badge--due" + (st ? " is-" + st : ""); due.hidden = false; }
      else due.hidden = true;
      $(".badge--notes", node).hidden = !(t.notes && t.notes.trim());
      $(".task__notes", node).value = t.notes || "";
      $(".task__due", node).value = t.dueDate || "";
      $(".task__priority", node).value = t.priority;
      if (open.has(t.id)) $(".task__details", node).open = true;
      $(".task__handle", node).hidden = !manual;
      els.list.appendChild(node);
    }
    els.empty.hidden = shown.length > 0;

    const done = tasks.filter((t) => t.done).length, total = tasks.length;
    els.summary.textContent = total === 0 ? "No tasks yet" : done === total ? `All ${total} done` : `${total - done} of ${total} left`;
    els.progress.style.width = total ? Math.round((done / total) * 100) + "%" : "0";
    els.clearDone.hidden = done === 0;
    if (focused) { const n = els.list.querySelector(`[data-id="${focused}"] .task__title`); if (n) n.focus(); }
  }

  // ---------- actions ---------------------------------------------------------
  els.composer.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = els.newTitle.value.trim(); if (!title) return;
    const body = { title, notes: els.newNotes.value, priority: els.newPriority.value, dueDate: els.newDue.value || null };
    const temp = { id: "tmp-" + Date.now(), ...body, done: false, order: tasks.length ? Math.max(...tasks.map((t) => t.order)) + 1 : 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    tasks.push(temp); saveCache(); render();
    els.composer.reset(); els.newPriority.value = "medium"; els.newTitle.focus();
    try { const created = await api("POST", "/tasks", body); tasks = tasks.map((t) => (t.id === temp.id ? created : t)); saveCache(); render(); } catch {}
  });

  els.list.addEventListener("change", async (e) => {
    const li = e.target.closest(".task"); if (!li) return;
    const id = li.dataset.id;
    let patch = null;
    if (e.target.matches(".task__check")) patch = { done: e.target.checked };
    else if (e.target.matches(".task__due")) patch = { dueDate: e.target.value || null };
    else if (e.target.matches(".task__priority")) patch = { priority: e.target.value };
    else if (e.target.matches(".task__notes")) patch = { notes: e.target.value };
    if (!patch) return;
    localUpdate(id, patch); render();
    try { await api("PATCH", "/tasks/" + id, patch); } catch {}
  });

  // Title editing: commit on blur or Enter
  els.list.addEventListener("keydown", (e) => {
    if (e.target.matches(".task__title") && e.key === "Enter") { e.preventDefault(); e.target.blur(); }
  });
  els.list.addEventListener("focusout", async (e) => {
    if (!e.target.matches(".task__title")) return;
    const li = e.target.closest(".task"), id = li.dataset.id;
    const title = e.target.textContent.trim();
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    if (!title) { e.target.textContent = t.title; return; }
    if (title === t.title) return;
    localUpdate(id, { title }); render();
    try { await api("PATCH", "/tasks/" + id, { title }); } catch {}
  });

  els.list.addEventListener("click", async (e) => {
    const btn = e.target.closest(".task__delete"); if (!btn) return;
    const li = btn.closest(".task"), id = li.dataset.id;
    tasks = tasks.filter((t) => t.id !== id); saveCache(); render();
    try { await api("DELETE", "/tasks/" + id); } catch {}
  });

  els.clearDone.addEventListener("click", async () => {
    const doneIds = tasks.filter((t) => t.done).map((t) => t.id);
    tasks = tasks.filter((t) => !t.done); saveCache(); render();
    for (const id of doneIds) { try { await api("DELETE", "/tasks/" + id); } catch {} }
  });

  // Search, filter, sort
  els.search.addEventListener("input", render);
  els.filterPriority.addEventListener("change", render);
  els.sort.addEventListener("change", render);
  $$(".chip").forEach((c) => c.addEventListener("click", () => {
    filter = c.dataset.filter;
    $$(".chip").forEach((x) => { const on = x === c; x.classList.toggle("is-active", on); x.setAttribute("aria-pressed", String(on)); });
    render();
  }));

  // ---------- drag and drop --------------------------------------------------
  let dragId = null;
  els.list.addEventListener("dragstart", (e) => {
    const li = e.target.closest(".task"); if (!li || !li.draggable) return;
    dragId = li.dataset.id; li.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId);
  });
  els.list.addEventListener("dragend", () => { dragId = null; $$(".task", els.list).forEach((x) => x.classList.remove("is-dragging", "is-over")); });
  els.list.addEventListener("dragover", (e) => {
    if (!dragId) return; e.preventDefault();
    const over = e.target.closest(".task"); if (!over || over.dataset.id === dragId) return;
    $$(".task", els.list).forEach((x) => x.classList.remove("is-over")); over.classList.add("is-over");
  });
  els.list.addEventListener("drop", async (e) => {
    e.preventDefault();
    const over = e.target.closest(".task"); if (!over || !dragId || over.dataset.id === dragId) return;
    const ids = $$(".task", els.list).map((x) => x.dataset.id);
    const from = ids.indexOf(dragId), to = ids.indexOf(over.dataset.id);
    ids.splice(from, 1); ids.splice(to, 0, dragId);
    ids.forEach((id, i) => { const t = tasks.find((x) => x.id === id); if (t) t.order = i; });
    saveCache(); render();
    try { tasks = await api("PUT", "/tasks/reorder", { ids }); saveCache(); render(); } catch {}
  });

  // Keyboard reorder on the handle: Alt+ArrowUp / Alt+ArrowDown
  els.list.addEventListener("keydown", async (e) => {
    if (!e.target.matches(".task__handle") || !e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const ids = $$(".task", els.list).map((x) => x.dataset.id);
    const id = e.target.closest(".task").dataset.id, i = ids.indexOf(id), j = e.key === "ArrowUp" ? i - 1 : i + 1;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    ids.forEach((x, k) => { const t = tasks.find((y) => y.id === x); if (t) t.order = k; });
    saveCache(); render();
    const h = els.list.querySelector(`[data-id="${id}"] .task__handle`); if (h) h.focus();
    try { tasks = await api("PUT", "/tasks/reorder", { ids }); saveCache(); } catch {}
  });

  // ---------- theme -----------------------------------------------------------
  function currentTheme() {
    const set = document.documentElement.getAttribute("data-theme");
    if (set) return set;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function applyThemeLabel() { els.theme.setAttribute("aria-label", currentTheme() === "dark" ? "Switch to light mode" : "Switch to dark mode"); }
  els.theme.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch {}
    applyThemeLabel();
  });
  applyThemeLabel();

  // ---------- go --------------------------------------------------------------
  render();
  refresh();
})();
