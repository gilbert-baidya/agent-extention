# Multi-Agent QA Chrome Extension — Architecture & Design Plan

> **Status:** Design Phase  
> **Author:** Rev. Gilbert  
> **Date:** April 18, 2026

---

## 1. Vision & Concept

A Chrome extension powered by a **multi-agent AI system** that:
1. Reads a requirements document (plain text, PDF, URL, JIRA/GitHub issue, etc.)
2. Automatically generates a full test plan from those requirements
3. Executes tests directly inside the browser — clicking, typing, navigating, reading the DOM
4. Validates results against the requirements
5. Produces a structured test report with pass/fail status and bug details

Think of it as hiring a full QA team that lives in your browser — a **Requirements Analyst**, a **Test Planner**, a **Test Executor**, a **Validator**, and a **Reporter** — all collaborating automatically.

---

## 2. Is It Possible?

**Yes — fully.** Here is why each core capability is achievable:

| Capability | How It's Done |
|---|---|
| Read requirements | File input, URL fetch, text paste, or MCP connector (JIRA, GitHub, Notion) |
| Understand requirements | Claude API (Orchestrator + Parser agents) |
| Interact with the browser | Chrome Content Scripts + `chrome.debugger` API / Chrome DevTools Protocol |
| Take screenshots | `chrome.tabs.captureVisibleTab` |
| Fill forms, click buttons | Content Script injected into active page |
| Coordinate multiple agents | Service Worker as message bus + structured tool calls |
| Generate reports | Reporter Agent → HTML/PDF export |

---

## 3. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CHROME EXTENSION                            │
│                                                                 │
│  ┌──────────────┐    ┌──────────────────────────────────────┐  │
│  │  Side Panel  │    │      Background Service Worker        │  │
│  │  (React UI)  │◄──►│         ORCHESTRATOR AGENT           │  │
│  │              │    │    (master coordinator + state)       │  │
│  └──────────────┘    └──────────┬───────────────────────────┘  │
│                                 │                               │
│              ┌──────────────────┼──────────────────┐           │
│              ▼                  ▼                  ▼           │
│   ┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│   │ REQUIREMENTS     │ │ TEST PLANNER │ │   VALIDATOR      │  │
│   │ PARSER AGENT     │ │    AGENT     │ │    AGENT         │  │
│   └──────────────────┘ └──────────────┘ └──────────────────┘  │
│              │                  │                  │           │
│              └──────────────────┼──────────────────┘           │
│                                 ▼                               │
│                    ┌────────────────────────┐                  │
│                    │  BROWSER ACTION AGENT  │                  │
│                    │   (Content Script)     │                  │
│                    │  click · type · scroll │                  │
│                    │  screenshot · read DOM │                  │
│                    └────────────────────────┘                  │
│                                 │                               │
│                                 ▼                               │
│                    ┌────────────────────────┐                  │
│                    │   REPORTER AGENT       │                  │
│                    │  HTML/PDF test report  │                  │
│                    └────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. The Five Agents — Roles & Responsibilities

### Agent 1 — Requirements Parser
**Purpose:** Reads raw requirements and extracts structured, testable acceptance criteria.

**Inputs:**
- Pasted text
- Uploaded PDF/DOCX
- A URL (fetches and parses the page)
- JIRA ticket ID / GitHub issue URL

**Outputs:** JSON array of `Requirement` objects:
```json
{
  "id": "REQ-001",
  "title": "User can log in with valid credentials",
  "priority": "high",
  "acceptance_criteria": [
    "Given valid email and password, user reaches dashboard",
    "Given invalid password, error message appears",
    "Session persists on page refresh"
  ],
  "category": "authentication"
}
```

**AI Role:** Uses Claude with structured output to parse and normalize requirements from any format.

---

### Agent 2 — Test Planner
**Purpose:** Converts `Requirement` objects into executable `TestCase` objects.

**Inputs:** Array of `Requirement` objects from Parser Agent.

**Outputs:** Array of `TestCase` objects:
```json
{
  "id": "TC-001",
  "requirement_id": "REQ-001",
  "title": "Login with valid credentials",
  "steps": [
    { "action": "navigate", "target": "https://app.com/login" },
    { "action": "fill", "selector": "#email", "value": "test@example.com" },
    { "action": "fill", "selector": "#password", "value": "ValidPass123" },
    { "action": "click", "selector": "#login-btn" },
    { "action": "assert_url_contains", "value": "/dashboard" }
  ],
  "expected_result": "User redirected to /dashboard",
  "test_type": "functional"
}
```

**AI Role:** Claude generates test steps using its knowledge of common UI patterns + context about the target application (inferred from DOM inspection or user-provided info).

---

### Agent 3 — Browser Action Agent (Content Script)
**Purpose:** The "hands" of the system — executes actions inside the browser tab.

