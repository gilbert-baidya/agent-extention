/**
 * Content Script — DOM Scanner + DOM Action Agent
 */

import type { MCQQuestion, MCQOption, ExtensionMessage } from '../types'

// ─── Utilities ────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).substring(2, 10)
}

// Keywords that suggest a link/button is a reference page (not nav / footer)
const REFERENCE_KEYWORDS = /\b(exam|page|link|view|open|reference|site|web|here|test|demo|sample|example|visit)\b/i

/**
 * Try to extract a navigable URL from any element type:
 *  - <a href>          → direct href
 *  - data-href / data-url / data-link attributes
 *  - onclick="window.open('url')" or onclick="location.href='url'"
 */
function extractUrlFromElement(el: Element): string | undefined {
  // A URL is invalid if it's empty, a same-page anchor, a chrome-extension URL,
  // or resolves back to exactly the current page (e.g. href="#" becomes page.html#)
  const currentBase = location.href.split('#')[0]
  const invalid = (u: string) =>
    !u ||
    u.startsWith('javascript') ||
    u.startsWith('#') ||
    u.includes('chrome-extension://') ||
    u === location.href ||
    u === currentBase ||
    u === currentBase + '#'

  // 1. Standard anchor — check RAW attribute first to catch href="#"
  if (el.tagName === 'A') {
    const rawHref = el.getAttribute('href') ?? ''
    // Skip pure anchor links and empty hrefs immediately
    if (!rawHref || rawHref === '#' || rawHref.startsWith('javascript')) return undefined
    const href = (el as HTMLAnchorElement).href   // resolved absolute URL
    if (!invalid(href)) return href
  }

  // 2. Data attributes
  for (const attr of ['data-href', 'data-url', 'data-link', 'data-src']) {
    const val = el.getAttribute(attr)
    if (val && !invalid(val)) return val
  }

  // 3. Parse onclick for URL strings
  const onclick = el.getAttribute('onclick') ?? ''
  if (onclick) {
    const patterns = [
      /window\.open\(\s*['"]([^'"]+)['"]/i,
      /location\.href\s*=\s*['"]([^'"]+)['"]/i,
      /navigate\(\s*['"]([^'"]+)['"]/i,
      /['"]((https?:\/\/|\/(?!\/))[^'"]{4,})['"]/,
    ]
    for (const re of patterns) {
      const m = onclick.match(re)
      if (m?.[1] && !invalid(m[1])) {
        // Resolve relative URLs
        try { return new URL(m[1], location.href).href } catch { return m[1] }
      }
    }
  }

  return undefined
}

/**
 * Find a reference URL starting from `startEl`, walking UP the DOM tree.
 * Handles <a href>, <button onclick>, data-href, etc.
 * Prioritises elements whose visible text matches reference keywords.
 */
function findReferenceUrl(startEl: Element): string | undefined {
  const searchIn = (root: Element): string | undefined => {
    // Collect all potentially-clickable elements (anchors + buttons + anything with onclick/data-href)
    const candidates = Array.from(
      root.querySelectorAll('a[href], button, [onclick], [data-href], [data-url], [data-link]'),
    )

    // Priority 1: element whose TEXT matches reference keywords
    for (const el of candidates) {
      const text = el.textContent?.trim() ?? ''
      if (REFERENCE_KEYWORDS.test(text)) {
        const url = extractUrlFromElement(el)
        if (url) return url
      }
    }

    // Priority 2: any element with a valid URL (first one wins)
    for (const el of candidates) {
      const url = extractUrlFromElement(el)
      if (url) return url
    }

    return undefined
  }

  // Walk up 8 ancestor levels
  let el: Element | null = startEl
  for (let i = 0; i < 8 && el; i++) {
    const found = searchIn(el)
    if (found) return found
    el = el.parentElement
  }

  // Last resort: search entire page specifically for window.open buttons
  // (strict match — only elements with "exam" AND ("web" OR "page") in text)
  const allClickable = Array.from(
    document.querySelectorAll('button[onclick], a[onclick], [onclick]'),
  )
  for (const el of allClickable) {
    const text = el.textContent?.trim() ?? ''
    const onclick = el.getAttribute('onclick') ?? ''
    // Must have "exam" in text AND have a window.open call
    if (/exam/i.test(text) && /window\.open/i.test(onclick)) {
      const url = extractUrlFromElement(el)
      if (url) return url
    }
  }

  return undefined
}

/**
 * Find the nearest ancestor that looks like a "question card".
 * Tries several heuristics in order of specificity.
 */
function findQuestionContainer(el: Element): Element | null {
  const selectors = [
    '[class*="question"]',
    '[class*="quiz-item"]',
    '[class*="quiz_item"]',
    '[class*="formblock"]',
    '[class*="form-block"]',
    '[data-question]',
    'fieldset',
  ]
  for (const sel of selectors) {
    const match = el.closest(sel)
    if (match) return match
  }
  // Fallback — go 3 levels up
  let parent = el.parentElement
  for (let i = 0; i < 3 && parent; i++) {
    if (parent.querySelectorAll('input[type="radio"]').length >= 2) return parent
    parent = parent.parentElement
  }
  return el.parentElement?.parentElement ?? null
}

/**
 * Extract the full question text from a container.
 * Collects ALL text nodes above the options list to give the AI full context
 * (question stem + any test IDs, conditions, notes).
 */
function extractQuestionText(container: Element): string {
  // Collect text from the whole container but exclude the option labels/inputs
  // by cloning and removing option-related elements
  const clone = container.cloneNode(true) as Element

  // Remove radio inputs and their labels from clone so option text doesn't bleed in
  clone.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach((n) => n.remove())

  const raw = clone.textContent ?? ''
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 2)

  // Deduplicate consecutive identical lines
  const deduped = lines.filter((l, i) => l !== lines[i - 1])

  // Cap at 800 chars to avoid huge prompts
  const joined = deduped.join(' ')
  return joined.length > 800 ? joined.substring(0, 800) + '…' : joined
}

// ─── Question Map ─────────────────────────────────────────────────────────────

const questionMap = new Map<string, MCQQuestion>()

// ─── Strategy 1: Standard HTML radio button groups ───────────────────────────

function scanRadioGroups(): MCQQuestion[] {
  const groups = new Map<string, HTMLInputElement[]>()

  document.querySelectorAll('input[type="radio"]').forEach((input) => {
    const el = input as HTMLInputElement
    const groupKey =
      el.name ||
      el.closest('[class*="question"]')?.getAttribute('id') ||
      uid()
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey)!.push(el)
  })

  const questions: MCQQuestion[] = []

  groups.forEach((inputs) => {
    if (inputs.length < 2) return

    const container = findQuestionContainer(inputs[0])
    if (!container) return

    const questionText = extractQuestionText(container)

    const options: MCQOption[] = inputs.map((input, i) => {
      if (!input.id) input.id = `qa-input-${uid()}`

      const labelEl =
        document.querySelector(`label[for="${input.id}"]`) ??
        (input.parentElement?.tagName === 'LABEL' ? input.parentElement : null) ??
        input.parentElement

      const rawText = labelEl?.textContent?.trim() ?? input.value ?? `Option ${i + 1}`
      // Strip the input's own value from the label text to avoid duplication
      const text = rawText.replace(input.value, '').trim() || rawText

      return {
        label: String.fromCharCode(65 + i), // A, B, C …
        text,
        element: `#${CSS.escape(input.id)}`,
      }
    })

    // Search for reference URL starting from the container (walks up DOM)
    const referenceUrl = findReferenceUrl(container)

    // Debug: log to page console so we can inspect in DevTools
    console.log(`[QA Agent] Q${questionMap.size + 1} referenceUrl:`, referenceUrl ?? '(none detected)')

    const q: MCQQuestion = {
      id: uid(),
      index: questionMap.size,
      text: questionText,
      options,
      referenceUrl,
      status: 'pending',
    }

    container.setAttribute('data-qa-question-id', q.id)
    questionMap.set(q.id, q)
    questions.push(q)
  })

  return questions
}

