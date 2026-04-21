# QA Agent — Setup Guide

## 1. Install dependencies (one-time)

```bash
cd qa-agent-extension
npm install
```

## 2. Build the extension

```bash
npm run build
```
This produces a `dist/` folder — that's your extension.

> For live rebuilding while developing:
> ```bash
> npm run dev
> ```

## 3. Load into Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle — top right)
3. Click **Load unpacked**
4. Select the `dist/` folder inside `qa-agent-extension/`

## 4. Get a Claude API Key

1. Go to https://console.anthropic.com
2. Create an API key (starts with `sk-ant-…`)

## 5. Use it

1. Navigate to any page with MCQ questions
2. Click the **QA Agent** extension icon in your toolbar → side panel opens
3. Paste your API key in Settings
4. Click **Scan Page** — the agent detects all questions
5. Click **Start** — the agent begins answering
6. Watch the progress bar and live question list

---

## Project Structure

```
src/
  background/index.ts       ← Orchestrator (Service Worker)
  content/index.ts          ← DOM Scanner + Click Agent
  agents/
    claudeClient.ts         ← Claude API wrapper
    answerAgent.ts          ← MCQ reasoning agent
    researchAgent.ts        ← Reference page summarizer
  sidepanel/
    App.tsx                 ← Main UI
    components/
      Settings.tsx          ← API key + config
      ProgressBar.tsx       ← Live progress
      QuestionList.tsx      ← Per-question status
  types/index.ts            ← Shared TypeScript types
  utils/queue.ts            ← Concurrency queue
```

## Rebuilding after changes

```bash
npm run build
```
Then go to `chrome://extensions` and click the **↺ refresh** button on the QA Agent card.