**Capabilities:**
- `navigate(url)` — changes page
- `click(selector)` — clicks elements
- `fill(selector, value)` — types into inputs
- `select(selector, option)` — dropdowns
- `scroll(direction, amount)` — scrolls
- `read_dom(selector)` — reads element text/attributes
- `screenshot()` — captures visible area
- `wait_for(selector, timeout)` — waits for elements to appear
- `assert_exists(selector)` — checks element presence
- `assert_text(selector, expected)` — checks text content
- `assert_url_contains(value)` — validates navigation

**Implementation:** Injected as a Content Script, receives action commands via `chrome.runtime.onMessage`, executes them, and returns results.

**Note:** For advanced interactions (network interception, JS coverage), uses the `chrome.debugger` API to attach Chrome DevTools Protocol.

---

### Agent 4 — Validator Agent
**Purpose:** The "judge" — compares test execution results against expected outcomes and determines pass/fail with confidence reasoning.

**Inputs:**
- The `TestCase` (expected behavior)
- The execution result from Browser Action Agent (actual DOM state, screenshots, URLs)

**Outputs:**
```json
{
  "test_id": "TC-001",
  "status": "PASS" | "FAIL" | "BLOCKED" | "SKIP",
  "confidence": 0.97,
  "actual_result": "User redirected to /dashboard",
  "notes": "",
  "screenshot_url": "data:image/png;base64,..."
}
```

**AI Role:** Claude performs visual + semantic validation — comparing screenshots, DOM text, and URL state against expected criteria, reasoning about partial passes and edge cases.

---

### Agent 5 — Reporter Agent
**Purpose:** Compiles all test results into a human-readable, shareable QA report.

**Outputs:**
- In-extension HTML report (rendered in side panel)
- Downloadable HTML/PDF report
- Optional: Post to JIRA/GitHub as comments

**Report includes:**
- Summary (total PASS/FAIL/BLOCKED)
- Per-requirement breakdown
- Step-by-step execution log with screenshots
- Bug report section for every failed test (title, steps to reproduce, actual vs expected)
- Severity classification (Critical/Major/Minor)

---

## 5. Orchestrator — The Brain

The **Orchestrator** lives in the Background Service Worker and manages the entire workflow.

```
Orchestrator Workflow:
─────────────────────────────────────────────
1. RECEIVE requirements (from UI)
2. CALL Parser Agent → get structured requirements
3. CALL Test Planner Agent → get test cases
4. FOR EACH test case:
   a. CALL Browser Action Agent → execute steps
   b. CALL Validator Agent → assess result
   c. STORE result
5. CALL Reporter Agent → generate report
6. RETURN report to UI
─────────────────────────────────────────────
```

The Orchestrator maintains a **shared state object** containing:
- Raw requirements
- Parsed `Requirement[]`
- `TestCase[]`
- `TestResult[]`
- Session metadata (URL, timestamp, user, config)

---

## 6. Communication Architecture

All agents communicate via **Chrome Message Passing** through the Service Worker:

```
UI (Side Panel)
    │  chrome.runtime.sendMessage({ type: 'START_RUN', payload })
    ▼
Orchestrator (Service Worker)
    │  Dispatches tasks to agents as async functions
    │  Agents call Claude API directly (with their own system prompt + tools)
    │
    ├── Parser Agent (async function, same worker context)
    ├── Planner Agent (async function, same worker context)
    ├── Validator Agent (async function, same worker context)
    ├── Reporter Agent (async function, same worker context)
    │
    └── Browser Action Agent
            │  chrome.tabs.sendMessage({ type: 'EXECUTE_STEP', step })
            ▼
        Content Script (injected in active tab)
            │  Performs DOM action
            └── Returns result via callback
```

