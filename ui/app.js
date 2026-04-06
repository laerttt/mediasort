const { invoke } = window.__TAURI__.core;
const { convertFileSrc } = window.__TAURI__.core;

// ── State ─────────────────────────────────────────────────────────────────────

let state = {
  projects: [],
  current: null,
  editingDest: null,
};

// ── Routing ───────────────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(`screen-${id}`).classList.add("active");
}

// ── Toast ─────────────────────────────────────────────────────────────────────

let _toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

function uuid() {
  return crypto.randomUUID();
}

// ── Home Screen ───────────────────────────────────────────────────────────────

async function renderHome() {
  state.projects = await invoke("list_projects");
  const screen = document.getElementById("screen-home");
  screen.innerHTML = `
    <div class="home-header">
      <h1>MediaSort</h1>
      <p>Sort photos &amp; videos into folders with a single keystroke.</p>
    </div>
    <div class="project-list" id="project-list">
      ${state.projects.length === 0
        ? `<p style="color:var(--muted);text-align:center">No projects yet — create one below.</p>`
        : state.projects.map((p) => `
          <div class="project-card" data-id="${p.id}">
            <div class="project-card-info">
              <strong>${esc(p.name)}</strong>
              <span>${esc(p.source_folder)}</span>
              <span style="margin-top:2px">${p.media_files.length} files · ${p.destinations.length} destinations · index ${p.current_index}</span>
            </div>
            <div class="project-card-actions">
              <button class="btn-secondary btn-open" data-id="${p.id}">Open</button>
              <button class="btn-danger btn-delete" data-id="${p.id}">✕</button>
            </div>
          </div>
        `).join("")}
    </div>
    <div class="home-actions">
      <button class="btn-primary" id="btn-new">+ New Project</button>
    </div>
  `;

  screen.querySelector("#btn-new").onclick = startNewProject;
  screen.querySelectorAll(".btn-open").forEach((btn) => {
    btn.onclick = (e) => { e.stopPropagation(); const p = state.projects.find((p) => p.id === btn.dataset.id); if (p) openProject(p); };
  });
  screen.querySelectorAll(".project-card").forEach((card) => {
    card.onclick = () => { const p = state.projects.find((p) => p.id === card.dataset.id); if (p) openProject(p); };
  });
  screen.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm("Delete this project? (Files are NOT deleted.)")) return;
      await invoke("delete_project", { id: btn.dataset.id });
      await renderHome();
    };
  });
}

function openProject(p) {
  state.current = p;
  if (p.media_files.length > 0 && p.destinations.length > 0) startSorting();
  else renderSetup();
}

function startNewProject() {
  state.current = { id: uuid(), name: "New Project", source_folder: "", current_index: 0, destinations: [], media_files: [], history: [] };
  renderSetup();
}

// ── Setup Screen ──────────────────────────────────────────────────────────────

const KEY_POOL = "QWERTYUIOPASDFGHJKLZXCVBNM1234567890".split("");

function nextAvailableKey(usedKeys) {
  return KEY_POOL.find((k) => !usedKeys.includes(k)) || "?";
}

function renderSetup() {
  const p = state.current;
  const screen = document.getElementById("screen-setup");
  screen.innerHTML = `
    <div class="setup-header">
      <button class="btn-ghost" id="btn-back">← Back</button>
      <h2>${p.id && state.projects.find((x) => x.id === p.id) ? "Edit" : "New"} Project</h2>
    </div>
    <div class="setup-section">
      <label>Project Name</label>
      <input type="text" id="proj-name" value="${esc(p.name)}" placeholder="e.g. Summer 2024" />
    </div>
    <div class="setup-section">
      <label>Source Folder</label>
      <div class="folder-row">
        <input type="text" id="src-folder" value="${esc(p.source_folder)}" placeholder="Choose a folder…" readonly />
        <button class="btn-secondary" id="btn-pick-src">Browse</button>
        <button class="btn-secondary" id="btn-rescan" ${!p.source_folder ? "disabled" : ""}>↺ Rescan</button>
      </div>
    </div>
    <div class="setup-section">
      <label>Destinations</label>
      <div class="dest-list" id="dest-list"></div>
      <button class="btn-secondary" id="btn-add-dest" style="margin-top:4px">+ Add Destination</button>
    </div>
    <div class="setup-footer">
      <button class="btn-primary" id="btn-start">Scan &amp; Start Sorting →</button>
      <button class="btn-secondary" id="btn-save">Save</button>
    </div>
  `;

  screen.querySelector("#btn-back").onclick = () => { showScreen("home"); renderHome(); };
  screen.querySelector("#btn-pick-src").onclick = pickSourceFolder;
  screen.querySelector("#btn-rescan").onclick = async () => {
    if (!state.current.source_folder) return;
    toast("Rescanning…");
    const files = await invoke("scan_media", { folder: state.current.source_folder });
    state.current.media_files = files;
    state.current.current_index = 0;
    state.current.history = [];
    await invoke("save_project", { project: state.current });
    toast(`Found ${files.length} files.`);
  };
  screen.querySelector("#btn-add-dest").onclick = addDestination;
  screen.querySelector("#btn-start").onclick = scanAndStart;
  screen.querySelector("#btn-save").onclick = saveSetup;
  screen.querySelector("#proj-name").oninput = (e) => { p.name = e.target.value; };

  renderDestList();
  showScreen("setup");
}

