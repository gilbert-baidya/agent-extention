var Se=Object.defineProperty;var be=(t,n,o)=>n in t?Se(t,n,{enumerable:!0,configurable:!0,writable:!0,value:o}):t[n]=o;var O=(t,n,o)=>be(t,typeof n!="symbol"?n+"":n,o);function Oe(t){return t.replace(/[^\x20-\xFF]/g,"").trim()}class Ie{constructor(n,o="claude-sonnet-4-6"){O(this,"provider","claude");O(this,"model");O(this,"apiKey");this.apiKey=Oe(n),this.model=o}async chat(n,o){var A,p,d;const s=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":this.apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:this.model,max_tokens:1024,system:n,messages:[{role:"user",content:o}]})});if(!s.ok){let E=s.statusText;try{const f=await s.json();E=((A=f==null?void 0:f.error)==null?void 0:A.message)??E}catch{}throw new Error(`Claude API error ${s.status}: ${E}`)}const u=await s.json(),i=((d=(p=u==null?void 0:u.content)==null?void 0:p[0])==null?void 0:d.text)??"";if(!i)throw new Error("Empty response from Claude API");return i}}function ye(t){return t.replace(/[^\x20-\xFF]/g,"").trim()}class De{constructor(n,o="gpt-5.2-chat-latest"){O(this,"provider","openai");O(this,"model");O(this,"apiKey");this.apiKey=ye(n),this.model=o}async chat(n,o){var A,p,d,E;const s=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${this.apiKey}`},body:JSON.stringify({model:this.model,max_completion_tokens:1024,messages:[{role:"system",content:n},{role:"user",content:o}]})});if(!s.ok){let f=s.statusText;try{const D=await s.json();f=((A=D==null?void 0:D.error)==null?void 0:A.message)??f}catch{}throw new Error(`OpenAI API error ${s.status}: ${f}`)}const u=await s.json(),i=((E=(d=(p=u==null?void 0:u.choices)==null?void 0:p[0])==null?void 0:d.message)==null?void 0:E.content)??"";if(!i)throw new Error("Empty response from OpenAI API");return i}}const Re=`You are an expert exam analyst and multiple-choice test-taker.

Your task: select the single best answer from the options given.

Rules:
1. Read the question and every option very carefully.
2. Reason step-by-step before deciding.
3. Return ONLY this JSON — no extra text, no markdown fences:

{
  "answer": "A",
  "confidence": 0.85,
  "reasoning": "One or two sentences explaining why."
}

"answer" must be the EXACT label letter shown (A, B, C, D, …).
"confidence" is 0.0 (pure guess) to 1.0 (certain).`,Ce=`You are a DHS Trusted Tester v5.1.3 evaluating a web page.

A structured findings report from the reference page is provided below.
That report was produced by applying the official Trusted Tester methodology.
You MUST follow the PRELIMINARY_VERDICT from the report as your primary guide.

══ HOW TO SELECT YOUR ANSWER ══

The answer options correspond to Trusted Tester outcomes:
  • PASS            = content EXISTS and FULLY satisfies the test condition
  • FAIL (various)  = content EXISTS but FAILS the condition in a specific way
  • DOES NOT APPLY  = the tested content type is COMPLETELY ABSENT from the page
  • NOT TESTED      = content exists but cannot be evaluated with available tools (Test 3.A flashing only)

══ DECISION PROCEDURE ══

1. Read DNA_APPLIES in the findings report.
   • If DNA_APPLIES: YES → choose the "Does Not Apply" answer option.
   • If DNA_APPLIES: NO → proceed to step 2.

2. Read PASS_MET in the findings report.
   • If PASS_MET: YES with specific evidence → choose "Pass".
   • If PASS_MET: NO or UNCERTAIN → choose a Fail option.

3. When choosing a Fail option:
   • Read each Fail option text carefully — each describes a SPECIFIC failure mode.
   • Choose the Fail option whose description BEST matches VERDICT_REASON and CONTENT_EVIDENCE.
   • If multiple Fail options could apply, choose the most specific one.

4. Special case — Test 3.A (2.3.1-flashing):
   • If the report says NOT_TESTED → choose "Not Tested".
   • If the report says DOES_NOT_APPLY → choose "Does Not Apply".

══ IRON RULES ══
• NEVER choose "Does Not Apply" if CONTENT_FOUND_FOR_DNA_CHECK is YES.
  Even if no controls exist, the answer is a Fail, not Does Not Apply.
• NEVER choose "Pass" if PASS_EVIDENCE says "None found" or is vague.
  Pass requires a named, specific mechanism (e.g. "Pause button", "volume slider").
• NEVER choose "Does Not Apply" if DNA_APPLIES is NO in the report.
  If DNA_APPLIES=NO, the content EXISTS — pick Pass or a Fail option.
• NEVER choose "Fail" or "Pass" if DNA_APPLIES is YES in the report.
  If DNA_APPLIES=YES, the tested content is absent — pick "Does Not Apply".
• If DNA_APPLIES=NO and PASS_MET=YES with specific evidence, the answer IS "Pass".
  Do NOT override a well-evidenced Pass verdict with DNA or Fail.
• For keyboard tests (4.A–4.F): if the report says focusable elements exist (count > 0)
  AND no issues were found for that specific test, the answer is "Pass", NOT "Does Not Apply".
• The PRELIMINARY_VERDICT in the findings report encodes the official methodology.
  Override it only if you see clear contradictory evidence in the option texts.

══ SELF-CHECK (do this before outputting) ══
1. Re-read DNA_APPLIES from the report.
2. Re-read your chosen answer option text.
3. If your answer says "Does Not Apply" but DNA_APPLIES=NO → WRONG, change it.
4. If your answer says "Pass" but PASS_MET=NO → WRONG, change it.
5. If your answer says a Fail but DNA_APPLIES=YES → WRONG, change to "Does Not Apply".

Return ONLY valid JSON — no markdown, no extra text:
{
  "answer": "B",
  "confidence": 0.91,
  "reasoning": "Report DNA_APPLIES=NO, PASS_MET=YES/NO. Self-check: [confirmed DNA_APPLIES matches choice]. Chose [option] because [reason]."
}`;async function Le(t,n,o){const s=t.options.map(d=>`${d.label}: ${d.text}`).join(`
`),u=o?Ce:Re;let i=`Question:
${t.text}

Options:
${s}`;o&&(i+=`

══ FINDINGS REPORT FROM REFERENCE PAGE ══
`+o+`

Follow the Decision Procedure. Use DNA_APPLIES and PASS_MET from the report.
Return JSON only — no extra text.`);const A=await n.chat(u,i),p=A.replace(/```(?:json)?/gi,"").trim();try{const d=JSON.parse(p),E=String(d.answer??"").toUpperCase().trim();if(!E)throw new Error("Missing answer field");return{answer:E,confidence:Number(d.confidence)||.5,reasoning:String(d.reasoning??"")}}catch{const d=p.match(/"answer"\s*:\s*"([A-Ea-e])"/i);if(d)return{answer:d[1].toUpperCase(),confidence:.4,reasoning:p.substring(0,200)};throw new Error(`Could not parse answer from response:
${A.substring(0,300)}`)}}const ve=`
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
══════════════════════════════════════════════════════════════`,we=`You are a DHS Trusted Tester v5.1.3 accessibility QA analyst examining a web page.

${ve}

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
Only use DNA when the focusable count is genuinely 0 AND the test's specific DNA condition is met.`,re=3e4;async function Pe(t,n,o){const s=t.length>re?t.substring(0,re)+`
… [content truncated]`:t,u=`Test question (contains Test ID and Test Name):
${n}

Extracted DOM data from reference web page:
${s}`;return o.chat(we,u)}class xe{constructor(n,o,s){O(this,"items",[]);O(this,"running",0);O(this,"_paused",!1);O(this,"_stopped",!1);this.concurrency=n,this.processor=o,this.onDrained=s}enqueue(n){this.items.push(...n),this.tick()}pause(){this._paused=!0}resume(){this._paused=!1,this.tick()}stop(){this._stopped=!0,this.items.length=0}get pending(){return this.items.length}get active(){return this.running}get paused(){return this._paused}tick(){if(!(this._paused||this._stopped))for(;this.running<this.concurrency&&this.items.length>0;){const n=this.items.shift();this.running++,this.processor(n).finally(()=>{var o;this.running--,this.items.length===0&&this.running===0?(o=this.onDrained)==null||o.call(this):this.tick()})}}}let x=null,z=null,I=[],S=null,y=null;function m(t,n){chrome.runtime.sendMessage({type:t,payload:n}).catch(()=>{})}function K(t,n){const o=I.find(s=>s.id===t);o&&(Object.assign(o,n),m("QUESTION_UPDATE",{question:{...o}}))}function v(){return{total:I.length,answered:I.filter(t=>t.status==="answered").length,failed:I.filter(t=>t.status==="failed").length,skipped:I.filter(t=>t.status==="skipped").length,pending:I.filter(t=>t.status==="pending").length}}async function _e(t,n=3e4){return new Promise((o,s)=>{const u=setTimeout(()=>s(new Error(`Reference page did not load within ${n/1e3}s`)),n);chrome.tabs.create({url:t,active:!0},i=>{var d;if(chrome.runtime.lastError||!(i!=null&&i.id))return clearTimeout(u),s(new Error(((d=chrome.runtime.lastError)==null?void 0:d.message)??"Could not open tab"));const A=i.id,p=(E,f)=>{E!==A||f.status!=="complete"||(chrome.tabs.onUpdated.removeListener(p),clearTimeout(u),setTimeout(async()=>{var D;try{const _=await chrome.scripting.executeScript({target:{tabId:A},func:()=>{var oe,se,ae,ie;const le=document.title??"",G=!!document.querySelector("#page-wrapper, .moodle-page, #region-main-box, .course-content"),J=G?document.querySelector('main, [role="main"], #region-main, #page-content, .content-inner, #content'):null,T=J??document.body,C=e=>{var r;if(!G||J!==null)return!1;let a=e;for(;a;){const c=(r=a.tagName)==null?void 0:r.toLowerCase();if(c==="header"||c==="nav"||c==="footer"||a.id&&/^(header|navbar|nav|footer|breadcrumb|sidebar|side-bar|mast|topbar)/i.test(a.id))return!0;if(a===T)break;a=a.parentElement}return!1};let U="";try{const e=Array.from(document.querySelectorAll("iframe"));for(const a of e)try{const r=a.contentDocument;if(r&&r.body){const c=((oe=r.body.innerText)==null?void 0:oe.substring(0,3e3))??"",l=r.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"]');(c.length>10||l.length>0)&&(U+=`IFRAME src="${a.src}" title="${a.title}": `,U+=`${l.length} focusable elements. Text: ${c.substring(0,500)}
`)}}catch{}}catch{}const ue=((se=T.innerText)==null?void 0:se.substring(0,5e3))??(((ae=document.body)==null?void 0:ae.innerText)??"").substring(0,5e3),Z=Array.from(document.querySelectorAll("audio, video")),Ue=Z.filter(e=>!e.paused||e.hasAttribute("autoplay")),de=Array.from(T.querySelectorAll('object, embed, [class*="player"], [class*="audio"], [class*="sound"], [id*="player"], [id*="audio"], [class*="jwplayer"], [class*="mediaplayer"]')).filter(e=>!C(e)),F=[];for(const e of[...Z,...de]){if(C(e))continue;const r=!e.paused,c=e.hasAttribute("autoplay")||e.getAttribute("data-autoplay")==="true",l=e.hasAttribute("controls"),h=e.getAttribute("src")||e.getAttribute("data")||e.getAttribute("data-src")||"",g=e.className||"",b=e.id||"";let P="none",M=e.parentElement;for(let X=0;X<5&&M;X++){const B=Array.from(M.querySelectorAll('button, [role="button"], input[type="range"]')).filter(R=>{const V=(R.getAttribute("aria-label")||R.textContent||"").toLowerCase();return/pause|stop|volume|mute|play/.test(V)}).map(R=>{var V;return R.getAttribute("aria-label")||((V=R.textContent)==null?void 0:V.trim())||R.className});if(B.length){P=B.join(", ");break}M=M.parentElement}F.push(`MEDIA: <${e.tagName.toLowerCase()}> id="${b}" class="${g}" autoplay=${c} currentlyPlaying=${r} hasControlsAttr=${l} src="${h}" NEARBY_CONTROLS=[${P}]`)}const Ae=F.length?`=== AUDIO/VIDEO ELEMENTS IN MAIN CONTENT (${F.length} found) ===
NOTE: currentlyPlaying=true means audio/video is actively playing right now
`+F.join(`
`):"=== NO AUDIO/VIDEO ELEMENTS DETECTED IN MAIN CONTENT ===",H=Array.from(T.querySelectorAll('[aria-live], [role="alert"], [role="status"], [role="log"], [role="marquee"], [role="timer"]')).filter(e=>!C(e)).map(e=>{var l;const a=e.getAttribute("aria-live")||"",r=e.getAttribute("role")||"",c=((l=e.textContent)==null?void 0:l.trim().substring(0,150))||"";return`LIVE_REGION (in main content): ${e.tagName} aria-live="${a}" role="${r}" text="${c}"`}),me=H.length?`=== ARIA LIVE REGIONS IN MAIN CONTENT (${H.length} found) ===
NOTE: These are inside the test scenario, not Moodle page chrome
`+H.join(`
`):"=== NO ARIA LIVE REGIONS IN MAIN CONTENT ===",j=Array.from(T.querySelectorAll('marquee, blink, [class*="ticker"], [class*="carousel"], [class*="rotator"], [class*="auto-updat"], [class*="countdown"], [class*="live-update"], [class*="news-feed"], [data-interval], [data-cycle], [data-rotate]')).filter(e=>!C(e)).map(e=>{var h;const a=e.className||e.tagName.toLowerCase(),r=e.id||"",c=((h=e.textContent)==null?void 0:h.trim().substring(0,150))||"",l=Array.from(document.querySelectorAll('button, [role="button"]')).filter(g=>{const b=(g.getAttribute("aria-label")||g.textContent||"").toLowerCase();return/pause|stop|hide|freeze/.test(b)}).map(g=>{var b;return g.getAttribute("aria-label")||((b=g.textContent)==null?void 0:b.trim())});return`AUTO_CONTENT: <${e.tagName.toLowerCase()}> id="${r}" class="${a}" text="${c}"`+(l.length?` CONTROLS=[${l.join(", ")}]`:" CONTROLS=none")}),he=j.length?`=== AUTO-UPDATING / MOVING CONTENT IN MAIN CONTENT (${j.length} found) ===
`+j.join(`
`):"=== NO AUTO-UPDATING / MOVING CONTENT IN MAIN CONTENT ===",q=Array.from(T.querySelectorAll('button, [role="button"], input[type="range"], input[type="checkbox"], select')).filter(e=>!C(e)).map(e=>{var l;const a=((l=e.textContent)==null?void 0:l.trim())||e.value||"",r=e.getAttribute("aria-label")||"";return`CONTROL: ${e.type||e.tagName.toLowerCase()} label="${r||a}"`}).filter(e=>e.length>15),pe=q.length?`=== INTERACTIVE CONTROLS IN MAIN CONTENT (${q.length} found) ===
`+q.join(`
`):"=== NO INTERACTIVE CONTROLS IN MAIN CONTENT ===",ee=Array.from(T.querySelectorAll("[aria-label]")).filter(e=>!C(e)).map(e=>e.getAttribute("aria-label")).join(" | "),te=Array.from(T.querySelectorAll("img[alt]")).filter(e=>!C(e)).map(e=>e.alt).join(" | "),$=Array.from(T.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"], [role="checkbox"], [role="menuitem"], [role="tab"], [role="option"], [role="slider"], [role="spinbutton"], [role="textbox"], [role="combobox"]')).filter(e=>{const a=window.getComputedStyle(e);return a.display!=="none"&&a.visibility!=="hidden"&&a.opacity!=="0"}),N=$.length,Ee=$.slice(0,15).map(e=>{var b;const a=e.tagName.toLowerCase(),r=((b=e.textContent)==null?void 0:b.trim().substring(0,60))||e.value||"",c=e.getAttribute("aria-label")||"",l=e.getAttribute("tabindex")??"default",h=e.getAttribute("role")||"",g=e.disabled;return`  FOCUSABLE: <${a}> tabindex=${l} role="${h}" disabled=${g} label="${c||r}"`}),w=[];if($.length===0)w.push("FOCUS_INDICATOR: No focusable elements to test");else{const e=$.slice(0,5);for(let r=0;r<e.length;r++)try{const c=e[r];c.focus();const l=window.getComputedStyle(c),h=l.outlineStyle,g=l.outlineWidth,b=l.outlineColor,P=l.boxShadow,B=h!=="none"&&g!=="0px"||P!=="none"&&!!P,R=c.getAttribute("aria-label")||((ie=c.textContent)==null?void 0:ie.trim().substring(0,30))||"";w.push(`FOCUS_INDICATOR[${r}] <${c.tagName.toLowerCase()}> label="${R}": outline="${h}/${g}/${b}" box-shadow="${P}" → VISIBLE=${B}`),c.blur()}catch{w.push(`FOCUS_INDICATOR[${r}]: Could not measure (script error)`)}const a=w.some(r=>r.includes("VISIBLE=false"));w.push(a?"FOCUS_INDICATOR_SUMMARY: ⚠ AT LEAST ONE element has NO visible focus indicator → 4.D likely FAIL":`FOCUS_INDICATOR_SUMMARY: All ${e.length} tested elements have visible focus indicators → 4.D likely PASS`)}const Ne=w.join(`
`),L=Array.from(T.querySelectorAll("[onclick], [onmousedown], [onmouseup], [ondblclick]")).filter(e=>{const a=e.tagName.toLowerCase();if(["a","button","input","select","textarea"].includes(a))return!1;const r=e.getAttribute("role")||"";return!(["button","link","menuitem","tab"].includes(r)||e.hasAttribute("tabindex"))}).map(e=>{var l,h;const a=e.tagName.toLowerCase(),r=((l=e.getAttribute("onclick"))==null?void 0:l.substring(0,60))||"",c=((h=e.textContent)==null?void 0:h.trim().substring(0,50))||"";return`MOUSE_ONLY: <${a}> onclick="${r}" text="${c}"`}),Q=Array.from(document.querySelectorAll('a[href^="#"], a[href]')).filter(e=>{var c;const a=((c=e.textContent)==null?void 0:c.trim().toLowerCase())||"",r=e.getAttribute("href")||"";return/skip|jump|bypass|main content|navigation|go to/i.test(a)||/^#(main|content|skip|primary|maincontent|main-content)/i.test(r)}).map(e=>{var h;const a=((h=e.textContent)==null?void 0:h.trim())||"",r=e.getAttribute("href")||"",c=window.getComputedStyle(e),l=c.position==="absolute"&&(parseInt(c.left||"0")<-900||c.clip!=="auto");return`SKIP_LINK: "${a}" href="${r}" visuallyHiddenUntilFocus=${l}`}),W=Array.from(document.querySelectorAll('main, [role="main"], nav, [role="navigation"], header, [role="banner"], footer, [role="contentinfo"], aside, [role="complementary"], section[aria-label], [role="region"][aria-label], [role="search"], form[aria-label]')).map(e=>{const a=e.tagName.toLowerCase(),r=e.getAttribute("role")||a,c=e.getAttribute("aria-label")||e.getAttribute("aria-labelledby")||e.id||"";return`LANDMARK: <${a}> role="${r}" label="${c}"`}),fe=[Q.length>0?`=== SKIP NAVIGATION LINKS (${Q.length} found — bypass mechanism for 4.G) ===
`+Q.join(`
`):"=== NO SKIP NAVIGATION LINKS DETECTED ===",W.length>0?`=== LANDMARK REGIONS (${W.length} found — bypass mechanism for 4.G) ===
`+W.join(`
`):"=== NO LANDMARK REGIONS DETECTED ==="].join(`

`),k=[];Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"], .modal.show, .modal[style*="display: block"]')).filter(e=>window.getComputedStyle(e).display!=="none").forEach(e=>k.push(`ACTIVE_MODAL: <${e.tagName}> role="${e.getAttribute("role")}" aria-modal="${e.getAttribute("aria-modal")}" class="${e.className}"`)),Array.from(T.querySelectorAll("iframe")).forEach(e=>k.push(`IFRAME: src="${e.getAttribute("src")}" title="${e.getAttribute("title")}" — iframes can trap keyboard focus`)),Array.from(T.querySelectorAll("[tabindex]")).filter(e=>parseInt(e.getAttribute("tabindex")||"0",10)>0).forEach(e=>k.push(`POSITIVE_TABINDEX: <${e.tagName}> tabindex=${e.getAttribute("tabindex")} — disrupts tab order`));const Te=[N>0?`=== KEYBOARD-FOCUSABLE ELEMENTS IN MAIN CONTENT (${N} found) ===
`+Ee.join(`
`):"=== NO KEYBOARD-FOCUSABLE ELEMENTS IN MAIN CONTENT ===",Ne,L.length>0?`=== MOUSE-ONLY ELEMENTS (no keyboard access) — ${L.length} found ===
`+L.join(`
`):"=== NO MOUSE-ONLY ELEMENTS DETECTED ===",k.length>0?`=== KEYBOARD TRAP INDICATORS ===
${k.join(`
`)}`:"=== NO KEYBOARD TRAP INDICATORS DETECTED ===",fe].join(`

`),ne=Array.from(document.querySelectorAll("audio, video")).filter(e=>!e.paused).length,Y=N+L.length,ge=[ne>0?`BEHAVIOUR_AUDIO: ${ne} audio/video element(s) are CURRENTLY PLAYING`:"BEHAVIOUR_AUDIO: No audio/video currently playing at time of scan",`BEHAVIOUR_KEYBOARD: ${N} keyboard-focusable element(s) found in main content`,`BEHAVIOUR_INTERACTIVE: ${Y} total interactive element(s) (${N} keyboard-focusable + ${L.length} mouse-only)`,L.length>0?`BEHAVIOUR_KEYBOARD: ${L.length} mouse-only element(s) found (not keyboard accessible)`:"BEHAVIOUR_KEYBOARD: No mouse-only elements detected",`
KEYBOARD TEST DNA QUICK REFERENCE:`,`  Test 4.A DNA? ${Y===0?"YES — no user-activated functionality at all":"NO — "+Y+" interactive element(s) exist"}`,`  Test 4.B DNA? ${Y===0?"YES — no user-activated functionality":"NO — interactive elements exist"}`,`  Test 4.C DNA? ${N===0?"YES — no components can receive keyboard focus":"NO — "+N+" focusable component(s) exist"}`,`  Test 4.D DNA? ${N===0?"YES — no elements can receive keyboard focus":"NO — "+N+" focusable element(s) exist"}`,`  Test 4.E DNA? ${N===0?"YES — no keyboard-focusable elements":"NO — "+N+" focusable element(s) exist"}`,`  Test 4.F DNA? ${N===0?"YES — no keyboard-focusable elements":"NO — "+N+" focusable element(s) exist"}`].join(`
`);return[`PAGE TITLE: ${le}`,`PAGE_TYPE: ${G?"MOODLE (scoped to main content)":"EXAM REFERENCE PAGE (full body scanned)"}`,ge,`=== MAIN CONTENT TEXT ===
${ue}`,ee?`ARIA LABELS IN MAIN CONTENT: ${ee}`:"",te?`ALT TEXTS IN MAIN CONTENT: ${te}`:"",Ae,me,he,pe,Te,U?`=== IFRAME CONTENT ===
${U}`:""].filter(Boolean).join(`

`)}}),ce=((D=_==null?void 0:_[0])==null?void 0:D.result)??"";y&&await chrome.tabs.update(y,{active:!0}).catch(()=>{}),await chrome.tabs.remove(A).catch(()=>{}),o(ce)}catch(_){await chrome.tabs.remove(A).catch(()=>{}),y&&chrome.tabs.update(y,{active:!0}).catch(()=>{}),s(new Error(`Could not read exam page: ${_}`))}},5e3))};chrome.tabs.onUpdated.addListener(p)})})}async function ke(t){if(!(!x||!z))try{let n;if(t.referenceUrl){K(t.id,{status:"researching"}),m("LOG",{msg:`🔗 Opening reference page for Q${t.index+1}…`});try{const i=await _e(t.referenceUrl);!i||i.trim().length<20?m("LOG",{msg:`⚠ Q${t.index+1}: Reference page loaded but appears empty — answering without it.`}):(m("LOG",{msg:`📄 Q${t.index+1}: Reference page read (${i.length} chars). Summarising…`}),n=await Pe(i,t.text,x),m("LOG",{msg:`✓ Q${t.index+1}: Reference summarised. Reasoning…`}))}catch(i){const A=i instanceof Error?i.message:String(i);m("LOG",{msg:`⚠ Q${t.index+1}: Reference page failed (${A}). Answering without it.`})}}K(t.id,{status:"answering"});const{answer:o,confidence:s,reasoning:u}=await Le(t,x,n);y&&await chrome.tabs.sendMessage(y,{type:"CLICK_ANSWER",payload:{questionId:t.id,answer:o,questionIndex:t.index,total:I.length}}).catch(()=>{}),K(t.id,{status:"answered",selectedAnswer:o,confidence:s,reasoning:u}),await new Promise(i=>setTimeout(i,z.delayBetweenAnswers))}catch(n){const o=n instanceof Error?n.message:String(n);K(t.id,{status:"failed",error:o})}}chrome.runtime.onMessage.addListener((t,n,o)=>(Me(t).then(o).catch(s=>{o({ok:!1,error:String(s)})}),!0));async function Me(t){var n,o;switch(t.type){case"SCAN_PAGE":{const[s]=await chrome.tabs.query({active:!0,currentWindow:!0});if(!(s!=null&&s.id))return m("SCAN_ERROR",{msg:"✗ No active tab found."}),{ok:!1};if((n=s.url)!=null&&n.startsWith("chrome://")||(o=s.url)!=null&&o.startsWith("chrome-extension://"))return m("SCAN_ERROR",{msg:"✗ Cannot scan Chrome system pages. Open a regular web page first."}),{ok:!1};y=s.id,m("SCAN_STATUS",{msg:"⟳ Scanning…"});const u=setTimeout(()=>{m("SCAN_ERROR",{msg:"✗ Scan timed out. Try refreshing the page and scanning again."})},1e4);try{const i=await chrome.tabs.sendMessage(s.id,{type:"SCAN_PAGE"});clearTimeout(u),(i==null?void 0:i.count)===0&&m("SCAN_ERROR",{msg:"⚠ No MCQ questions detected on this page."})}catch{clearTimeout(u);try{await chrome.scripting.executeScript({target:{tabId:s.id},files:["content.js"]}),await new Promise(A=>setTimeout(A,400));const i=await chrome.tabs.sendMessage(s.id,{type:"SCAN_PAGE"});(i==null?void 0:i.count)===0&&m("SCAN_ERROR",{msg:"⚠ No MCQ questions detected on this page."})}catch(i){m("SCAN_ERROR",{msg:`✗ Could not scan page: ${String(i)}. Refresh and try again.`})}}return{ok:!0}}case"SCAN_RESULT":return I=t.payload.questions??[],I.length===0?m("SCAN_ERROR",{msg:"⚠ 0 questions found. The page may use an unsupported quiz format."}):m("QUESTIONS_LOADED",{questions:I,...v()}),{ok:!0};case"START_QUEUE":{const{provider:s="claude",apiKeyClaude:u="",apiKeyOpenAI:i="",model:A,tabId:p,concurrency:d=3,delayBetweenAnswers:E=800}=t.payload;y=p??y,s==="openai"?x=new De(i,A||"gpt-5.2-chat-latest"):x=new Ie(u,A||"claude-sonnet-4-6"),z={provider:s,apiKeyClaude:u,apiKeyOpenAI:i,model:x.model,concurrency:d,delayBetweenAnswers:E};const f=I.filter(D=>D.status==="pending");return S=new xe(d,ke,()=>{m("QUEUE_COMPLETE",v()),y&&chrome.tabs.sendMessage(y,{type:"QUEUE_COMPLETE",payload:v()}).catch(()=>{})}),S.enqueue(f),m("QUEUE_STARTED",{total:f.length,...v()}),{ok:!0}}case"PAUSE_QUEUE":return S==null||S.pause(),m("QUEUE_PAUSED",v()),{ok:!0};case"RESUME_QUEUE":return S==null||S.resume(),m("QUEUE_RESUMED",v()),{ok:!0};case"STOP_QUEUE":return S==null||S.stop(),S=null,m("QUEUE_COMPLETE",v()),{ok:!0};default:return{ok:!1}}}chrome.action.onClicked.addListener(t=>{t.id&&chrome.sidePanel.open({tabId:t.id})});
