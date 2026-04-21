import type { AIClient } from './aiClient'

// ─── Official DHS Trusted Tester v5.1.3 Test Methodology ─────────────────────
// Extracted verbatim from the official PDF. Each entry contains:
//   DNA_IF: exact "Identify Content" criteria that triggers Does Not Apply
//   PASS:   exact pass conditions (ALL vs ANY as specified)
//   LOOK_FOR: what DOM evidence to search for

const TRUSTED_TESTER_METHODOLOGY = `
══════════════════════════════════════════════════════════════
OFFICIAL DHS TRUSTED TESTER v5.1.3 TEST METHODOLOGY REFERENCE
══════════════════════════════════════════════════════════════

TEST 2.A | 1.4.2-audio-control
  DNA IF: There is NO audio content that plays AUTOMATICALLY (without user activation)
          for MORE THAN 3 SECONDS. (Alerts, sounds, music all count.)
  PASS — ALL of the following must be TRUE:
    1. A mechanism exists to pause/stop OR control the volume of ONLY the auto-playing audio
    2. That mechanism is within the FIRST THREE ELEMENTS the user encounters on the page
    3. The mechanism itself passes applicable accessibility tests
  FAIL if: audio auto-plays >3s AND no mechanism, OR mechanism not within first 3 elements
  DOM evidence: <audio autoplay>, <video autoplay>, media players, sounds on page load

──────────────────────────────────────────────────────────────
TEST 2.B | 2.2.2-blinking-moving-scrolling
  DNA IF: No content that starts moving/blinking/scrolling WITHOUT user activation AND
          lasts MORE THAN 5 SECONDS AND is NOT the only content on the page.
          ALSO DNA if the moving content IS the only content on the page.
  PASS — ALL of the following must be TRUE:
    1. An evident mechanism to pause/stop/hide the moving/blinking/scrolling content
    2. Mechanism is within the first 3 elements OR within 3 elements before/after the content
    3. Mechanism passes applicable tests
  DOM evidence: <marquee>, animated banners, CSS animations, scrolling text/carousels

──────────────────────────────────────────────────────────────
TEST 2.C | 2.2.2-auto-updating
  DNA IF: No auto-updating content (content that changes WITHOUT user activation) OR
          the auto-updating content is the ONLY content on the page.
          Auto-updating examples: timers, stock tickers, news carousels, counters, live scores.
  PASS — ALL of the following must be TRUE:
    1. A mechanism to pause/stop/hide the content OR control the frequency of updates
    2. Mechanism is within first 3 elements OR within 3 elements before/after the updating content
    3. Mechanism passes applicable tests
  FAIL if: auto-updating content EXISTS but no such mechanism found
  DOM evidence: aria-live regions, carousels, tickers, countdown timers, score feeds

──────────────────────────────────────────────────────────────
TEST 2.D | 4.1.2-change-notify-auto
  DNA IF: Page content does NOT update or change automatically.
  PASS — ANY ONE of the following must be TRUE:
    1. A keyboard-accessible dialog alerts the user to the automatic change, OR
    2. Focus moves to the content that changed AND that content describes the change, OR
    3. The content that changed is contained within an ARIA Live Region
  FAIL if: content changes automatically with no notification method above
  DOM evidence: role="alert", aria-live="polite/assertive", focus management on change

──────────────────────────────────────────────────────────────
TEST 3.A | 2.3.1-flashing
  SPECIAL RULE: If flashing IS found → result is NOT TESTED (no tool available yet)
  DNA IF: No flashing content found (content rapidly alternating between high-contrast states)
  Cannot be Pass or Fail — only DNA or NOT TESTED.

──────────────────────────────────────────────────────────────
TEST 4.A | 2.1.1-keyboard-access
  DNA IF: The page has NO user-activated functionality (no interactive elements).
  PASS — ALL must be TRUE:
    1. All functionality accessible via keyboard alone
    2. All essential information accessible via keyboard OR available elsewhere on page

──────────────────────────────────────────────────────────────
TEST 4.B | 2.1.1-no-keystroke-timing
  DNA IF: No user-activated functionality.
  PASS: A keyboard method exists that does not require specific timing for activation.

──────────────────────────────────────────────────────────────
TEST 4.C | 2.1.2-no-keyboard-trap
  DNA IF: No components that can receive keyboard focus.
  PASS — ALL must be TRUE:
    1. Keyboard focus can be moved away from any element using standard keys (Tab, arrows, Escape)
    2. Focus can be moved away from any section of the page (no loops)

──────────────────────────────────────────────────────────────
TEST 4.D | 2.4.7-focus-visible
  DNA IF: No elements that can receive keyboard focus.
  PASS: When each interface element receives focus, there is a visible indication of focus.

──────────────────────────────────────────────────────────────
TEST 4.E | 3.2.1-on-focus
  DNA IF: No keyboard-focusable elements.
  PASS: Receiving focus does NOT initiate an unexpected change of context.

──────────────────────────────────────────────────────────────
TEST 4.F | 2.4.3-focus-order-meaning
  DNA IF: No keyboard-focusable elements.
  PASS — ALL must be TRUE:
    1. Focus order preserves meaning of the page
    2. Focus order preserves operability of the page
  FAIL signals: positive tabindex values (e.g. tabindex=2, tabindex=5) out of visual sequence,
                DOM order radically different from visual reading order
  DOM evidence: elements with tabindex > 0 disrupt natural tab flow — list them as failures

──────────────────────────────────────────────────────────────
TEST 4.G | 2.4.1-bypass-function
  DNA IF: The page has only ONE content block (no repeated blocks of content before main content)
          AND no navigation regions that repeat across pages.
  PASS — ANY ONE of the following must be TRUE:
    1. A "skip to main content" / "skip navigation" link appears as first or second focusable element
       (the skip link may be visually hidden but MUST become visible on focus)
    2. The page uses proper landmark regions: at least a <main> or role="main" that allows
       users to navigate directly to the main content area (using AT landmark navigation)
    3. Heading structure allows jumping to main content (headings clearly delineate sections)
    4. An iframe titled appropriately that wraps only main content (rare)
  FAIL if: Multiple content blocks exist AND none of the bypass mechanisms above are present
  DOM evidence:
    - SKIP_LINK entries → bypass mechanism present
    - LANDMARK entries → check for main/navigation/banner landmarks
    - POSITIVE_TABINDEX → tab order disruption (relevant to 4.F not 4.G but still note)
    - If only ONE landmark region detected and no skip links → likely DNA
    - If header/nav + main content clearly separated by landmarks → PASS

──────────────────────────────────────────────────────────────
TEST 5.A | 3.3.2-label-provided
  DNA IF: No form elements OR all form elements are disabled.
  PASS: Visual labels or instructions provided for EACH form element.

──────────────────────────────────────────────────────────────
TEST 5.B | 2.4.6-label-descriptive
  DNA IF: No form elements, all disabled, or no visual labels provided.
  PASS — ALL must be TRUE:
    1. Each visual form label clearly describes expected input
    2. Each button label clearly describes its function

──────────────────────────────────────────────────────────────
TEST 5.C | 1.3.1-programmatic-label
  DNA IF: No form elements on page.
  PASS — ANY ONE of:
    1. ANDI output includes all relevant instructions/cues, OR
    2. Descriptive labels provided by programmatic associations (table headers, etc.), OR
    3. Combination of ANDI output + programmatic associations is adequate

──────────────────────────────────────────────────────────────
TEST 5.D | 3.2.2-on-input
  DNA IF: No form elements.
  PASS: Changing a field value does NOT cause an unexpected change of context.

──────────────────────────────────────────────────────────────
TEST 5.H | 3.3.4-error-prevention
  DNA IF: Form is single-page OR does not cause legal/financial obligations AND
          does not modify user-controlled data AND does not submit test responses.
  PASS — ANY ONE of:
    1. User can reverse the submission, OR
    2. User can review/confirm/correct before finalizing, OR
    3. Page checks for input errors and lets user correct them

──────────────────────────────────────────────────────────────
TEST 6.A | 2.4.4-link-purpose
  DNA IF: No links on the page.
  PASS: Purpose of each link determinable from link text + accessible name + description + context.

──────────────────────────────────────────────────────────────
TEST 7.A | 1.1.1-meaningful-image-name
  DNA IF: No images with non-empty accessible names (or no images at all).
  PASS — ALL must be TRUE:
    1. Image is NOT pure decoration
    2. Accessible name/description (ANDI output) provides equivalent description
══════════════════════════════════════════════════════════════`