function renderDestList() {
  const p = state.current;
  const list = document.getElementById("dest-list");
  if (!list) return;
  list.innerHTML = p.destinations.map((d, i) => `
    <div class="dest-item">
      <span class="badge" title="Click to reassign key" data-i="${i}">${esc(d.keystroke)}</span>
      <span class="dest-name">${esc(d.name)}</span>
      <span class="dest-path" title="${esc(d.path)}">${esc(d.path)}</span>
      <button class="btn-ghost" data-del="${i}" style="font-size:16px;line-height:1">✕</button>
    </div>
  `).join("") || '<p style="color:var(--muted);font-size:12px">No destinations yet.</p>';

  list.querySelectorAll(".badge[data-i]").forEach((badge) => { badge.onclick = () => startKeyCapture(parseInt(badge.dataset.i)); });
  list.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = () => { p.destinations.splice(parseInt(btn.dataset.del), 1); renderDestList(); };
  });
}

function startKeyCapture(i) {
  toast("Press any key to assign…");
  const handler = (e) => {
    e.preventDefault();
    const key = e.key.toUpperCase();
    if (key.length !== 1) return;
    const collision = state.current.destinations.findIndex((d, idx) => d.keystroke === key && idx !== i);
    if (collision >= 0) { toast(`Key "${key}" already used!`); return; }
    state.current.destinations[i].keystroke = key;
    window.removeEventListener("keydown", handler, true);
    renderDestList();
  };
  window.addEventListener("keydown", handler, true);
}

async function pickSourceFolder() {
  const folder = await invoke("pick_folder");
  if (!folder) return;
  state.current.source_folder = folder;
  document.getElementById("src-folder").value = folder;
}

async function addDestination() {
  const folder = await invoke("pick_folder");
  if (!folder) return;
  const usedKeys = state.current.destinations.map((d) => d.keystroke);
  const key = nextAvailableKey(usedKeys);
  const name = folder.split("/").pop() || folder.split("\\").pop() || "Folder";
  state.current.destinations.push({ name, path: folder, keystroke: key });
  renderDestList();
}

function readSetupInputs() {
  const p = state.current;
  p.name = document.getElementById("proj-name")?.value || p.name;
  p.source_folder = document.getElementById("src-folder")?.value || p.source_folder;
}

async function saveSetup() {
  readSetupInputs();
  await invoke("save_project", { project: state.current });
  toast("Project saved.");
}

async function scanAndStart() {
  readSetupInputs();
  const p = state.current;
  if (!p.source_folder) { toast("Please choose a source folder."); return; }
  if (p.destinations.length === 0) { toast("Please add at least one destination."); return; }
  toast("Scanning…");
  const files = await invoke("scan_media", { folder: p.source_folder });
  if (files.length === 0) { toast("No media files found in that folder."); return; }
  p.media_files = files;
  if (p.current_index >= files.length) p.current_index = 0;
  p.history = p.history || [];
  await invoke("save_project", { project: p });
  startSorting();
}

// ── Sort Screen ───────────────────────────────────────────────────────────────

function startSorting() {
  showScreen("sort");
  renderSort();
  window.addEventListener("keydown", onSortKey);
}

function stopSorting() {
  window.removeEventListener("keydown", onSortKey);
}

