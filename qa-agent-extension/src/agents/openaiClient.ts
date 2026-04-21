import type { AIClient } from './aiClient'

/** Remove non-ISO-8859-1 characters that would break fetch header encoding */
function sanitize(key: string): string {
  return key.replace(/[^\x20-\xFF]/g, '').trim()
}

export class OpenAIClient implements AIClient {
  readonly provider = 'openai' as const
  readonly model: string
  private apiKey: string

  constructor(apiKey: string, model = 'gpt-5.2-chat-latest') {
    this.apiKey = sanitize(apiKey)
    this.model  = model
  }

  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_completion_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage  },
        ],
      }),
    })

    if (!response.ok) {
      let detail = response.statusText
      try {
        const err = await response.json()
        detail = err?.error?.message ?? detail
      } catch { /* ignore */ }
      throw new Error(`OpenAI API error ${response.status}: ${detail}`)
    }

    const data  = await response.json()
    const text: string = data?.choices?.[0]?.message?.content ?? ''
    if (!text) throw new Error('Empty response from OpenAI API')
    return text
  }
}
