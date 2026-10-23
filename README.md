# FocusForge AI

**Plan · Prioritize · Progress**

FocusForge AI is a responsive productivity dashboard prototype that helps users organize tasks, set priorities, track completion, review upcoming due dates, and run a simple focus timer.

> **Current implementation note:** This version is a front-end prototype. Task data is stored in the current browser using `localStorage`. “Focus suggestions” are generated with local rules based on priorities and due dates. No external AI model, Amazon service, Alexa+ integration, backend, or account system is connected in this version. Do not describe those integrations as implemented until you add and test them.

## Features

- Responsive dashboard for desktop and mobile
- Create and edit tasks with notes, priority, and due date
- Mark tasks complete or active
- Filter by all, high priority, active, and completed
- Search tasks by title or notes
- Today view, upcoming schedule, and simple analytics
- Local rule-based focus suggestions
- 25-minute focus timer with pause and reset
- Export tasks as a JSON backup
- Browser-local persistence using `localStorage`
- No build step or external runtime dependencies

## Run locally

### Option 1: Node.js server (Recommended)
From the `focusforge-ai` directory, run:

```bash
npm start
# or: node server.js
```

Then open <http://localhost:3000> in your browser.

### Option 2: Python server
```bash
python -m http.server 3000
```

### Option 3: Direct browser file
Open `index.html` directly in any modern browser.

## Project structure

```text
focusforge-ai/
├── index.html         # Main dashboard interface
├── styles.css         # Modern design system & dark mode
├── app.js             # Client logic & Web Audio synthesizer
├── server.js          # Node.js backend server with REST API
├── package.json       # Project manifest & npm scripts
├── favicon.svg        # Brand icon asset
├── .env.example       # Environment configuration template
├── README.md          # Project documentation
├── LICENSE            # MIT license
└── .gitignore         # Ignored files
```

## How to use

1. Open the dashboard.
2. Click **Add task** and enter a title, priority, and optional due date.
3. Use the task filters or search box to find work.
4. Mark tasks complete as you finish them.
5. Use **Start a focus session** to open the 25-minute timer.
6. Use the download icon in the sidebar to export a JSON backup.

## Data and privacy

Tasks are saved in the browser that is being used. They are not synced across devices and are not sent to a server. Clearing site data may remove saved tasks, so use the export option for backups.

## Limitations and next steps

- Add a real backend and secure user authentication if cross-device sync is needed.
- Integrate and document a real AI service before claiming AI-generated recommendations.
- Add automated tests, accessibility testing, and browser compatibility checks.
- For an Amazon-focused hackathon track, implement the required eligible Amazon device/service experience and document it clearly. A generic web dashboard alone may not satisfy a device-specific track.
- Capture real screenshots and record a genuine demo of the working application before submitting.

## License

Released under the MIT License. See `LICENSE`.
