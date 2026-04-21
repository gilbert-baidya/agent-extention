import type { AIClient } from './aiClient'

/**
 * Strip any characters outside the printable ISO-8859-1 range (0x20–0xFF)
 * and trim whitespace. HTTP headers reject anything outside this set and will
 * throw "non ISO-8859-1 code point" if the value contains, e.g., a
 * zero-width space accidentally copied alongside the API key.
 */
function sanitize(key: string): string {
  return key.replace(/[^\x20-\xFF]/g, '').trim()
}

export class ClaudeClient implements AIClient {
  readonly provider = 'claude' as const
  readonly model: string
  private apiKey: string

  constructor(apiKey: string, model = 'claude-sonnet-4-6') {
    this.apiKey = sanitize(apiKey)
    this.model  = model
  }

  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!response.ok) {
      let detail = response.statusText
      try {
        const err = await response.json()
        detail = err?.error?.message ?? detail
      } catch { /* ignore */ }
      throw new Error(`Claude API error ${response.status}: ${detail}`)
    }

    const data  = await response.json()
    const text: string = data?.content?.[0]?.text ?? ''
    if (!text) throw new Error('Empty response from Claude API')
    return text
  }
}
