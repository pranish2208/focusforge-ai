const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const url = require("node:url");

// Read environment file if present (.env)
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, "utf8");
    envContent.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (key && process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    });
  } catch (err) {
    console.warn("Could not read .env file:", err.message);
  }
}

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = "0.0.0.0";
const PUBLIC_DIR = __dirname;
const DATA_FILE = path.join(__dirname, "tasks-db.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

// Default starter tasks
const defaultTasks = [
  {
    id: "task-seed-1",
    title: "Plan the most important work",
    notes: "Choose one outcome to move forward today.",
    priority: "high",
    due: new Date().toISOString().slice(0, 10),
    completed: false,
    created: Date.now()
  },
  {
    id: "task-seed-2",
    title: "Break a big task into small steps",
    notes: "Make the next action clear and achievable.",
    priority: "medium",
    due: new Date().toISOString().slice(0, 10),
    completed: false,
    created: Date.now() - 1000
  },
  {
    id: "task-seed-3",
    title: "Review progress at the end of the day",
    notes: "Celebrate progress and prepare for tomorrow.",
    priority: "low",
    due: "",
    completed: false,
    created: Date.now() - 2000
  }
];

// Helper: load stored tasks
function getStoredTasks() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, "utf8");
      return JSON.parse(content);
    }
  } catch (e) {
    console.error("Error reading tasks database:", e.message);
  }
  return defaultTasks;
}

// Helper: save tasks
function persistTasks(tasks) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("Error persisting tasks:", e.message);
    return false;
  }
}

// Parse request body helper
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        resolve(body);
      }
    });
    req.on("error", reject);
  });
}

// Intelligent AI Task Suggestions Generator
function generateAiSuggestions(tasks) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const active = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);
  const high = active.filter((t) => t.priority === "high");
  const overdue = active.filter((t) => t.due && t.due < todayStr);
  const dueToday = active.filter((t) => t.due === todayStr);

  const suggestions = [];

  if (overdue.length > 0) {
    suggestions.push({
      icon: "!",
      color: "pink",
      title: "Overdue items need triage",
      text: `${overdue.length} active task${overdue.length === 1 ? " is" : "s are"} past due. Consider completing "${overdue[0].title}" or rescheduling it.`,
      action: "focus_overdue"
    });
  }

  if (high.length > 0) {
    suggestions.push({
      icon: "✦",
      color: "blue",
      title: "High Impact Priority",
      text: `"${high[0].title}" is your top-rated priority. Allocate a dedicated 25-minute focus sprint to tackle it first.`,
      action: "start_focus"
    });
  }

  if (dueToday.length > 0) {
    suggestions.push({
      icon: "◷",
      color: "amber",
      title: "Due by end of day",
      text: `You have ${dueToday.length} task${dueToday.length === 1 ? "" : "s"} scheduled for today. Protect a calendar block this afternoon.`,
      action: "view_today"
    });
  }

  if (active.length === 0) {
    suggestions.push({
      icon: "✓",
      color: "green",
      title: "All caught up!",
      text: "You have zero pending tasks. Great job on clearing your desk! Take a well-earned break or set your next milestone.",
      action: "add_task"
    });
  } else if (suggestions.length < 3) {
    suggestions.push({
      icon: "↗",
      color: "green",
      title: completed.length > 0 ? "Momentum in motion" : "Build flow state",
      text: completed.length > 0
        ? `You've already finished ${completed.length} task${completed.length === 1 ? "" : "s"}. Consistency compounds into breakthroughs.`
        : "Pick a single micro-task to start. Small actions break inertia faster than grand plans.",
      action: "continue"
    });
  }

  return suggestions.slice(0, 3);
}

// Micro-step breakdown helper
function breakDownTask(title) {
  return [
    `Clarify the core definition of done for "${title}"`,
    "Gather any notes, links, or required resources in one place",
    "Complete the first 10-minute rough draft or baseline action",
    "Refine, verify details, and check off completed criteria"
  ];
}

// Request handler
const server = http.createServer(async (req, res) => {
  const startTime = Date.now();
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;

  // CORS Headers for flexible dev environments
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- REST API ENDPOINTS ---
  if (pathname.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    // GET /api/health
    if (pathname === "/api/health" && req.method === "GET") {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          status: "healthy",
          name: "FocusForge AI Server",
          version: "1.0.0",
          nodeVersion: process.version,
          uptimeSeconds: Math.round(process.uptime()),
          timestamp: new Date().toISOString()
        })
      );
      return;
    }

    // GET /api/tasks
    if (pathname === "/api/tasks" && req.method === "GET") {
      const tasks = getStoredTasks();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, count: tasks.length, tasks }));
      return;
    }

    // POST /api/tasks (save whole list or sync)
    if (pathname === "/api/tasks" && req.method === "POST") {
      try {
        const body = await parseBody(req);
        const tasksToSave = Array.isArray(body) ? body : body.tasks;
        if (!Array.isArray(tasksToSave)) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: "Expected an array of tasks" }));
          return;
        }
        persistTasks(tasksToSave);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, count: tasksToSave.length }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // POST /api/ai/suggestions
    if (pathname === "/api/ai/suggestions" && req.method === "POST") {
      try {
        const body = await parseBody(req);
        const tasks = Array.isArray(body) ? body : (body.tasks || getStoredTasks());
        const suggestions = generateAiSuggestions(tasks);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, suggestions }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // POST /api/ai/breakdown
    if (pathname === "/api/ai/breakdown" && req.method === "POST") {
      try {
        const body = await parseBody(req);
        const taskTitle = body.title || "Selected Task";
        const steps = breakDownTask(taskTitle);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, task: taskTitle, steps }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // 404 for unknown API
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Endpoint not found" }));
    return;
  }

  // --- STATIC FILE SERVING ---
  let safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[\/\\])+/, "");
  if (safePath === "/" || safePath === "\\") {
    safePath = "index.html";
  }

  // Handle favicon.ico fallback to favicon.svg
  if (safePath === "favicon.ico" || safePath === "/favicon.ico") {
    safePath = "favicon.svg";
  }

  let filePath = path.join(PUBLIC_DIR, safePath);

  // Security: prevent path traversal outside PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA style routing
      filePath = path.join(PUBLIC_DIR, "index.html");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Server Error loading file");
        return;
      }

      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, must-revalidate"
      });
      res.end(data);

      const elapsed = Date.now() - startTime;
      console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${pathname} -> 200 (${elapsed}ms)`);
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`\n======================================================`);
  console.log(` FocusForge AI — Web Server Active`);
  console.log(` Local URL:   http://localhost:${PORT}`);
  console.log(` Network URL: http://${HOST}:${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`======================================================\n`);
});

// Process signal handling
process.on("SIGINT", () => {
  console.log("\nFocusForge AI server shutting down gracefully...");
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  console.log("\nFocusForge AI server terminating...");
  server.close(() => process.exit(0));
});
