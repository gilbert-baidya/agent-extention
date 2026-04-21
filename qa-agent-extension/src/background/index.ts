/**
 * Background Service Worker — Orchestrator
 *
 * Central nervous system of the QA Agent extension.
 * Owns all state, drives the question queue, coordinates Claude API calls,
 * opens research tabs, and relays updates to the side panel UI.
 */

import { ClaudeClient }            from '../agents/claudeClient'
import { OpenAIClient }            from '../agents/openaiClient'
import type { AIClient }           from '../agents/aiClient'
import { answerQuestion }           from '../agents/answerAgent'
import { summarizeReferenceContent } from '../agents/researchAgent'
import { AsyncQueue }               from '../utils/queue'
import type { MCQQuestion, AgentConfig, ExtensionMessage } from '../types'

// ─── State ────────────────────────────────────────────────────────────────────

let client: AIClient | null = null
let agentConfig: AgentConfig | null = null
let questions: MCQQuestion[] = []
let queue: AsyncQueue<MCQQuestion> | null = null
let activeTabId: number | null = null

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Broadcast a message to the side panel (ignore errors if panel is closed) */
function notify(type: string, payload?: unknown): void {
  chrome.runtime.sendMessage({ type, payload }).catch(() => { /* panel may be closed */ })
}

/** Mutate a question in the shared array and push the update to the side panel */
function updateQuestion(id: string, patch: Partial<MCQQuestion>): void {
  const q = questions.find((q) => q.id === id)
  if (!q) return
  Object.assign(q, patch)
  notify('QUESTION_UPDATE', { question: { ...q } })
}

/** Current summary stats */
function stats() {
  return {
    total:    questions.length,
    answered: questions.filter((q) => q.status === 'answered').length,
    failed:   questions.filter((q) => q.status === 'failed').length,
    skipped:  questions.filter((q) => q.status === 'skipped').length,
    pending:  questions.filter((q) => q.status === 'pending').length,
  }
}

// ─── Research Agent: open background tab, read text, close tab ───────────────

/**
 * Open the reference page as a VISIBLE tab so the user can see the agent
 * examining it. After reading the fully-rendered page content, switch focus
 * back to the quiz tab and close the reference tab.
 */