// ─── Strategy 2: Custom div/span-based quiz widgets ──────────────────────────

function scanCustomWidgets(): MCQQuestion[] {
  const questions: MCQQuestion[] = []

  const containers = document.querySelectorAll(
    '[class*="question"], [class*="quiz-item"], [class*="quiz_item"], [data-question-id], [data-question]',
  )

  containers.forEach((container) => {
    if (container.hasAttribute('data-qa-question-id')) return

    const textEl = container.querySelector(
      '[class*="question-text"], [class*="stem"], [class*="prompt"], p, h3, h4',
    )
    if (!textEl) return

    const optionEls = Array.from(
      container.querySelectorAll(
        '[class*="option"], [class*="choice"], [class*="answer-item"], [class*="answer_item"], li',
      ),
    )
    if (optionEls.length < 2) return

    const options: MCQOption[] = optionEls.map((el, i) => {
      const optId = `qa-opt-${uid()}`
      ;(el as HTMLElement).setAttribute('data-qa-opt-id', optId)
      return {
        label: String.fromCharCode(65 + i),
        text: el.textContent?.trim() ?? `Option ${i + 1}`,
        element: `[data-qa-opt-id="${optId}"]`,
      }
    })

    const q: MCQQuestion = {
      id: uid(),
      index: questionMap.size,
      text: textEl.textContent?.trim() ?? 'Unknown question',
      options,
      referenceUrl: findReferenceUrl(container),
      status: 'pending',
    }

    container.setAttribute('data-qa-question-id', q.id)
    questionMap.set(q.id, q)
    questions.push(q)
  })

  return questions
}

