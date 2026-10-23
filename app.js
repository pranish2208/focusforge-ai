(() => {
  "use strict";
  const STORAGE_KEY = "focusforge-ai-tasks-v1";
  const THEME_KEY = "focusforge-theme";
  const today = () => new Date().toISOString().slice(0, 10);
  const uid = () => (crypto && crypto.randomUUID) ? crypto.randomUUID() : `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const $ = (id) => document.getElementById(id);
  const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));

  const dateLabel = (date) => {
    if (!date) return "No due date";
    const d = new Date(`${date}T12:00:00`);
    if (date === today()) return "Today";
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    if (date === tomorrow.toISOString().slice(0,10)) return "Tomorrow";
    return d.toLocaleDateString(undefined, { month:"short", day:"numeric" });
  };

  const niceDate = (date) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" });

  const defaultTasks = [
    { id:uid(), title:"Plan the most important work", notes:"Choose one outcome to move forward today.", priority:"high", due:today(), completed:false, created:Date.now() },
    { id:uid(), title:"Break a big task into small steps", notes:"Make the next action clear and achievable.", priority:"medium", due:today(), completed:false, created:Date.now() - 1000 },
    { id:uid(), title:"Review progress at the end of the day", notes:"Celebrate progress and prepare for tomorrow.", priority:"low", due:"", completed:false, created:Date.now() - 2000 }
  ];

  let tasks = loadTasks();
  let currentView = "dashboard";
  let currentFilter = "all";
  let editingId = null;
  let toastTimeout = null;
  let timerInterval = null;
  let secondsRemaining = 25 * 60;
  let activeBreakdownSteps = [];

  // Theme Management
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = saved || (prefersDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
    updateThemeIcon(theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
    updateThemeIcon(next);
    showToast(`Switched to ${next} theme`);
  }

  function updateThemeIcon(theme) {
    const btn = $("themeToggleBtn");
    if (btn) btn.textContent = theme === "dark" ? "☼" : "☾";
  }

  // Web Audio Chime
  function playTone(freq = 520, duration = 0.25) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  function loadTasks() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : defaultTasks;
    } catch (error) { return defaultTasks; }
  }

  async function syncWithServer() {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.tasks) && data.tasks.length > 0) {
          // If local is default and server has real items
          const stored = localStorage.getItem(STORAGE_KEY);
          if (!stored) {
            tasks = data.tasks;
            render();
          }
        }
      }
    } catch (e) {
      // Offline fallback
    }
  }

  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (error) {
      showToast("Could not save locally. Check browser storage settings.");
    }
    // Background sync to server API
    fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tasks)
    }).catch(() => {});
  }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function getVisibleTasks() {
    const query = $("searchInput").value.trim().toLowerCase();
    return tasks.filter(task => {
      const matchesQuery = !query || `${task.title} ${task.notes}`.toLowerCase().includes(query);
      const matchesFilter = currentFilter === "all" ||
        (currentFilter === "high" && task.priority === "high" && !task.completed) ||
        (currentFilter === "active" && !task.completed) ||
        (currentFilter === "completed" && task.completed);
      const matchesView = currentView !== "today" || task.due === today();
      return matchesQuery && matchesFilter && matchesView;
    }).sort((a,b) => Number(a.completed) - Number(b.completed) ||
      (a.due || "9999-99-99").localeCompare(b.due || "9999-99-99") ||
      ({high:0,medium:1,low:2}[a.priority] - {high:0,medium:1,low:2}[b.priority]) ||
      b.created - a.created);
  }

  function renderStats() {
    const total = tasks.length, completed = tasks.filter(t => t.completed).length;
    const active = tasks.filter(t => !t.completed).length;
    const due = tasks.filter(t => !t.completed && t.due === today()).length;
    $("totalStat").textContent = total;
    $("completedStat").textContent = completed;
    $("progressStat").textContent = active;
    $("dueStat").textContent = due;
    $("completedSub").textContent = total ? `${Math.round(completed / total * 100)}% of all tasks` : "Ready when you are";
    $("navTaskCount").textContent = active;
    const percent = total ? Math.round(completed / total * 100) : 0;
    $("progressPercent").textContent = `${percent}%`;
    $("progressBar").style.width = `${percent}%`;
    $("progressCaption").textContent = `${completed} of ${total} completed`;
    $("taskFooterText").textContent = `${active} active task${active === 1 ? "" : "s"}`;
  }

  function renderTasks() {
    const visible = getVisibleTasks();
    $("taskList").innerHTML = visible.map(task => {
      const overdue = task.due && task.due < today() && !task.completed;
      return `<article class="task-row ${task.completed ? "is-complete" : ""}">
        <button class="task-check ${task.completed ? "checked" : ""}" data-action="toggle" data-id="${escapeHTML(task.id)}" aria-label="${task.completed ? "Mark incomplete" : "Mark complete"}">${task.completed ? "✓" : ""}</button>
        <div class="task-main"><span class="task-title">${escapeHTML(task.title)}</span>${task.notes ? `<span class="task-notes">${escapeHTML(task.notes)}</span>` : ""}
          <div class="task-meta"><span class="task-date ${overdue ? "overdue" : ""}">${overdue ? "Overdue · " : ""}${escapeHTML(dateLabel(task.due))}</span></div>
        </div>
        <span class="priority ${escapeHTML(task.priority)}">${task.priority[0].toUpperCase()+task.priority.slice(1)}</span>
        <button class="task-menu" data-action="edit" data-id="${escapeHTML(task.id)}" aria-label="Edit ${escapeHTML(task.title)}" title="Edit task">⋯</button>
      </article>`;
    }).join("");
    $("emptyState").hidden = visible.length !== 0;
    $("taskList").hidden = visible.length === 0;
    $("clearCompletedBtn").hidden = !tasks.some(t => t.completed);
    $("filterPills").hidden = currentView === "calendar" || currentView === "analytics";
  }

  async function renderSuggestions() {
    // Try fetching live AI suggestions from server
    try {
      const res = await fetch("/api/ai/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tasks)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.suggestions) && data.suggestions.length) {
          $("suggestionsList").innerHTML = data.suggestions.map(i => `<div class="suggestion"><div class="suggestion-icon ${i.color || ""}">${i.icon}</div><div><strong>${escapeHTML(i.title)}</strong><p>${escapeHTML(i.text)}</p></div></div>`).join("");
          return;
        }
      }
    } catch (e) {}

    // Fallback: local rules
    const active = tasks.filter(t => !t.completed);
    const high = active.filter(t => t.priority === "high");
    const overdue = active.filter(t => t.due && t.due < today());
    const dueToday = active.filter(t => t.due === today());
    const items = [];
    if (overdue.length) items.push({ icon:"!", color:"amber", title:"Review overdue work", text:`${overdue.length} task${overdue.length===1?" is":"s are"} past the due date. Reschedule or complete the most important one.` });
    if (high.length) items.push({ icon:"◎", color:"", title:"Start with high priority", text:`You have ${high.length} high-priority task${high.length===1?"":"s"}. Choose the one with the clearest next step.` });
    if (dueToday.length) items.push({ icon:"◷", color:"amber", title:"Protect time for today", text:`${dueToday.length} unfinished task${dueToday.length===1?" is":"s are"} due today. Give them a realistic time block.` });
    if (!items.length) items.push({ icon:"✓", color:"green", title:"You're in a good place", text:active.length ? "Your active tasks are manageable. Keep moving one step at a time." : "No active tasks. Add a new goal when you're ready." });
    const completed = tasks.filter(t => t.completed).length;
    items.push({ icon:"↗", color:"green", title: completed ? "Progress is progress" : "Keep the plan realistic", text: completed ? `You've completed ${completed} task${completed===1?"":"s"}. Take a moment to recognize the momentum.` : "A short, focused list is easier to act on than a long, perfect one." });
    $("suggestionsList").innerHTML = items.slice(0,3).map(i => `<div class="suggestion"><div class="suggestion-icon ${i.color}">${i.icon}</div><div><strong>${escapeHTML(i.title)}</strong><p>${escapeHTML(i.text)}</p></div></div>`).join("");
  }

  function renderCalendar() {
    const active = tasks.filter(t => !t.completed).sort((a,b) => (a.due || "9999-99-99").localeCompare(b.due || "9999-99-99"));
    const groups = new Map();
    active.forEach(t => { const key = t.due || "unscheduled"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(t); });
    if (!groups.size) { $("calendarList").innerHTML = `<div class="empty-state"><div class="empty-illustration">✓</div><h3>Nothing on the schedule</h3><p>Add tasks with due dates to see your upcoming plan.</p></div>`; return; }
    $("calendarList").innerHTML = [...groups.entries()].map(([date, group]) => `<div class="calendar-day"><div class="calendar-day-label">${date==="unscheduled"?"Unscheduled":escapeHTML(date===today()?"Today":niceDate(date))}<small>${group.length} task${group.length===1?"":"s"}</small></div><div class="calendar-day-tasks">${group.map(t => `<div class="calendar-task"><div><strong>${escapeHTML(t.title)}</strong><small>${escapeHTML(t.notes || "No notes added")}</small></div><span class="priority ${escapeHTML(t.priority)}">${t.priority[0].toUpperCase()+t.priority.slice(1)}</span></div>`).join("")}</div></div>`).join("");
  }

  function renderAnalytics() {
    const total = tasks.length, done = tasks.filter(t=>t.completed).length;
    const high = tasks.filter(t=>t.priority==="high"&&!t.completed).length;
    const overdue = tasks.filter(t=>t.due&&t.due<today()&&!t.completed).length;
    $("analyticsGrid").innerHTML = [
      ["Completion rate", `${total?Math.round(done/total*100):0}%`, `${done} tasks completed`],
      ["High priority", high, "Tasks still needing attention"],
      ["Overdue tasks", overdue, overdue ? "Consider rescheduling these" : "You're up to date"]
    ].map(([title,value,caption])=>`<div class="analytics-tile"><span>${title}</span><strong>${value}</strong><p>${caption}</p></div>`).join("");
  }

  function render() {
    renderStats(); renderTasks(); renderSuggestions(); renderCalendar(); renderAnalytics();
    $("dashboardLayout").hidden = currentView === "calendar" || currentView === "analytics";
    $("calendarView").hidden = currentView !== "calendar";
    $("analyticsView").hidden = currentView !== "analytics";
    const names = {dashboard:"Dashboard",tasks:"My Tasks",today:"Today",calendar:"Calendar",analytics:"Analytics"};
    $("breadcrumbView").textContent = names[currentView] || "Dashboard";
    $("listHeading").textContent = currentView === "today" ? "Today's tasks" : currentView === "tasks" ? "All tasks" : "Today's plan";
    $("pageTitle").innerHTML = currentView === "today" ? "Make today count <span class='wave'>✦</span>" : currentView === "tasks" ? "Your tasks, organized" : currentView === "calendar" ? "Your upcoming schedule" : currentView === "analytics" ? "Progress at a glance" : "Good morning! <span class='wave'>✦</span>";
    $("pageSubtitle").textContent = currentView === "today" ? "Focus on what needs your attention today." : currentView === "tasks" ? "Keep every next step in one place." : currentView === "calendar" ? "See what is coming up and plan ahead." : currentView === "analytics" ? "Small steps add up to meaningful progress." : "Make space for the work that matters.";
    document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===currentView));
    $("dateEyebrow").textContent = new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"}).toUpperCase();
  }

  function openTaskDialog(task = null) {
    editingId = task ? task.id : null;
    $("dialogTitle").textContent = task ? "Edit task" : "Create a task";
    $("taskTitle").value = task?.title || "";
    $("taskNotes").value = task?.notes || "";
    $("taskPriority").value = task?.priority || "medium";
    $("taskDue").value = task?.due || today();
    $("saveTaskBtn").textContent = task ? "Save changes" : "Save task";

    // Show delete & AI breakdown buttons only when editing
    const deleteBtn = $("deleteTaskBtn");
    const aiBtn = $("aiBreakdownBtn");
    if (deleteBtn) deleteBtn.style.display = task ? "inline-flex" : "none";
    if (aiBtn) aiBtn.style.display = task ? "inline-flex" : "none";

    $("taskDialog").showModal();
    setTimeout(()=>$("taskTitle").focus(),50);
  }

  function closeTaskDialog() { $("taskDialog").close(); }

  function submitTask(event) {
    event.preventDefault();
    const title = $("taskTitle").value.trim();
    if (!title) { $("taskTitle").focus(); return; }
    const data = { title, notes:$("taskNotes").value.trim(), priority:$("taskPriority").value, due:$("taskDue").value, updated:Date.now() };
    if (editingId) {
      tasks = tasks.map(t => t.id === editingId ? {...t,...data} : t);
      showToast("Task updated.");
    } else {
      tasks.unshift({id:uid(),...data,completed:false,created:Date.now()});
      showToast("Task added to your workspace.");
    }
    saveTasks(); closeTaskDialog(); render();
  }

  function deleteTask() {
    if (!editingId) return;
    tasks = tasks.filter(t => t.id !== editingId);
    saveTasks();
    closeTaskDialog();
    render();
    showToast("Task deleted.");
  }

  function handleTaskAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const task = tasks.find(t=>t.id===button.dataset.id);
    if (!task) return;
    if (button.dataset.action === "toggle") {
      task.completed = !task.completed;
      saveTasks();
      render();
      if (task.completed) {
        playTone(660, 0.2);
        showToast("Nice work — task completed!");
      } else {
        showToast("Task moved back to active.");
      }
    } else if (button.dataset.action === "edit") {
      openTaskDialog(task);
    }
  }

  // AI Breakdown Logic
  async function triggerAiBreakdown() {
    const title = $("taskTitle").value.trim();
    if (!title) return;
    $("breakdownTitle").textContent = `Micro-steps`;
    $("breakdownStepsList").innerHTML = `<div style="padding:18px; text-align:center; color:var(--muted);">Analyzing task with FocusForge intelligence engine...</div>`;
    $("breakdownDialog").showModal();

    try {
      const res = await fetch("/api/ai/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
      const data = await res.json();
      activeBreakdownSteps = data.steps || [];
    } catch (e) {
      activeBreakdownSteps = [
        `Define clear outcome for "${title}"`,
        "Organize prerequisite resources and links",
        "Complete a 15-minute rough baseline action",
        "Refine and verify completion criteria"
      ];
    }

    $("breakdownStepsList").innerHTML = activeBreakdownSteps.map((step, idx) => `
      <div class="step-item">
        <span class="step-number">${idx + 1}</span>
        <span>${escapeHTML(step)}</span>
      </div>
    `).join("");
  }

  function addBreakdownAsTasks() {
    if (!activeBreakdownSteps.length) return;
    const parentTitle = $("taskTitle").value.trim();
    activeBreakdownSteps.forEach((step, idx) => {
      tasks.unshift({
        id: uid(),
        title: step,
        notes: `Sub-step of: ${parentTitle}`,
        priority: "medium",
        due: today(),
        completed: false,
        created: Date.now() - (idx * 50)
      });
    });
    saveTasks();
    $("breakdownDialog").close();
    closeTaskDialog();
    render();
    showToast(`Added ${activeBreakdownSteps.length} micro-steps as tasks!`);
  }

  function setView(view) {
    currentView = view; currentFilter = "all";
    document.querySelectorAll(".pill").forEach(p=>p.classList.toggle("active",p.dataset.filter==="all"));
    render(); $("sidebar").classList.remove("open");
  }

  function exportTasks() {
    const blob = new Blob([JSON.stringify({app:"FocusForge AI",exportedAt:new Date().toISOString(),tasks},null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href=url; a.download="focusforge-tasks.json"; a.click(); URL.revokeObjectURL(url);
    showToast("Your task backup has been exported.");
  }

  function clearCompleted() {
    const count = tasks.filter(t=>t.completed).length;
    if (!count) return;
    if (confirm(`Clear ${count} completed task${count===1?"":"s"}?`)) {
      tasks = tasks.filter(t=>!t.completed); saveTasks(); render(); showToast("Completed tasks cleared.");
    }
  }

  function updateTimer() {
    const mins = String(Math.floor(secondsRemaining/60)).padStart(2,"0");
    const secs = String(secondsRemaining%60).padStart(2,"0");
    $("timerDisplay").textContent = `${mins}:${secs}`;
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    $("startTimerBtn").textContent = "Start focus";
  }

  function startTimer() {
    if (timerInterval) {
      stopTimer();
      playTone(440, 0.15);
      return;
    }
    if (secondsRemaining <= 0) secondsRemaining = 25*60;
    playTone(880, 0.25);
    $("startTimerBtn").textContent = "Pause";
    timerInterval = setInterval(() => {
      secondsRemaining--;
      updateTimer();
      if (secondsRemaining <= 0) {
        stopTimer();
        playTone(1046.5, 0.5); // High C chime
        showToast("✦ Focus session complete! Take a well-earned break.");
      }
    }, 1000);
  }

  function resetTimer() {
    stopTimer();
    secondsRemaining = 25*60;
    updateTimer();
  }

  // Event Listeners
  document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
  $("addTaskBtn").addEventListener("click",()=>openTaskDialog());
  $("emptyAddBtn").addEventListener("click",()=>openTaskDialog());
  $("calendarAddBtn").addEventListener("click",()=>openTaskDialog());
  $("viewAllBtn").addEventListener("click",()=>setView("tasks"));
  $("taskList").addEventListener("click",handleTaskAction);
  $("taskForm").addEventListener("submit",submitTask);
  $("closeDialogBtn").addEventListener("click",closeTaskDialog);
  $("cancelDialogBtn").addEventListener("click",closeTaskDialog);
  $("deleteTaskBtn").addEventListener("click",deleteTask);
  $("aiBreakdownBtn").addEventListener("click",triggerAiBreakdown);
  $("closeBreakdownBtn").addEventListener("click",()=>$("breakdownDialog").close());
  $("cancelBreakdownBtn").addEventListener("click",()=>$("breakdownDialog").close());
  $("addStepsAsTasksBtn").addEventListener("click",addBreakdownAsTasks);

  $("filterPills").addEventListener("click",event=>{
    const button=event.target.closest("[data-filter]"); if(!button)return;
    currentFilter=button.dataset.filter;
    document.querySelectorAll(".pill").forEach(p=>p.classList.toggle("active",p===button));
    renderTasks();
  });

  $("searchInput").addEventListener("input",renderTasks);
  $("clearCompletedBtn").addEventListener("click",clearCompleted);
  $("exportBtn").addEventListener("click",exportTasks);
  $("menuBtn").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
  $("focusModeBtn").addEventListener("click",()=>$("focusDialog").showModal());
  $("closeFocusBtn").addEventListener("click",()=>$("focusDialog").close());
  $("startTimerBtn").addEventListener("click",startTimer);
  $("resetTimerBtn").addEventListener("click",resetTimer);
  $("themeToggleBtn").addEventListener("click",toggleTheme);

  document.addEventListener("keydown",event=>{
    if ((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k") {event.preventDefault();$("searchInput").focus();}
    if (event.key==="Escape") {
      $("sidebar").classList.remove("open");
    }
  });

  $("yearNow").textContent = new Date().getFullYear();

  // Initialization
  initTheme();
  render();
  syncWithServer();
})();