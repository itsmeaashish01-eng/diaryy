/* ================================================
   MY DAILY DIARY — script.js
   All diary, todo, notes, search, stats, import/export logic
   Data is stored in localStorage under the key "diaryData"
   ================================================ */

// ---- MOTIVATIONAL QUOTES ----
// A collection of short, uplifting quotes shown at the top each day
const QUOTES = [
  "Small steps every day lead to big changes over time.",
  "Your only competition is who you were yesterday.",
  "Progress, not perfection.",
  "Every day is a fresh start.",
  "Write it down. Make it happen.",
  "The secret of getting ahead is getting started.",
  "Be gentle with yourself — you are a work in progress.",
  "What you focus on grows.",
  "One day or day one — you decide.",
  "The best time to plant a tree was yesterday. The second best time is now.",
  "Celebrate small wins. They add up.",
  "Your journal is your most honest friend.",
  "Reflect. Recalibrate. Rise.",
  "Showing up is half the battle.",
  "Invest in your future self today.",
  "Every entry is a snapshot of your growth.",
  "You are allowed to be both a masterpiece and a work in progress.",
  "Done is better than perfect.",
  "Make today count.",
  "Even five minutes of writing can change your day.",
];

// ---- MONTHS & HELPERS ----
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];
const MONTH_SHORT = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec"
];
const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

// The year this diary tracks — defaulting to current year
const DIARY_YEAR = new Date().getFullYear();

// ---- DATA STRUCTURE ----
// diaryData is an object where each key is a date string "YYYY-MM-DD"
// Each entry looks like:
// {
//   diary: "text",
//   mood: "😊",
//   notes: "text",
//   notesTag: "general",
//   tasks: [{ id, text, completed }]
// }
let diaryData = {};

// Currently selected date string "YYYY-MM-DD"
let selectedDate = "";

// Currently selected month (0-based) for sidebar view
let sidebarMonth = new Date().getMonth();

// Debounce timer for auto-save
let saveTimer = null;

// ---- LOAD DATA from localStorage ----
function loadData() {
  try {
    const raw = localStorage.getItem("diaryData");
    if (raw) diaryData = JSON.parse(raw);
  } catch (e) {
    console.warn("Could not load diary data:", e);
    diaryData = {};
  }
}

// ---- SAVE DATA to localStorage ----
function saveData() {
  try {
    localStorage.setItem("diaryData", JSON.stringify(diaryData));
  } catch (e) {
    console.warn("Could not save data:", e);
    showToast("⚠ Storage full — try exporting and clearing some data.");
  }
}

// ---- GET or CREATE entry for a date ----
function getEntry(dateStr) {
  if (!diaryData[dateStr]) {
    diaryData[dateStr] = {
      diary: "",
      mood: "",
      notes: "",
      notesTag: "general",
      tasks: []
    };
  }
  return diaryData[dateStr];
}

// ---- FORMAT DATE STRING "YYYY-MM-DD" ----
function dateStr(year, month, day) {
  // month is 0-based, day is 1-based
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

// ---- GET today's date string ----
function todayStr() {
  const t = new Date();
  return dateStr(t.getFullYear(), t.getMonth(), t.getDate());
}

// ---- TOAST notification ----
let toastTimeout;
function showToast(msg, duration = 2200) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add("hidden"), duration);
}

/* ================================================
   SIDEBAR: Month tabs + Day list
   ================================================ */
function buildSidebar() {
  buildMonthTabs();
  buildDayList();
}

function buildMonthTabs() {
  const container = document.getElementById("monthTabs");
  container.innerHTML = "";
  MONTH_SHORT.forEach((name, i) => {
    const btn = document.createElement("button");
    btn.className = "month-tab" + (i === sidebarMonth ? " active" : "");
    btn.textContent = name;
    btn.addEventListener("click", () => {
      sidebarMonth = i;
      buildSidebar();
    });
    container.appendChild(btn);
  });
}

