// ─── Question & Option ───────────────────────────────────────────────────────

export type QuestionStatus =
  | 'pending'
  | 'answering'
  | 'researching'
  | 'answered'
  | 'failed'
  | 'skipped';

export interface MCQOption {
  /** Letter label: A, B, C, D … */
  label: string;
  /** Visible text of the option */
  text: string;
  /** CSS selector to click the option's DOM element */
  element: string;
}

export interface MCQQuestion {
  id: string;
  index: number;
  text: string;
  options: MCQOption[];
  /** URL of a reference page linked from the question (optional) */
  referenceUrl?: string;
  status: QuestionStatus;
  selectedAnswer?: string;
  confidence?: number;
  reasoning?: string;
  error?: string;
}

// ─── Agent Config ────────────────────────────────────────────────────────────

export type AIProvider = 'claude' | 'openai'

export interface AgentConfig {
  provider: AIProvider;
  apiKeyClaude: string;
  apiKeyOpenAI: string;
  model: string;
  /** How many questions to process in parallel */
  concurrency: number;
  /** Milliseconds to wait between answering questions */
  delayBetweenAnswers: number;
}

// ─── Message Bus ─────────────────────────────────────────────────────────────

export type MessageType =
  | 'SCAN_PAGE'
  | 'SCAN_RESULT'
  | 'SCAN_STATUS'
  | 'SCAN_ERROR'
  | 'START_QUEUE'
  | 'PAUSE_QUEUE'
  | 'RESUME_QUEUE'
  | 'STOP_QUEUE'
  | 'QUESTION_UPDATE'
  | 'QUESTIONS_LOADED'
  | 'QUEUE_STARTED'
  | 'QUEUE_PAUSED'
  | 'QUEUE_RESUMED'
  | 'QUEUE_COMPLETE'
  | 'CLICK_ANSWER'
  | 'LOG'
  | 'ERROR';

export interface ExtensionMessage {
  type: MessageType;
  payload?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ─── Queue Stats (for UI) ────────────────────────────────────────────────────

export interface QueueStats {
  total: number;
  pending: number;
  answered: number;
  failed: number;
  skipped: number;
}
