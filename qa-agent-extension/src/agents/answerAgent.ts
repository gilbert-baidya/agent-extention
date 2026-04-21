import type { AIClient } from './aiClient'
import type { MCQQuestion } from '../types'

// ─── System Prompts ───────────────────────────────────────────────────────────

const ANSWER_SYSTEM_PROMPT_NO_REF = `\
You are an expert exam analyst and multiple-choice test-taker.

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
"confidence" is 0.0 (pure guess) to 1.0 (certain).`

const ANSWER_SYSTEM_PROMPT_WITH_REF = `\
You are a DHS Trusted Tester v5.1.3 evaluating a web page.

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
}`

// ─── Answer Agent ─────────────────────────────────────────────────────────────

export interface AnswerResult {
  answer: string
  confidence: number
  reasoning: string
}

export async function answerQuestion(
  question: MCQQuestion,
  client: AIClient,
  referenceContext?: string,
): Promise<AnswerResult> {
  const optionsBlock = question.options
    .map((o) => `${o.label}: ${o.text}`)
    .join('\n')

  const systemPrompt = referenceContext
    ? ANSWER_SYSTEM_PROMPT_WITH_REF
    : ANSWER_SYSTEM_PROMPT_NO_REF

  let userMessage = `Question:\n${question.text}\n\nOptions:\n${optionsBlock}`

  if (referenceContext) {
    userMessage +=
      `\n\n══ FINDINGS REPORT FROM REFERENCE PAGE ══\n` +
      referenceContext +
      `\n\n` +
      `Follow the Decision Procedure. Use DNA_APPLIES and PASS_MET from the report.\n` +
      `Return JSON only — no extra text.`
  }

  const raw = await client.chat(systemPrompt, userMessage)

  // Strip potential markdown fences
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim()

  try {
    const parsed = JSON.parse(cleaned)
    const answer = String(parsed.answer ?? '').toUpperCase().trim()
    if (!answer) throw new Error('Missing answer field')
    return {
      answer,
      confidence: Number(parsed.confidence) || 0.5,
      reasoning: String(parsed.reasoning ?? ''),
    }
  } catch {
    // Regex fallback if JSON is malformed
    const match = cleaned.match(/"answer"\s*:\s*"([A-Ea-e])"/i)
    if (match) {
      return {
        answer: match[1].toUpperCase(),
        confidence: 0.4,
        reasoning: cleaned.substring(0, 200),
      }
    }
    throw new Error(`Could not parse answer from response:\n${raw.substring(0, 300)}`)
  }
}