function buildDayList() {
  const container = document.getElementById("dayList");
  container.innerHTML = "";

  // How many days in this month?
  const daysInMonth = new Date(DIARY_YEAR, sidebarMonth + 1, 0).getDate();
  const today = todayStr();

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = dateStr(DIARY_YEAR, sidebarMonth, d);
    const dateObj = new Date(DIARY_YEAR, sidebarMonth, d);
    const entry = diaryData[ds];

    // Check if this date has any content
    const hasContent = entry && (
      entry.diary.trim() ||
      entry.notes.trim() ||
      (entry.tasks && entry.tasks.length > 0)
    );

    // Count completed tasks for dot indicator
    const taskDone = entry && entry.tasks
      ? entry.tasks.filter(t => t.completed).length
      : 0;
    const taskTotal = entry && entry.tasks ? entry.tasks.length : 0;

    const item = document.createElement("div");
    item.className = "day-item"
      + (ds === selectedDate ? " selected" : "")
      + (hasContent ? " has-entry" : "")
      + (ds === today ? " is-today" : "");
    item.dataset.date = ds;

    item.innerHTML = `
      <div class="day-info">
        <span class="day-num">${d}</span>
        <span class="day-name">${DAY_NAMES[dateObj.getDay()].slice(0,3)}</span>
      </div>
      <span class="day-dots">${taskDone > 0 ? "●".repeat(Math.min(taskDone, 5)) : ""}</span>
    `;

    item.addEventListener("click", () => selectDate(ds));
    container.appendChild(item);
  }
}

/* ================================================
   SELECT DATE — load entry into editor
   ================================================ */
function selectDate(ds) {
  selectedDate = ds;

  // Update sidebar highlight
  document.querySelectorAll(".day-item").forEach(el => {
    el.classList.toggle("selected", el.dataset.date === ds);
  });

  // Parse date parts
  const [y, m, d] = ds.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);

  // Update editor header
  document.getElementById("editorDayLabel").textContent = DAY_NAMES[dateObj.getDay()];
  document.getElementById("editorDate").textContent =
    `${MONTH_NAMES[m - 1]} ${d}, ${y}`;

  const entry = getEntry(ds);

  // Load diary text
  document.getElementById("diaryText").value = entry.diary;

  // Load mood selection
  document.querySelectorAll(".mood-btn").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.mood === entry.mood);
  });

  // Load notes
  document.getElementById("notesText").value = entry.notes;

  // Load notes tag
  document.querySelectorAll(".tag-btn").forEach(btn => {
    btn.classList.toggle("active-tag", btn.dataset.tag === (entry.notesTag || "general"));
  });

  // Render task list
  renderTasks();

  // Update progress and stats
  updateProgress();
  updateStats();

  // Scroll editor to top on mobile
  if (window.innerWidth < 900) {
    document.getElementById("editorPanel").scrollIntoView({ behavior: "smooth" });
  }
}

/* ================================================
   TASKS
   ================================================ */
