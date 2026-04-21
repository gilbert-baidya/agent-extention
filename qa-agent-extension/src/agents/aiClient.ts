/**
 * Common interface every AI provider client must implement.
 * The agents (answerAgent, researchAgent) depend only on this —
 * they don't care whether Claude or OpenAI is underneath.
 */
export interface AIClient {
  readonly model: string
  readonly provider: 'claude' | 'openai'
  chat(systemPrompt: string, userMessage: string): Promise<string>
}