function renderSort() {
  const p = state.current;
  const screen = document.getElementById("screen-sort");
  const total = p.media_files.length;
  const idx = p.current_index;
  const done = idx >= total;
  const progress = total > 0 ? (idx / total) * 100 : 0;
  const currentFile = !done ? p.media_files[idx] : null;

  screen.innerHTML = `
    <div class="sort-media">
      <div class="media-container" id="media-container">
        ${done ? renderDoneOverlay() : renderMediaElement(currentFile)}
      </div>
      <div class="media-toolbar">
        <span class="media-filename">${currentFile ? esc(currentFile.split("/").pop()) : "—"}</span>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="width:${progress}%"></div>
        </div>
        <span>${Math.min(idx + 1, total)} / ${total}</span>
      </div>
    </div>
    <div class="sort-panel">
      <h3>Destinations</h3>
      ${p.destinations.map((d, i) => `
        <button class="dest-button" data-i="${i}">
          <span class="badge">${esc(d.keystroke)}</span>
          <span class="dest-btn-label">
            ${esc(d.name)}
            <span class="dest-btn-path">${esc(d.path)}</span>
          </span>
        </button>
      `).join("")}
      <div class="sort-controls">
        <div class="hint-row"><span class="badge">←</span><span>Previous file</span></div>
        <div class="hint-row"><span class="badge">→</span><span>Skip (no move)</span></div>
        <button class="btn-secondary" id="btn-rescan">↺ Rescan Folder</button>
        <button class="btn-secondary" id="btn-back-setup">Edit Project</button>
        <button class="btn-secondary" id="btn-home">Home</button>
      </div>
    </div>
  `;

  screen.querySelectorAll(".dest-button[data-i]").forEach((btn) => { btn.onclick = () => moveToDest(parseInt(btn.dataset.i)); });
  screen.querySelector("#btn-back-setup").onclick = () => { stopSorting(); renderSetup(); };
  screen.querySelector("#btn-home").onclick = () => { stopSorting(); showScreen("home"); renderHome(); };
  screen.querySelector("#btn-rescan").onclick = async () => {
    toast("Rescanning…");
    const files = await invoke("scan_media", { folder: state.current.source_folder });
    state.current.media_files = files;
    state.current.current_index = 0;
    state.current.history = [];
    await invoke("save_project", { project: state.current });
    toast(`Found ${files.length} files.`);
    renderSort();
  };

  if (done) {
    screen.querySelector("#btn-done-home")?.addEventListener("click", () => { stopSorting(); showScreen("home"); renderHome(); });
  }
}

function renderDoneOverlay() {
  return `
    <div class="done-overlay">
      <h2>🎉 All done!</h2>
      <p>You've sorted all ${state.current.media_files.length} files.</p>
      <div class="done-actions">
        <button class="btn-primary" id="btn-done-home">Back to Home</button>
      </div>
    </div>
  `;
}

function renderMediaElement(filePath) {
  const src = "asset://localhost/" + encodeURIComponent(filePath).replace(/%2F/g, "/");
  const ext = filePath.split(".").pop().toLowerCase();
  const videoExts = ["mp4","mov","avi","mkv","webm","m4v","flv","wmv","mpg","mpeg","3gp"];
  const audioExts = ["mp3","m4a","wav","flac","ogg","aac"];
  if (videoExts.includes(ext)) return `<video src="${src}" controls autoplay muted style="max-width:100%;max-height:100%"></video>`;
  if (audioExts.includes(ext)) return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:40px">
      <div style="font-size:64px">🎵</div>
      <div style="color:var(--muted)">${esc(filePath.split("/").pop())}</div>
      <audio src="${src}" controls autoplay></audio>
    </div>`;
  return `<img src="${src}" alt="media" draggable="false" />`;
}

async function moveToDest(destIndex) {
  const p = state.current;
  if (p.current_index >= p.media_files.length) return;
  const src = p.media_files[p.current_index];
  const dest = p.destinations[destIndex];
  const btns = document.querySelectorAll(".dest-button");
  btns[destIndex]?.classList.add("flash");
  setTimeout(() => btns[destIndex]?.classList.remove("flash"), 300);
  try {
    const newPath = await invoke("move_file", { src, destDir: dest.path });
    // Store [originalPath, newPath, indexWhenMoved]
    p.history.push([src, newPath, p.current_index]);
    p.current_index++;
    await invoke("save_project", { project: p });
    renderSort();
    toast(`→ ${dest.name}`);
  } catch (err) {
    toast(`Error: ${err}`);
  }
}

// Go back one file. If the previous file was moved, undo that move first.
async function goBack() {
  const p = state.current;
  if (p.current_index === 0) { toast("Already at the first file."); return; }

  const prevIndex = p.current_index - 1;

  // Check if the last history entry corresponds to the previous index
  if (p.history && p.history.length > 0) {
    const last = p.history[p.history.length - 1];
    const [origSrc, movedTo, movedAtIndex] = last;
    if (movedAtIndex === prevIndex) {
      // Undo the move — put file back in source folder
      try {
        const destDir = origSrc.substring(0, origSrc.lastIndexOf("/"));
        await invoke("move_file", { src: movedTo, destDir });
        p.history.pop();
        p.media_files[prevIndex] = origSrc;
      } catch (err) {
        toast(`Could not undo move: ${err}`);
        return;
      }
    }
  }

  p.current_index = prevIndex;
  await invoke("save_project", { project: p });
  renderSort();
}

function onSortKey(e) {
  if (e.target.tagName === "INPUT") return;
  if (e.key === "ArrowLeft") { e.preventDefault(); goBack(); return; }
  if (e.key === "ArrowRight") { e.preventDefault(); skipFile(); return; }
  const key = e.key.toUpperCase();
  const dest = state.current.destinations.findIndex((d) => d.keystroke === key);
  if (dest >= 0) { e.preventDefault(); moveToDest(dest); }
}

async function skipFile() {
  const p = state.current;
  if (p.current_index >= p.media_files.length) return;
  p.current_index++;
  await invoke("save_project", { project: p });
  renderSort();
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function esc(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.body.insertAdjacentHTML("beforeend", '<div id="toast"></div>');
renderHome();
showScreen("home");