// ─── Main Scan ────────────────────────────────────────────────────────────────

function scanPage(): MCQQuestion[] {
  questionMap.clear()
  const all = [...scanRadioGroups(), ...scanCustomWidgets()]
  updateOverlay(`Scanned ${all.length} questions`, 'info')
  return all
}

// ─── Click Answer ─────────────────────────────────────────────────────────────

function clickAnswer(questionId: string, answerLabel: string): boolean {
  const question = questionMap.get(questionId)
  if (!question) return false

  const option = question.options.find(
    (o) => o.label.toUpperCase() === answerLabel.toUpperCase(),
  )
  if (!option) return false

  const el = document.querySelector(option.element) as HTMLElement | null
  if (!el) return false

  el.click()
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true }))
  el.dispatchEvent(new Event('change',         { bubbles: true }))

  // Visual feedback
  const container = document.querySelector(
    `[data-qa-question-id="${questionId}"]`,
  ) as HTMLElement | null
  if (container) {
    container.style.outline      = '2px solid #4f46e5'
    container.style.borderRadius = '4px'
  }

  return true
}

// ─── Status Overlay ───────────────────────────────────────────────────────────

function getOrCreateOverlay(): HTMLElement {
  let overlay = document.getElementById('qa-agent-overlay')
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = 'qa-agent-overlay'
    overlay.style.cssText = [
      'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
      'background:#1e1b4b', 'color:#e0e7ff', 'padding:10px 16px',
      'border-radius:8px', 'font-family:monospace', 'font-size:12px',
      'box-shadow:0 4px 24px rgba(0,0,0,.5)', 'border:1px solid #4f46e5',
      'max-width:300px', 'line-height:1.5',
    ].join(';')
    document.body.appendChild(overlay)
  }
  return overlay
}

function updateOverlay(text: string, type: 'info' | 'success' | 'error' = 'info'): void {
  const overlay = getOrCreateOverlay()
  const colors: Record<string, string> = {
    info: '#e0e7ff', success: '#a7f3d0', error: '#fca5a5',
  }
  overlay.style.color   = colors[type] ?? colors.info
  overlay.innerHTML     = `<strong>QA Agent</strong><br/>${text}`
  overlay.style.display = 'block'
}

// ─── Message Listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === 'SCAN_PAGE') {
      const questions = scanPage()
      chrome.runtime.sendMessage({
        type: 'SCAN_RESULT',
        payload: { questions, total: questions.length },
      })
      sendResponse({ ok: true, count: questions.length })
      return true
    }

    if (message.type === 'CLICK_ANSWER') {
      const { questionId, answer, questionIndex, total } = message.payload
      const success = clickAnswer(questionId, answer)
      if (success) {
        updateOverlay(`Answered Q${questionIndex + 1}/${total} → ${answer}`, 'success')
      }
      sendResponse({ ok: success })
      return true
    }

    if (message.type === 'QUEUE_COMPLETE') {
      const { answered, failed, total } = message.payload
      updateOverlay(`Done! ${answered}/${total} answered, ${failed} failed.`, 'success')
      sendResponse({ ok: true })
      return true
    }

    return false
  },
)