Each agent is modeled as a **Claude API call** with:
- Its own **system prompt** (role definition)
- **Tool definitions** (what actions it can take)
- **Structured output** (JSON schema enforced via Claude's response format)

---

## 7. Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Extension Framework | Chrome Manifest V3 | Modern, secure, required for Chrome Web Store |
| UI | React + Tailwind CSS | Fast to build, component-based |
| Background | Service Worker (JS) | Long-lived, manages all agents |
| Browser Automation | Content Scripts + `chrome.debugger` | Full DOM + DevTools access |
| AI Agents | Anthropic Claude API (claude-sonnet-4-6) | Best-in-class reasoning + tool use |
| State Management | In-memory (Service Worker) + `chrome.storage.session` | Fast, session-scoped |
| Report Export | `jsPDF` / HTML Blob | PDF/HTML download |
| Build System | Vite + CRXJS | Modern bundler with HMR for extensions |

---

## 8. File & Folder Structure

```
qa-agent-extension/
├── manifest.json                  # Chrome extension config (MV3)
├── vite.config.ts                 # Build config (CRXJS plugin)
├── package.json
│
├── src/
│   ├── background/
│   │   ├── orchestrator.ts        # Main workflow coordinator
│   │   ├── agents/
│   │   │   ├── parser.ts          # Requirements Parser Agent
│   │   │   ├── planner.ts         # Test Planner Agent
│   │   │   ├── validator.ts       # Validator Agent
│   │   │   └── reporter.ts        # Reporter Agent
│   │   ├── claude.ts              # Claude API client + helpers
│   │   └── state.ts               # Shared session state
│   │
│   ├── content/
│   │   ├── browser-agent.ts       # Browser Action Agent (content script)
│   │   └── actions/
│   │       ├── click.ts
│   │       ├── fill.ts
│   │       ├── navigate.ts
│   │       ├── assert.ts
│   │       └── screenshot.ts
│   │
│   ├── sidepanel/
│   │   ├── index.html
│   │   ├── App.tsx                # Main UI
│   │   ├── components/
│   │   │   ├── RequirementsInput.tsx
│   │   │   ├── TestRunProgress.tsx
│   │   │   ├── TestReport.tsx
│   │   │   └── AgentStatusPanel.tsx
│   │   └── hooks/
│   │       └── useOrchestrator.ts
│   │
│   └── types/
│       ├── requirement.ts
│       ├── testcase.ts
│       ├── testresult.ts
│       └── messages.ts
│
└── public/
    └── icons/
```

---

## 9. Key Design Decisions

### Decision 1 — One Claude API key, multiple agents via system prompts
Each agent is not a separate service — it's a **Claude API call with a specialized system prompt and tool set**. This keeps the architecture simple while achieving true specialization.

### Decision 2 — Content Script as the action layer
The Browser Action Agent runs as a content script injected into the target tab. It's the only agent that touches the DOM directly. All other agents operate in the Service Worker and communicate with it via message passing.

### Decision 3 — Stateless agents, stateful orchestrator
Each agent call is stateless (it gets all context it needs in its prompt). The Orchestrator owns all state. This makes agents easy to retry, parallelize, and debug.

### Decision 4 — Parallel test execution where possible
Independent test cases (not in the same navigation flow) can be executed in parallel across multiple tabs using `chrome.tabs.create`.

### Decision 5 — Human-in-the-loop checkpoints
Before executing any test that writes data (form submissions, purchases, etc.), the Orchestrator pauses and asks the user for confirmation. This prevents unwanted side effects on production systems.

---

## 10. Development Roadmap

### Phase 1 — Foundation (Week 1-2)
- [ ] Project setup: Vite + CRXJS + React + TypeScript
- [ ] `manifest.json` with Side Panel, Service Worker, Content Script permissions
- [ ] Claude API client (`claude.ts`) with streaming support
- [ ] Basic Side Panel UI skeleton
- [ ] Chrome message passing infrastructure

### Phase 2 — Core Agents (Week 3-4)
- [ ] Requirements Parser Agent (text/URL input)
- [ ] Test Planner Agent (generate test cases from requirements)
- [ ] Basic Browser Action Agent (navigate, click, fill, assert)
- [ ] Orchestrator wiring Phase 1-2 agents together

### Phase 3 — Execution & Validation (Week 5-6)
- [ ] Full Browser Action Agent (scroll, wait, screenshot, read DOM)
- [ ] Validator Agent (pass/fail determination with reasoning)
- [ ] Progress UI (live agent status, step-by-step execution log)
- [ ] Error recovery (retry failed steps, graceful degradation)

### Phase 4 — Reporting & Polish (Week 7-8)
- [ ] Reporter Agent (structured HTML report)
- [ ] PDF export
- [ ] Screenshot gallery in report
- [ ] Human-in-the-loop confirmation for write operations
- [ ] Settings page (API key, timeout config, base URL)

### Phase 5 — Advanced Features (Future)
- [ ] JIRA/GitHub integration (pull issues as requirements, post results as comments)
- [ ] Visual regression testing (compare screenshots with baseline)
- [ ] Network request interception (validate API calls)
- [ ] Parallel test execution across tabs
- [ ] Test case library (save and re-run past test suites)
- [ ] CI/CD integration (trigger runs via webhook)

---

## 11. Security Considerations

- **API Key storage:** Stored in `chrome.storage.local` (encrypted by Chrome), never in code
- **Content Security Policy:** Strict CSP in manifest, no inline scripts
- **Permissions:** Request only necessary permissions (`tabs`, `activeTab`, `storage`, `sidePanel`, `debugger`)
- **Data privacy:** Requirements and test results stay local; only agent prompts go to Claude API
- **Production safeguards:** Human confirmation before any write/destructive action

---

## 12. Next Steps

Once you confirm this architecture, we will:

1. **Scaffold the project** — set up Vite + CRXJS + React + TypeScript
2. **Build the Claude client** — the foundation all agents use
3. **Build Agent 1** (Parser) and wire it to the UI
4. **Iterate agent by agent** until the full pipeline works end to end

This gives us a working prototype after Phase 2 (≈ 2 weeks of focused development).