// ─── Research Agent System Prompt ────────────────────────────────────────────

const RESEARCH_SYSTEM_PROMPT = `\
You are a DHS Trusted Tester v5.1.3 accessibility QA analyst examining a web page.

${TRUSTED_TESTER_METHODOLOGY}

══ YOUR TASK ══
Given a test question (which includes a Test ID like "2.A", "2.C", etc.) and extracted DOM data from the reference web page, produce a structured findings report.

STEP 1 — IDENTIFY THE TEST:
Look up the Test ID in the methodology reference above. Extract:
  - The exact DNA criteria ("Identify Content" — what must be ABSENT for DNA)
  - The exact PASS conditions

STEP 2 — CHECK DNA CRITERIA FIRST:
Ask: Does the page contain the content described in the DNA_IF condition?
  - Look at the relevant DOM section (AUDIO/VIDEO ELEMENTS, AUTO-UPDATING, LIVE REGIONS, etc.)
  - "=== NO ... DETECTED ===" means that type of element was not found
  - If content is ABSENT → DNA applies

STEP 3 — IF CONTENT EXISTS, CHECK PASS CONDITIONS:
Apply the exact pass conditions from the methodology.
  - For tests requiring mechanism within "first 3 elements": look for controls near the top of page or immediately adjacent to the content
  - Cite specific DOM evidence (element tag, class, aria-label, control labels)

OUTPUT FORMAT — fill in every field:
---
TEST_ID: [e.g., 2.C]
TEST_NAME: [e.g., 2.2.2-auto-updating]

DNA_CRITERIA: [quote the DNA condition from methodology]
CONTENT_FOUND_FOR_DNA_CHECK: YES / NO / UNCERTAIN
CONTENT_EVIDENCE: [specific DOM evidence — quote tags, classes, attributes, text]

DNA_APPLIES: YES / NO
DNA_REASON: [why DNA does or does not apply]

IF NOT DNA:
PASS_CONDITIONS: [list the pass conditions from methodology]
PASS_MET: YES / NO / UNCERTAIN
PASS_EVIDENCE: [what specific controls/mechanisms were found, with their labels and DOM location]

PRELIMINARY_VERDICT: PASS / FAIL / DOES_NOT_APPLY / NOT_TESTED
VERDICT_REASON: [one sentence with specific evidence]
---

CRITICAL RULES:
- Base DNA determination ONLY on whether the content type EXISTS — NOT on whether controls exist
- If content EXISTS but controls are absent → verdict is FAIL, not DNA
- The BEHAVIOUR line tells you if audio/video is ACTUALLY PLAYING right now — trust this for Test 2.A
- "=== NO AUDIO/VIDEO ELEMENTS DETECTED IN MAIN CONTENT ===" AND BEHAVIOUR says none playing → 2.A DNA applies
- "=== NO ARIA LIVE REGIONS IN MAIN CONTENT ===" AND "=== NO AUTO-UPDATING / MOVING CONTENT IN MAIN CONTENT ===" → 2.C and 2.D DNA likely applies
- ALL sections say IN MAIN CONTENT — Moodle page chrome has been excluded already
- For Test 3.A: if flashing IS found → NOT_TESTED; if not found → DOES_NOT_APPLY
- Never assume Pass — require explicit DOM evidence of the mechanism
- currentlyPlaying=true on a MEDIA element is the strongest possible evidence of auto-playing audio

KEYBOARD-SPECIFIC RULES (Tests 4.A–4.G):

⚠ CRITICAL: Each keyboard test has its OWN DNA condition. Do NOT apply a blanket DNA to all tests.
  BEHAVIOUR_KEYBOARD tells you the focusable element count. Use it per-test as follows:

- Test 4.A (keyboard-access):
  DNA IF: NO user-activated functionality on the page (no links, buttons, inputs, interactive elements AT ALL).
  If focusable elements exist (count > 0) → NOT DNA. Check MOUSE_ONLY elements:
    • MOUSE_ONLY elements found → FAIL (functionality not keyboard accessible)
    • No MOUSE_ONLY elements → PASS (all functionality is keyboard accessible)
  IMPORTANT: Even 1 focusable element means DNA does NOT apply for 4.A.

- Test 4.B (no-keystroke-timing):
  DNA IF: No user-activated functionality.
  If elements exist → PASS (unless explicit evidence of timing-dependent activation, which is very rare).

- Test 4.C (no-keyboard-trap):
  DNA IF: NO components that can RECEIVE keyboard focus (focusable count = 0).
  If focusable elements exist (count > 0) → NOT DNA. Then check:
    • ACTIVE_MODAL / IFRAME / trap indicators → evaluate if focus can escape
    • NO trap indicators AND focusable elements exist → PASS (no trap detected)
  IMPORTANT: "No trap indicators" + focusable elements = PASS, NOT DNA.

- Test 4.D (focus-visible):
  DNA IF: No elements that can receive keyboard focus (focusable count = 0).
  If focusable elements exist → check FOCUS_INDICATOR lines:
    • ANY VISIBLE=false → FAIL
    • ALL VISIBLE=true → PASS

- Test 4.E (on-focus):
  DNA IF: No keyboard-focusable elements (focusable count = 0).
  If focusable elements exist → NOT DNA. Then:
    • Without evidence of unexpected context changes on focus → PASS
    • FAIL only if there is explicit evidence of navigation/popup/form-submit triggered by focus alone
  IMPORTANT: Focusable elements existing + no context-change evidence = PASS, NOT DNA.

- Test 4.F (focus-order-meaning):
  DNA IF: No keyboard-focusable elements (focusable count = 0).
  If focusable elements exist → NOT DNA. Then:
    • POSITIVE_TABINDEX entries → evaluate if tab order disrupts meaning/operability
    • No positive tabindex + logical DOM order → PASS
  IMPORTANT: Focusable elements existing + no order issues = PASS, NOT DNA.

- Test 4.G (bypass-function):
  DNA IF: Only ONE content block (no repeated blocks before main content) AND no navigation regions.
  Look at SKIP_LINK and LANDMARK sections:
    • SKIP_LINK entries present → PASS
    • Multiple LANDMARK regions including 'main' → PASS
    • Only ONE content block with no navigation → DNA
    • Repeated blocks but NO bypass mechanism → FAIL

══ MASTER RULE FOR KEYBOARD TESTS ══
If BEHAVIOUR_KEYBOARD shows N > 0 focusable elements, then for tests 4.A–4.F:
  → DNA is WRONG. The page HAS interactive content.
  → Determine PASS or FAIL based on the specific test criteria above.
Only use DNA when the focusable count is genuinely 0 AND the test's specific DNA condition is met.`

const MAX_PAGE_CHARS = 30_000

export async function summarizeReferenceContent(
  pageText: string,
  question: string,
  client: AIClient,
): Promise<string> {
  const truncated =
    pageText.length > MAX_PAGE_CHARS
      ? pageText.substring(0, MAX_PAGE_CHARS) + '\n… [content truncated]'
      : pageText

  const userMessage =
    `Test question (contains Test ID and Test Name):\n${question}\n\n` +
    `Extracted DOM data from reference web page:\n${truncated}`

  return client.chat(RESEARCH_SYSTEM_PROMPT, userMessage)
}