function renderTasks() {
  const entry = getEntry(selectedDate);
  const list = document.getElementById("taskList");
  const emptyState = document.getElementById("taskEmptyState");
  list.innerHTML = "";

  if (entry.tasks.length === 0) {
    list.appendChild(emptyState);
    emptyState.style.display = "";
    return;
  }

  entry.tasks.forEach(task => {
    const li = document.createElement("li");
    li.className = "task-item" + (task.completed ? " completed" : "");
    li.dataset.id = task.id;

    // Custom checkbox div
    const check = document.createElement("div");
    check.className = "task-check" + (task.completed ? " checked" : "");
    check.setAttribute("role", "checkbox");
    check.setAttribute("aria-checked", task.completed ? "true" : "false");
    check.setAttribute("tabindex", "0");
    check.addEventListener("click", () => toggleTask(task.id));
    check.addEventListener("keydown", e => {
      if (e.key === " " || e.key === "Enter") toggleTask(task.id);
    });

    // Task text
    const span = document.createElement("span");
    span.className = "task-text";
    span.textContent = task.text;

    // Edit / Delete buttons
    const actions = document.createElement("div");
    actions.className = "task-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "task-act-btn";
    editBtn.title = "Edit task";
    editBtn.innerHTML = "✎";
    editBtn.addEventListener("click", () => editTask(task.id, li, span));

    const delBtn = document.createElement("button");
    delBtn.className = "task-act-btn del";
    delBtn.title = "Delete task";
    delBtn.innerHTML = "✕";
    delBtn.addEventListener("click", () => deleteTask(task.id));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    li.appendChild(check);
    li.appendChild(span);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

// Add a new task
function addTask() {
  const input = document.getElementById("newTaskInput");
  const text = input.value.trim();
  if (!text) return;

  const entry = getEntry(selectedDate);
  entry.tasks.push({
    id: Date.now().toString(),  // unique ID based on timestamp
    text: text,
    completed: false
  });

  input.value = "";
  saveData();
  renderTasks();
  buildDayList(); // refresh dots
  updateProgress();
  updateStats();
}

// Toggle task completed/incomplete
function toggleTask(taskId) {
  const entry = getEntry(selectedDate);
  const task = entry.tasks.find(t => t.id === taskId);
  if (task) task.completed = !task.completed;
  saveData();
  renderTasks();
  buildDayList();
  updateProgress();
  updateStats();
}

// Delete a task
function deleteTask(taskId) {
  const entry = getEntry(selectedDate);
  entry.tasks = entry.tasks.filter(t => t.id !== taskId);
  saveData();
  renderTasks();
  buildDayList();
  updateProgress();
  updateStats();
}

// Edit a task inline
function editTask(taskId, liElement, spanElement) {
  const entry = getEntry(selectedDate);
  const task = entry.tasks.find(t => t.id === taskId);
  if (!task) return;

  // Replace the span with an input field
  const inputEl = document.createElement("input");
  inputEl.type = "text";
  inputEl.className = "task-text-input";
  inputEl.value = task.text;

  liElement.replaceChild(inputEl, spanElement);
  inputEl.focus();
  inputEl.select();

  // Save on blur or Enter key
  const saveEdit = () => {
    const newText = inputEl.value.trim();
    if (newText) task.text = newText;
    saveData();
    renderTasks();
  };
  inputEl.addEventListener("blur", saveEdit);
  inputEl.addEventListener("keydown", e => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") renderTasks(); // cancel edit
  });
}

/* ================================================
   PROGRESS BAR
   ================================================ */
function updateProgress() {
  const entry = getEntry(selectedDate);
  const total = entry.tasks.length;
  const done = entry.tasks.filter(t => t.completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  document.getElementById("progressFill").style.width = pct + "%";
  document.getElementById("progressLabel").textContent = pct + "% complete";
  document.getElementById("completionText").textContent = `${done}/${total} tasks`;
  document.getElementById("statToday").textContent = done;
}

/* ================================================
   STATS: week / month / year task counts
   ================================================ */
function updateStats() {
  const today = new Date();
  const [sy, sm, sd] = [today.getFullYear(), today.getMonth(), today.getDate()];

  // Helper: count completed tasks for an array of date strings
  const countDone = (dates) =>
    dates.reduce((sum, ds) => {
      const e = diaryData[ds];
      if (!e || !e.tasks) return sum;
      return sum + e.tasks.filter(t => t.completed).length;
    }, 0);

  // WEEK: last 7 days
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sy, sm, sd - i);
    weekDates.push(dateStr(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  // MONTH: all days this month
  const monthDates = [];
  const daysInMonth = new Date(sy, sm + 1, 0).getDate();
  for (let i = 1; i <= daysInMonth; i++) {
    monthDates.push(dateStr(sy, sm, i));
  }

  // YEAR: all entries in diaryData for current year
  const yearDates = Object.keys(diaryData).filter(ds => ds.startsWith(sy.toString()));

  document.getElementById("statWeek").textContent = countDone(weekDates);
  document.getElementById("statMonth").textContent = countDone(monthDates);
  document.getElementById("statYear").textContent = countDone(yearDates);
}

/* ================================================
   AUTO-SAVE: diary text and notes
   ================================================ */
function triggerAutoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const entry = getEntry(selectedDate);
    entry.diary = document.getElementById("diaryText").value;
    entry.notes = document.getElementById("notesText").value;
    saveData();
    buildDayList(); // refresh indicators
  }, 600); // save 600ms after user stops typing
}

/* ================================================
   SEARCH
   ================================================ */
function runSearch(query) {
  const overlay = document.getElementById("searchOverlay");
  const resultsBox = document.getElementById("searchResults");

  if (!query.trim()) {
    overlay.classList.add("hidden");
    return;
  }

  overlay.classList.remove("hidden");
  const q = query.toLowerCase();
  const results = [];

  // Search through all diary entries
  for (const [ds, entry] of Object.entries(diaryData)) {
    const [y, m, d] = ds.split("-").map(Number);
    const dateLabel = `${MONTH_NAMES[m-1]} ${d}, ${y}`;

    // Check diary text
    if (entry.diary && entry.diary.toLowerCase().includes(q)) {
      results.push({ ds, dateLabel, type: "Diary", excerpt: entry.diary });
    }
    // Check notes
    if (entry.notes && entry.notes.toLowerCase().includes(q)) {
      results.push({ ds, dateLabel, type: "Notes", excerpt: entry.notes });
    }
    // Check tasks
    if (entry.tasks) {
      entry.tasks.forEach(task => {
        if (task.text.toLowerCase().includes(q)) {
          results.push({ ds, dateLabel, type: "Task", excerpt: task.text });
        }
      });
    }
  }

  resultsBox.innerHTML = "";

  if (results.length === 0) {
    resultsBox.innerHTML = `<p class="empty-state">No results for "<strong>${query}</strong>"</p>`;
    return;
  }

  // Render each result
  results.slice(0, 50).forEach(r => {
    const item = document.createElement("div");
    item.className = "search-result-item";

    // Highlight matching text
    const highlighted = highlightMatch(r.excerpt.slice(0, 160), query);

    item.innerHTML = `
      <div class="sr-date">${r.dateLabel}</div>
      <div class="sr-excerpt"><span class="sr-type">${r.type}</span>${highlighted}${r.excerpt.length > 160 ? "…" : ""}</div>
    `;

    item.addEventListener("click", () => {
      // If the date is in a different month, switch sidebar month
      const [ry, rm] = r.ds.split("-").map(Number);
      sidebarMonth = rm - 1;
      buildSidebar();
      selectDate(r.ds);
      overlay.classList.add("hidden");
      document.getElementById("searchInput").value = "";
    });

    resultsBox.appendChild(item);
  });
}

// Wrap matching text in <mark> tags for highlight
function highlightMatch(text, query) {
  const re = new RegExp(`(${escapeRegex(query)})`, "gi");
  return text.replace(re, "<mark>$1</mark>");
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ================================================
   EXPORT DATA as JSON file
   ================================================ */
function exportData() {
  const json = JSON.stringify(diaryData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `my-diary-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("✓ Data exported successfully!");
}

/* ================================================
   IMPORT DATA from JSON file
   ================================================ */
function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      // Basic validation — should be an object
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid format");
      }
      diaryData = parsed;
      saveData();
      buildSidebar();
      if (selectedDate) selectDate(selectedDate);
      updateStats();
      showToast("✓ Data imported successfully!");
    } catch (err) {
      showToast("⚠ Could not import — invalid JSON file.");
    }
  };
  reader.readAsText(file);
}

/* ================================================
   DARK MODE
   ================================================ */
function applyDarkMode(isDark) {
  document.body.classList.toggle("dark", isDark);
  document.getElementById("darkIcon").textContent = isDark ? "☀" : "☾";
  localStorage.setItem("darkMode", isDark ? "1" : "0");
}

/* ================================================
   MOTIVATIONAL QUOTE
   ================================================ */
function setDailyQuote() {
  // Use day-of-year as a consistent index so the same quote shows all day
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  const quote = QUOTES[dayOfYear % QUOTES.length];
  document.getElementById("quoteText").textContent = `"${quote}"`;
}

/* ================================================
   INIT — run everything on page load
   ================================================ */
function init() {
  loadData();

  // Set dark mode from saved preference
  const savedDark = localStorage.getItem("darkMode") === "1";
  applyDarkMode(savedDark);

  // Set daily quote
  setDailyQuote();

  // Select today's date to start
  const today = todayStr();
  const t = new Date();
  sidebarMonth = t.getMonth();

  buildSidebar();
  selectDate(today);

  // ---- EVENT LISTENERS ----

  // Dark mode toggle
  document.getElementById("darkToggle").addEventListener("click", () => {
    applyDarkMode(!document.body.classList.contains("dark"));
  });

  // Export button
  document.getElementById("exportBtn").addEventListener("click", exportData);

  // Import file input
  document.getElementById("importFile").addEventListener("change", (e) => {
    importData(e.target.files[0]);
    e.target.value = ""; // reset input so same file can be imported again
  });

  // Jump to today button
  document.getElementById("todayBtn").addEventListener("click", () => {
    sidebarMonth = new Date().getMonth();
    buildSidebar();
    selectDate(todayStr());
  });

  // Diary text auto-save
  document.getElementById("diaryText").addEventListener("input", triggerAutoSave);

  // Notes text auto-save
  document.getElementById("notesText").addEventListener("input", triggerAutoSave);

  // Add task button
  document.getElementById("addTaskBtn").addEventListener("click", addTask);

  // Add task on Enter key press
  document.getElementById("newTaskInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addTask();
  });

  // Mood buttons
  document.querySelectorAll(".mood-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const entry = getEntry(selectedDate);
      // Toggle off if clicking same mood
      entry.mood = (entry.mood === btn.dataset.mood) ? "" : btn.dataset.mood;
      document.querySelectorAll(".mood-btn").forEach(b => {
        b.classList.toggle("selected", b.dataset.mood === entry.mood);
      });
      saveData();
    });
  });

  // Notes tag buttons
  document.querySelectorAll(".tag-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const entry = getEntry(selectedDate);
      entry.notesTag = btn.dataset.tag;
      document.querySelectorAll(".tag-btn").forEach(b => {
        b.classList.toggle("active-tag", b.dataset.tag === entry.notesTag);
      });
      saveData();
    });
  });

  // Search input — run search on each keystroke
  document.getElementById("searchInput").addEventListener("input", (e) => {
    runSearch(e.target.value);
  });

  // Close search overlay
  document.getElementById("closeSearch").addEventListener("click", () => {
    document.getElementById("searchOverlay").classList.add("hidden");
    document.getElementById("searchInput").value = "";
  });

  // Close search overlay when clicking the dark backdrop
  document.getElementById("searchOverlay").addEventListener("click", (e) => {
    if (e.target === document.getElementById("searchOverlay")) {
      document.getElementById("searchOverlay").classList.add("hidden");
      document.getElementById("searchInput").value = "";
    }
  });

  // Keyboard shortcut: Escape closes search
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.getElementById("searchOverlay").classList.add("hidden");
      document.getElementById("searchInput").value = "";
    }
  });
}

// Run init when the page is ready
document.addEventListener("DOMContentLoaded", init);