async function fetchPageText(url: string, timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Reference page did not load within ${timeoutMs / 1000}s`)),
      timeoutMs,
    )

    // Open as ACTIVE (visible) — user sees the agent navigating to the exam page
    chrome.tabs.create({ url, active: true }, (tab) => {
      if (chrome.runtime.lastError || !tab?.id) {
        clearTimeout(timer)
        return reject(new Error(chrome.runtime.lastError?.message ?? 'Could not open tab'))
      }

      const refTabId = tab.id

      const onUpdated = (updatedId: number, info: chrome.tabs.TabChangeInfo) => {
        if (updatedId !== refTabId || info.status !== 'complete') return
        chrome.tabs.onUpdated.removeListener(onUpdated)
        clearTimeout(timer)

        // Wait for JS-rendered content and auto-play to initialise (5s)
        setTimeout(async () => {
          try {
            // ── Step 1: inject axe-core into the reference tab ───────────
            // axe.min.js lives in dist/ and is listed in web_accessible_resources.
            // We swallow errors so the rest of the extraction still runs if axe fails.
            try {
              await chrome.scripting.executeScript({
                target: { tabId: refTabId },
                files: ['axe.min.js'],
              })
            } catch { /* axe unavailable — extraction continues without it */ }

            // ── Step 2: main extraction (async so we can await axe.run) ──
            const results = await chrome.scripting.executeScript({
              target: { tabId: refTabId },
              func: async () => {
                const title = document.title ?? ''

                // ── Identify the main content area (exclude page chrome) ──
                // On Moodle quiz pages, scope to main content to exclude nav/header/footer.
                // On exam reference pages (the actual test scenarios), scan EVERYTHING.
                const isMoodlePage = !!document.querySelector('#page-wrapper, .moodle-page, #region-main-box, .course-content')
                const mainContentEl: Element | null = isMoodlePage
                  ? document.querySelector('main, [role="main"], #region-main, #page-content, .content-inner, #content')
                  : null  // exam reference pages: use full body
                const mainContent: Element = mainContentEl ?? document.body

                // isPageChrome: ONLY filter on Moodle pages when mainContent fell back to body.
                // On exam reference pages (non-Moodle), NEVER filter — all content is test scenario.
                const isPageChrome = (el: Element): boolean => {
                  if (!isMoodlePage) return false  // exam page — nothing is chrome
                  if (mainContentEl !== null) return false  // main found by selector — don't double-filter
                  let p: Element | null = el
                  while (p) {
                    const tag = p.tagName?.toLowerCase()
                    if (tag === 'header' || tag === 'nav' || tag === 'footer') return true
                    if (p.id && /^(header|navbar|nav|footer|breadcrumb|sidebar|side-bar|mast|topbar)/i.test(p.id)) return true
                    if (p === mainContent) break
                    p = p.parentElement
                  }
                  return false
                }

                // ── Also scan same-origin iframes for content ─────────────
                let iframeContent = ''
                try {
                  const iframes = Array.from(document.querySelectorAll('iframe'))
                  for (const iframe of iframes) {
                    try {
                      const iframeDoc = (iframe as HTMLIFrameElement).contentDocument
                      if (iframeDoc && iframeDoc.body) {
                        const iframeText = iframeDoc.body.innerText?.substring(0, 3000) ?? ''
                        const iframeFocusable = iframeDoc.querySelectorAll(
                          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
                          'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"]'
                        )
                        if (iframeText.length > 10 || iframeFocusable.length > 0) {
                          iframeContent += `IFRAME src="${iframe.src}" title="${iframe.title}": `
                          iframeContent += `${iframeFocusable.length} focusable elements. Text: ${iframeText.substring(0, 500)}\n`
                        }
                      }
                    } catch { /* cross-origin */ }
                  }
                } catch { /* ignore iframe errors */ }

                // Page visible text (from main content area)
                const visible = (mainContent as HTMLElement).innerText?.substring(0, 5000) ??
                                (document.body?.innerText ?? '').substring(0, 5000)

                // ── AUDIO: check for any audio that is ACTUALLY PLAYING ───
                const allAudio = Array.from(document.querySelectorAll('audio, video'))
                const playingAudio = allAudio.filter((el) => {
                  const media = el as HTMLMediaElement
                  // Currently playing OR set to autoplay (will auto-start)
                  return !media.paused || el.hasAttribute('autoplay')
                })
                // Also look for non-standard players within main content
                const playerEls = Array.from(mainContent.querySelectorAll(
                  'object, embed, [class*="player"], [class*="audio"], [class*="sound"], ' +
                  '[id*="player"], [id*="audio"], [class*="jwplayer"], [class*="mediaplayer"]',
                )).filter(el => !isPageChrome(el))

                const mediaLines: string[] = []
                for (const el of [...allAudio, ...playerEls]) {
                  if (isPageChrome(el)) continue
                  const media    = el as HTMLMediaElement
                  const isPlaying = !media.paused
                  const autoplay = el.hasAttribute('autoplay') || el.getAttribute('data-autoplay') === 'true'
                  const controls = el.hasAttribute('controls')
                  const src      = el.getAttribute('src') || el.getAttribute('data') || el.getAttribute('data-src') || ''
                  const cls      = (el as HTMLElement).className || ''
                  const id       = el.id || ''
                  // Search for pause/stop/volume controls near this element
                  let nearbyCtrl = 'none'
                  let p = el.parentElement
                  for (let i = 0; i < 5 && p; i++) {
                    const found = Array.from(p.querySelectorAll(
                      'button, [role="button"], input[type="range"]',
                    )).filter(b => {
                      const lbl = (b.getAttribute('aria-label') || b.textContent || '').toLowerCase()
                      return /pause|stop|volume|mute|play/.test(lbl)
                    }).map(b => b.getAttribute('aria-label') || b.textContent?.trim() || b.className)
                    if (found.length) { nearbyCtrl = found.join(', '); break }
                    p = p.parentElement
                  }
                  mediaLines.push(
                    `MEDIA: <${el.tagName.toLowerCase()}> id="${id}" class="${cls}" ` +
                    `autoplay=${autoplay} currentlyPlaying=${isPlaying} hasControlsAttr=${controls} ` +
                    `src="${src}" NEARBY_CONTROLS=[${nearbyCtrl}]`,
                  )
                }
                const mediaSection = mediaLines.length
                  ? `=== AUDIO/VIDEO ELEMENTS IN MAIN CONTENT (${mediaLines.length} found) ===\n` +
                    `NOTE: currentlyPlaying=true means audio/video is actively playing right now\n` +
                    mediaLines.join('\n')
                  : '=== NO AUDIO/VIDEO ELEMENTS DETECTED IN MAIN CONTENT ==='

                // ── ARIA live regions — MAIN CONTENT ONLY (exclude Moodle chrome) ─
                const liveEls = Array.from(
                  mainContent.querySelectorAll(
                    '[aria-live], [role="alert"], [role="status"], [role="log"], [role="marquee"], [role="timer"]',
                  ),
                ).filter(el => !isPageChrome(el))
                const liveLines = liveEls.map((el) => {
                  const live = el.getAttribute('aria-live') || ''
                  const role = el.getAttribute('role') || ''
                  const text = el.textContent?.trim().substring(0, 150) || ''
                  return `LIVE_REGION (in main content): ${el.tagName} aria-live="${live}" role="${role}" text="${text}"`
                })
                const liveSection = liveLines.length
                  ? `=== ARIA LIVE REGIONS IN MAIN CONTENT (${liveLines.length} found) ===\n` +
                    `NOTE: These are inside the test scenario, not Moodle page chrome\n` +
                    liveLines.join('\n')
                  : '=== NO ARIA LIVE REGIONS IN MAIN CONTENT ==='

                // ── Auto-updating / moving content — MAIN CONTENT ONLY ────
                const autoEls = Array.from(
                  mainContent.querySelectorAll(
                    'marquee, blink, [class*="ticker"], [class*="carousel"], [class*="rotator"], ' +
                    '[class*="auto-updat"], [class*="countdown"], [class*="live-update"], ' +
                    '[class*="news-feed"], [data-interval], [data-cycle], [data-rotate]',
                  ),
                ).filter(el => !isPageChrome(el))
                const autoLines = autoEls.map((el) => {
                  const cls  = (el as HTMLElement).className || el.tagName.toLowerCase()
                  const id   = el.id || ''
                  const text = el.textContent?.trim().substring(0, 150) || ''
                  const allBtns = Array.from(document.querySelectorAll('button, [role="button"]'))
                    .filter(b => {
                      const lbl = (b.getAttribute('aria-label') || b.textContent || '').toLowerCase()
                      return /pause|stop|hide|freeze/.test(lbl)
                    }).map(b => b.getAttribute('aria-label') || b.textContent?.trim())
                  return (
                    `AUTO_CONTENT: <${el.tagName.toLowerCase()}> id="${id}" class="${cls}" text="${text}"` +
                    (allBtns.length ? ` CONTROLS=[${allBtns.join(', ')}]` : ' CONTROLS=none')
                  )
                })
                const autoSection = autoLines.length
                  ? `=== AUTO-UPDATING / MOVING CONTENT IN MAIN CONTENT (${autoLines.length} found) ===\n` +
                    autoLines.join('\n')
                  : '=== NO AUTO-UPDATING / MOVING CONTENT IN MAIN CONTENT ==='

                // ── Interactive controls in main content ──────────────────
                const ctrlEls = Array.from(
                  mainContent.querySelectorAll(
                    'button, [role="button"], input[type="range"], input[type="checkbox"], select',
                  ),
                ).filter(el => !isPageChrome(el))
                const ctrlLines = ctrlEls.map((el) => {
                  const text      = el.textContent?.trim() || (el as HTMLInputElement).value || ''
                  const ariaLabel = el.getAttribute('aria-label') || ''
                  const type      = (el as HTMLInputElement).type || el.tagName.toLowerCase()
                  return `CONTROL: ${type} label="${ariaLabel || text}"`
                }).filter(s => s.length > 15)
                const ctrlSection = ctrlLines.length
                  ? `=== INTERACTIVE CONTROLS IN MAIN CONTENT (${ctrlLines.length} found) ===\n` +
                    ctrlLines.join('\n')
                  : '=== NO INTERACTIVE CONTROLS IN MAIN CONTENT ==='

                // ── Aria-labels + alt texts (main content only) ──────────
                const ariaLabels = Array.from(mainContent.querySelectorAll('[aria-label]'))
                  .filter(el => !isPageChrome(el))
                  .map(el => el.getAttribute('aria-label')).join(' | ')
                const altTexts = Array.from(mainContent.querySelectorAll('img[alt]'))
                  .filter(el => !isPageChrome(el))
                  .map(el => (el as HTMLImageElement).alt).join(' | ')

                // ── Keyboard-focusable elements (for Tests 4.A–4.H) ──────
                const focusableQuery =
                  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
                  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [role="button"], ' +
                  '[role="link"], [role="checkbox"], [role="menuitem"], [role="tab"], [role="option"], ' +
                  '[role="slider"], [role="spinbutton"], [role="textbox"], [role="combobox"]'
                const focusableEls = Array.from(mainContent.querySelectorAll(focusableQuery))
                  .filter(el => {
                    const s = window.getComputedStyle(el as HTMLElement)
                    return s.display !== 'none' && s.visibility !== 'hidden' && (s as any).opacity !== '0'
                  })
                const focusCount = focusableEls.length
                const focusListLines = focusableEls.slice(0, 15).map(el => {
                  const tag      = el.tagName.toLowerCase()
                  const text     = el.textContent?.trim().substring(0, 60) || (el as HTMLInputElement).value || ''
                  const lbl      = el.getAttribute('aria-label') || ''
                  const ti       = el.getAttribute('tabindex') ?? 'default'
                  const role     = el.getAttribute('role') || ''
                  const disabled = (el as HTMLInputElement).disabled
                  return `  FOCUSABLE: <${tag}> tabindex=${ti} role="${role}" disabled=${disabled} label="${lbl || text}"`
                })

                // ── Focus indicator: test first 5 focusable elements, report each ─
                const focusIndicatorLines: string[] = []
                if (focusableEls.length === 0) {
                  focusIndicatorLines.push('FOCUS_INDICATOR: No focusable elements to test')
                } else {
                  const sampleEls = focusableEls.slice(0, 5)
                  for (let fi = 0; fi < sampleEls.length; fi++) {
                    try {
                      const el = sampleEls[fi] as HTMLElement
                      el.focus()
                      const cs = window.getComputedStyle(el)
                      const outlineStyle = cs.outlineStyle
                      const outlineWidth = cs.outlineWidth
                      const outlineColor = cs.outlineColor
                      const boxShadow    = cs.boxShadow
                      const hasOutline   = outlineStyle !== 'none' && outlineWidth !== '0px'
                      const hasShadow    = boxShadow !== 'none' && !!boxShadow
                      const visible      = hasOutline || hasShadow
                      const lbl          = el.getAttribute('aria-label') || el.textContent?.trim().substring(0, 30) || ''
                      focusIndicatorLines.push(
                        `FOCUS_INDICATOR[${fi}] <${el.tagName.toLowerCase()}> label="${lbl}": ` +
                        `outline="${outlineStyle}/${outlineWidth}/${outlineColor}" ` +
                        `box-shadow="${boxShadow}" → VISIBLE=${visible}`,
                      )
                      el.blur()
                    } catch {
                      focusIndicatorLines.push(`FOCUS_INDICATOR[${fi}]: Could not measure (script error)`)
                    }
                  }
                  // Summary verdict for the agent
                  const anyInvisible = focusIndicatorLines.some(l => l.includes('VISIBLE=false'))
                  focusIndicatorLines.push(
                    anyInvisible
                      ? `FOCUS_INDICATOR_SUMMARY: ⚠ AT LEAST ONE element has NO visible focus indicator → 4.D likely FAIL`
                      : `FOCUS_INDICATOR_SUMMARY: All ${sampleEls.length} tested elements have visible focus indicators → 4.D likely PASS`,
                  )
                }
                const focusIndicatorReport = focusIndicatorLines.join('\n')

                // ── Mouse-only elements (no keyboard equivalent — Keyboard-Access failure signal) ─
                const mouseOnlyEls = Array.from(mainContent.querySelectorAll(
                  '[onclick], [onmousedown], [onmouseup], [ondblclick]',
                )).filter(el => {
                  // Exclude elements that are natively keyboard-accessible
                  const tag = el.tagName.toLowerCase()
                  if (['a', 'button', 'input', 'select', 'textarea'].includes(tag)) return false
                  // Exclude if it has a role that implies keyboard access
                  const role = el.getAttribute('role') || ''
                  if (['button', 'link', 'menuitem', 'tab'].includes(role)) return false
                  // Exclude if it has tabindex
                  if (el.hasAttribute('tabindex')) return false
                  return true
                }).map(el => {
                  const tag = el.tagName.toLowerCase()
                  const onclick = el.getAttribute('onclick')?.substring(0, 60) || ''
                  const text = el.textContent?.trim().substring(0, 50) || ''
                  return `MOUSE_ONLY: <${tag}> onclick="${onclick}" text="${text}"`
                })

                // ── Skip navigation links (for Test 4.G bypass-function) ─
                const skipLinks = Array.from(document.querySelectorAll('a[href^="#"], a[href]'))
                  .filter(el => {
                    const text = el.textContent?.trim().toLowerCase() || ''
                    const href = el.getAttribute('href') || ''
                    return /skip|jump|bypass|main content|navigation|go to/i.test(text) ||
                           /^#(main|content|skip|primary|maincontent|main-content)/i.test(href)
                  })
                  .map(el => {
                    const text = el.textContent?.trim() || ''
                    const href = el.getAttribute('href') || ''
                    // Check if visible (might be hidden until focus)
                    const cs = window.getComputedStyle(el as HTMLElement)
                    const visuallyHidden = cs.position === 'absolute' &&
                      (parseInt(cs.left || '0') < -900 || cs.clip !== 'auto')
                    return `SKIP_LINK: "${text}" href="${href}" visuallyHiddenUntilFocus=${visuallyHidden}`
                  })

                // ── Landmark regions (for Test 4.G bypass-function) ──────
                const landmarkEls = Array.from(document.querySelectorAll(
                  'main, [role="main"], nav, [role="navigation"], ' +
                  'header, [role="banner"], footer, [role="contentinfo"], ' +
                  'aside, [role="complementary"], section[aria-label], ' +
                  '[role="region"][aria-label], [role="search"], form[aria-label]',
                ))
                const landmarkLines = landmarkEls.map(el => {
                  const tag  = el.tagName.toLowerCase()
                  const role = el.getAttribute('role') || tag
                  const lbl  = el.getAttribute('aria-label') ||
                               el.getAttribute('aria-labelledby') ||
                               el.id || ''
                  return `LANDMARK: <${tag}> role="${role}" label="${lbl}"`
                })
                const bypassSection = [
                  skipLinks.length > 0
                    ? `=== SKIP NAVIGATION LINKS (${skipLinks.length} found — bypass mechanism for 4.G) ===\n` +
                      skipLinks.join('\n')
                    : '=== NO SKIP NAVIGATION LINKS DETECTED ===',
                  landmarkLines.length > 0
                    ? `=== LANDMARK REGIONS (${landmarkLines.length} found — bypass mechanism for 4.G) ===\n` +
                      landmarkLines.join('\n')
                    : '=== NO LANDMARK REGIONS DETECTED ===',
                ].join('\n\n')

                // ── Keyboard trap indicators ──────────────────────────────
                const trapLines: string[] = []
                // Active dialogs / modal-like structures
                Array.from(document.querySelectorAll(
                  '[role="dialog"], [aria-modal="true"], .modal.show, .modal[style*="display: block"]',
                )).filter(el => window.getComputedStyle(el as HTMLElement).display !== 'none')
                  .forEach(el => trapLines.push(
                    `ACTIVE_MODAL: <${el.tagName}> role="${el.getAttribute('role')}" aria-modal="${el.getAttribute('aria-modal')}" class="${(el as HTMLElement).className}"`,
                  ))
                // Iframes (can trap focus)
                Array.from(mainContent.querySelectorAll('iframe')).forEach(el =>
                  trapLines.push(`IFRAME: src="${el.getAttribute('src')}" title="${el.getAttribute('title')}" — iframes can trap keyboard focus`),
                )
                // Positive tabindex (disrupts natural flow)
                Array.from(mainContent.querySelectorAll('[tabindex]'))
                  .filter(el => parseInt(el.getAttribute('tabindex') || '0', 10) > 0)
                  .forEach(el => trapLines.push(
                    `POSITIVE_TABINDEX: <${el.tagName}> tabindex=${el.getAttribute('tabindex')} — disrupts tab order`,
                  ))

                const keyboardSection = [
                  focusCount > 0
                    ? `=== KEYBOARD-FOCUSABLE ELEMENTS IN MAIN CONTENT (${focusCount} found) ===\n` +
                      focusListLines.join('\n')
                    : '=== NO KEYBOARD-FOCUSABLE ELEMENTS IN MAIN CONTENT ===',
                  focusIndicatorReport,
                  mouseOnlyEls.length > 0
                    ? `=== MOUSE-ONLY ELEMENTS (no keyboard access) — ${mouseOnlyEls.length} found ===\n` +
                      mouseOnlyEls.join('\n')
                    : '=== NO MOUSE-ONLY ELEMENTS DETECTED ===',
                  trapLines.length > 0
                    ? `=== KEYBOARD TRAP INDICATORS ===\n${trapLines.join('\n')}`
                    : '=== NO KEYBOARD TRAP INDICATORS DETECTED ===',
                  bypassSection,
                ].join('\n\n')

                // ── Behavioural summary ───────────────────────────────────
                const audioPlayingCount = Array.from(document.querySelectorAll('audio, video'))
                  .filter(el => !(el as HTMLMediaElement).paused).length

                // Count user-activated functionality (broader than just focusable — includes mouse-only)
                const totalInteractive = focusCount + mouseOnlyEls.length

                const behaviourNote = [
                  audioPlayingCount > 0
                    ? `BEHAVIOUR_AUDIO: ${audioPlayingCount} audio/video element(s) are CURRENTLY PLAYING`
                    : 'BEHAVIOUR_AUDIO: No audio/video currently playing at time of scan',
                  `BEHAVIOUR_KEYBOARD: ${focusCount} keyboard-focusable element(s) found in main content`,
                  `BEHAVIOUR_INTERACTIVE: ${totalInteractive} total interactive element(s) (${focusCount} keyboard-focusable + ${mouseOnlyEls.length} mouse-only)`,
                  mouseOnlyEls.length > 0
                    ? `BEHAVIOUR_KEYBOARD: ${mouseOnlyEls.length} mouse-only element(s) found (not keyboard accessible)`
                    : 'BEHAVIOUR_KEYBOARD: No mouse-only elements detected',
                  `\nKEYBOARD TEST DNA QUICK REFERENCE:`,
                  `  Test 4.A DNA? ${totalInteractive === 0 ? 'YES — no user-activated functionality at all' : 'NO — ' + totalInteractive + ' interactive element(s) exist'}`,
                  `  Test 4.B DNA? ${totalInteractive === 0 ? 'YES — no user-activated functionality' : 'NO — interactive elements exist'}`,
                  `  Test 4.C DNA? ${focusCount === 0 ? 'YES — no components can receive keyboard focus' : 'NO — ' + focusCount + ' focusable component(s) exist'}`,
                  `  Test 4.D DNA? ${focusCount === 0 ? 'YES — no elements can receive keyboard focus' : 'NO — ' + focusCount + ' focusable element(s) exist'}`,
                  `  Test 4.E DNA? ${focusCount === 0 ? 'YES — no keyboard-focusable elements' : 'NO — ' + focusCount + ' focusable element(s) exist'}`,
                  `  Test 4.F DNA? ${focusCount === 0 ? 'YES — no keyboard-focusable elements' : 'NO — ' + focusCount + ' focusable element(s) exist'}`,
                ].join('\n')

                // ── axe-core automated accessibility scan ────────────────
                let axeSection = '=== AXE-CORE: not available (run npm install axe-core) ==='
                if ((window as any).axe) {
                  try {
                    const axeResults = await (window as any).axe.run(mainContent, {
                      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'section508'] },
                      resultTypes: ['violations', 'incomplete'],
                    })

                    // Map each axe rule to the Trusted Tester test it covers
                    const TT_MAP: Record<string, string> = {
                      'audio-caption':           '2.A (1.4.2)',
                      'bypass':                  '4.G (2.4.1)',
                      'focus-trap':              '4.C (2.1.2)',
                      'focusable-content':       '4.A (2.1.1)',
                      'frame-focusable-content': '4.A (2.1.1)',
                      'focus-order-semantics':   '4.F (2.4.3)',
                      'tabindex':                '4.F (2.4.3)',
                      'scrollable-region-focusable': '4.A (2.1.1)',
                      'keyboard':                '4.A (2.1.1)',
                      'focus-visible':           '4.D (2.4.7)',
                      'label':                   '5.C (1.3.1)',
                      'label-content-name-mismatch': '5.C (1.3.1)',
                      'link-name':               '6.A (2.4.4)',
                      'link-in-text-block':      '6.A (2.4.4)',
                      'image-alt':               '7.A (1.1.1)',
                      'image-redundant-alt':     '7.A (1.1.1)',
                      'input-image-alt':         '7.A (1.1.1)',
                      'role-img-alt':            '7.A (1.1.1)',
                      'blink':                   '2.B (2.2.2)',
                      'marquee':                 '2.B (2.2.2)',
                      'aria-live-region-content': '2.D (4.1.2)',
                    }

                    const fmtViolation = (v: any): string => {
                      const tt = TT_MAP[v.id] ? ` → TrustedTester ${TT_MAP[v.id]}` : ''
                      const nodes = (v.nodes as any[]).slice(0, 3)
                        .map((n: any) => `      • ${(n.html as string).substring(0, 120)}`)
                        .join('\n')
                      return (
                        `AXE_VIOLATION [${v.impact?.toUpperCase() ?? 'UNKNOWN'}]${tt}\n` +
                        `  Rule: ${v.id} — ${v.help}\n` +
                        `  WCAG: ${(v.tags as string[]).filter((t: string) => t.startsWith('wcag')).join(', ')}\n` +
                        `  Instances (${v.nodes.length}):\n${nodes}`
                      )
                    }

                    const fmtIncomplete = (v: any): string => {
                      const tt = TT_MAP[v.id] ? ` → TrustedTester ${TT_MAP[v.id]}` : ''
                      return (
                        `AXE_NEEDS_REVIEW [${v.impact?.toUpperCase() ?? '?'}]${tt}\n` +
                        `  Rule: ${v.id} — ${v.help} (${v.nodes.length} instance(s))`
                      )
                    }

                    const violations  = (axeResults.violations  as any[]).map(fmtViolation)
                    const incomplete  = (axeResults.incomplete   as any[]).map(fmtIncomplete)
                    const passCount   = (axeResults.passes       as any[]).length

                    if (violations.length === 0 && incomplete.length === 0) {
                      axeSection = `=== AXE-CORE: NO VIOLATIONS (${passCount} rules passed) ===\n` +
                        `All tested WCAG 2.x / Section 508 rules passed automated checks.`
                    } else {
                      axeSection =
                        `=== AXE-CORE ACCESSIBILITY SCAN ` +
                        `(${violations.length} violations · ${incomplete.length} needs-review · ${passCount} passed) ===\n` +
                        `NOTE: Use violations to confirm FAIL verdicts; use needs-review as supporting evidence.\n\n` +
                        [...violations, ...incomplete.slice(0, 8)].join('\n\n')
                    }
                  } catch (axeErr) {
                    axeSection = `=== AXE-CORE ERROR: ${axeErr} ===`
                  }
                }

                return [
                  `PAGE TITLE: ${title}`,
                  `PAGE_TYPE: ${isMoodlePage ? 'MOODLE (scoped to main content)' : 'EXAM REFERENCE PAGE (full body scanned)'}`,
                  behaviourNote,
                  `=== MAIN CONTENT TEXT ===\n${visible}`,
                  ariaLabels ? `ARIA LABELS IN MAIN CONTENT: ${ariaLabels}` : '',
                  altTexts   ? `ALT TEXTS IN MAIN CONTENT: ${altTexts}`     : '',
                  mediaSection,
                  liveSection,
                  autoSection,
                  ctrlSection,
                  keyboardSection,
                  axeSection,
                  iframeContent ? `=== IFRAME CONTENT ===\n${iframeContent}` : '',
                ].filter(Boolean).join('\n\n')
              },
            } as any)

            const text = (results?.[0]?.result as string) ?? ''

            // Switch focus back to the quiz tab
            if (activeTabId) {
              await chrome.tabs.update(activeTabId, { active: true }).catch(() => {})
            }

            // Close the reference tab
            await chrome.tabs.remove(refTabId).catch(() => {})

            resolve(text)
          } catch (err) {
            await chrome.tabs.remove(refTabId).catch(() => {})
            if (activeTabId) chrome.tabs.update(activeTabId, { active: true }).catch(() => {})
            reject(new Error(`Could not read exam page: ${err}`))
          }
        }, 5_000) // 5 s — allows audio to auto-start and dynamic content to initialise
      }

      chrome.tabs.onUpdated.addListener(onUpdated)
    })
  })
}

// ─── Process a Single Question ────────────────────────────────────────────────

async function processQuestion(question: MCQQuestion): Promise<void> {
  if (!client || !agentConfig) return

  try {
    let referenceContext: string | undefined

    // ── Step 1: Research phase (if reference link exists) ────────────────────
    if (question.referenceUrl) {
      updateQuestion(question.id, { status: 'researching' })
      notify('LOG', { msg: `🔗 Opening reference page for Q${question.index + 1}…` })

      try {
        const pageText = await fetchPageText(question.referenceUrl)

        if (!pageText || pageText.trim().length < 20) {
          notify('LOG', { msg: `⚠ Q${question.index + 1}: Reference page loaded but appears empty — answering without it.` })
        } else {
          notify('LOG', { msg: `📄 Q${question.index + 1}: Reference page read (${pageText.length} chars). Summarising…` })
          referenceContext = await summarizeReferenceContent(pageText, question.text, client)
          notify('LOG', { msg: `✓ Q${question.index + 1}: Reference summarised. Reasoning…` })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        notify('LOG', { msg: `⚠ Q${question.index + 1}: Reference page failed (${msg}). Answering without it.` })
      }
    }

    // ── Step 2: Answer reasoning ──────────────────────────────────────────────
    updateQuestion(question.id, { status: 'answering' })
    const { answer, confidence, reasoning } = await answerQuestion(
      question, client, referenceContext,
    )

    // ── Step 3: Click answer on the page ─────────────────────────────────────
    if (activeTabId) {
      await chrome.tabs.sendMessage(activeTabId, {
        type: 'CLICK_ANSWER',
        payload: {
          questionId: question.id,
          answer,
          questionIndex: question.index,
          total: questions.length,
        },
      }).catch(() => { /* tab may have navigated away */ })
    }

    updateQuestion(question.id, {
      status: 'answered',
      selectedAnswer: answer,
      confidence,
      reasoning,
    })

    // Polite delay between answers
    await new Promise((r) => setTimeout(r, agentConfig!.delayBetweenAnswers))

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    updateQuestion(question.id, { status: 'failed', error: message })
  }
}

// ─── Message Handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse).catch((err) => {
      sendResponse({ ok: false, error: String(err) })
    })
    return true // keep channel open for async response
  },
)

async function handleMessage(message: ExtensionMessage): Promise<{ ok: boolean }> {
  switch (message.type) {

    // ── Side panel triggers a page scan ────────────────────────────────────
    case 'SCAN_PAGE': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) {
        notify('SCAN_ERROR', { msg: '✗ No active tab found.' })
        return { ok: false }
      }

      // Block scans on chrome:// pages where content scripts can't run
      if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
        notify('SCAN_ERROR', { msg: '✗ Cannot scan Chrome system pages. Open a regular web page first.' })
        return { ok: false }
      }

      activeTabId = tab.id
      notify('SCAN_STATUS', { msg: '⟳ Scanning…' })

      // Timeout: if SCAN_RESULT doesn't arrive within 10 s, report failure
      const scanTimeout = setTimeout(() => {
        notify('SCAN_ERROR', { msg: '✗ Scan timed out. Try refreshing the page and scanning again.' })
      }, 10_000)

      try {
        // Try messaging the already-injected content script first (manifest injection)
        const result = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PAGE' })
        clearTimeout(scanTimeout)
        if (result?.count === 0) {
          notify('SCAN_ERROR', { msg: '⚠ No MCQ questions detected on this page.' })
        }
      } catch {
        // Content script not ready — inject it once as fallback, then retry
        clearTimeout(scanTimeout)
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
          await new Promise((r) => setTimeout(r, 400))
          const result = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PAGE' })
          if (result?.count === 0) {
            notify('SCAN_ERROR', { msg: '⚠ No MCQ questions detected on this page.' })
          }
        } catch (err2) {
          notify('SCAN_ERROR', { msg: `✗ Could not scan page: ${String(err2)}. Refresh and try again.` })
        }
      }

      return { ok: true }
    }

    // ── Content script reports scan results ────────────────────────────────
    case 'SCAN_RESULT': {
      questions = message.payload.questions ?? []
      if (questions.length === 0) {
        notify('SCAN_ERROR', { msg: '⚠ 0 questions found. The page may use an unsupported quiz format.' })
      } else {
        notify('QUESTIONS_LOADED', { questions, ...stats() })
      }
      return { ok: true }
    }

    // ── Side panel starts the answering run ────────────────────────────────
    case 'START_QUEUE': {
      const {
        provider           = 'claude',
        apiKeyClaude       = '',
        apiKeyOpenAI       = '',
        model,
        tabId,
        concurrency        = 3,
        delayBetweenAnswers = 800,
      } = message.payload

      activeTabId = tabId ?? activeTabId

      // Instantiate the correct AI client based on provider selection
      if (provider === 'openai') {
        client = new OpenAIClient(apiKeyOpenAI, model || 'gpt-5.2-chat-latest')
      } else {
        client = new ClaudeClient(apiKeyClaude, model || 'claude-sonnet-4-6')
      }

      agentConfig = {
        provider,
        apiKeyClaude,
        apiKeyOpenAI,
        model: client.model,
        concurrency,
        delayBetweenAnswers,
      }

      const pending = questions.filter((q) => q.status === 'pending')

      queue = new AsyncQueue<MCQQuestion>(
        concurrency,
        processQuestion,
        () => {
          notify('QUEUE_COMPLETE', stats())
          // Also inform the content script so it can update overlay
          if (activeTabId) {
            chrome.tabs.sendMessage(activeTabId, {
              type: 'QUEUE_COMPLETE',
              payload: stats(),
            }).catch(() => { /* ignore */ })
          }
        },
      )

      queue.enqueue(pending)
      notify('QUEUE_STARTED', { total: pending.length, ...stats() })
      return { ok: true }
    }

    case 'PAUSE_QUEUE': {
      queue?.pause()
      notify('QUEUE_PAUSED', stats())
      return { ok: true }
    }

    case 'RESUME_QUEUE': {
      queue?.resume()
      notify('QUEUE_RESUMED', stats())
      return { ok: true }
    }

    case 'STOP_QUEUE': {
      queue?.stop()
      queue = null
      notify('QUEUE_COMPLETE', stats())
      return { ok: true }
    }

    default:
      return { ok: false }
  }
}

// ─── Open Side Panel When Extension Icon Is Clicked ──────────────────────────

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id })
  }
})
