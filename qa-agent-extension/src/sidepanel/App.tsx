import { useEffect, useReducer, useRef, useCallback } from 'react'
import type { MCQQuestion, ExtensionMessage, AIProvider } from '../types'
import ProgressBar  from './components/ProgressBar'
import QuestionList from './components/QuestionList'
import Settings     from './components/Settings'

// ─── State ────────────────────────────────────────────────────────────────────

type RunState = 'idle' | 'scanning' | 'scanned' | 'running' | 'paused' | 'done'

interface AppState {
  questions:    MCQQuestion[]
  runState:     RunState
  provider:     AIProvider
  apiKeyClaude: string
  apiKeyOpenAI: string
  model:        string
  concurrency:  number
  delay:        number
  log:          string[]
}

type Action =
  | { type: 'SET_PROVIDER';       provider: AIProvider }
  | { type: 'SET_API_KEY_CLAUDE'; value: string }
  | { type: 'SET_API_KEY_OPENAI'; value: string }
  | { type: 'SET_MODEL';          value: string }
  | { type: 'SET_CONCURRENCY';    value: number }
  | { type: 'SET_DELAY';          value: number }
  | { type: 'SCANNING' }
  | { type: 'QUESTIONS_LOADED';   questions: MCQQuestion[] }
  | { type: 'SCAN_ERROR';         msg: string }
  | { type: 'QUEUE_STARTED' }
  | { type: 'QUEUE_PAUSED' }
  | { type: 'QUEUE_RESUMED' }
  | { type: 'QUEUE_COMPLETE'; answered: number; failed: number; total: number }
  | { type: 'QUESTION_UPDATE'; question: MCQQuestion }
  | { type: 'LOG'; msg: string }
  | { type: 'RESET' }

const initialState: AppState = {
  questions:    [],
  runState:     'idle',
  provider:     'claude',
  apiKeyClaude: '',
  apiKeyOpenAI: '',
  model:        'claude-sonnet-4-6',
  concurrency:  3,
  delay:        800,
  log:          [],
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_PROVIDER':
      return { ...state, provider: action.provider }
    case 'SET_API_KEY_CLAUDE':
      return { ...state, apiKeyClaude: action.value }
    case 'SET_API_KEY_OPENAI':
      return { ...state, apiKeyOpenAI: action.value }
    case 'SET_MODEL':
      return { ...state, model: action.value }
    case 'SET_CONCURRENCY':
      return { ...state, concurrency: action.value }
    case 'SET_DELAY':
      return { ...state, delay: action.value }
    case 'SCANNING':
      return { ...state, runState: 'scanning', log: [...state.log, '⟳ Scanning page for questions…'] }
    case 'QUESTIONS_LOADED':
      return { ...state, questions: action.questions, runState: 'scanned',
               log: [...state.log, `✓ Found ${action.questions.length} questions`] }
    case 'SCAN_ERROR':
      return { ...state, runState: 'idle', log: [...state.log, action.msg] }
    case 'QUEUE_STARTED':
      return { ...state, runState: 'running', log: [...state.log, '▶ Queue started'] }
    case 'QUEUE_PAUSED':
      return { ...state, runState: 'paused',  log: [...state.log, '⏸ Paused'] }
    case 'QUEUE_RESUMED':
      return { ...state, runState: 'running', log: [...state.log, '▶ Resumed'] }
    case 'QUEUE_COMPLETE':
      return { ...state, runState: 'done',
               log: [...state.log,
                     `✓ Complete — ${action.answered}/${action.total} answered, ${action.failed} failed`] }
    case 'QUESTION_UPDATE':
      return {
        ...state,
        questions: state.questions.map((q) =>
          q.id === action.question.id ? { ...q, ...action.question } : q,
        ),
      }
    case 'LOG':
      return { ...state, log: [...state.log, action.msg] }
    case 'RESET':
      return { ...initialState, apiKeyClaude: state.apiKeyClaude, apiKeyOpenAI: state.apiKeyOpenAI }
    default:
      return state
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Restore keys from chrome.storage on first render
  useEffect(() => {
    chrome.storage.local.get(['apiKeyClaude', 'apiKeyOpenAI', 'provider', 'model'], (result) => {
      if (result.apiKeyClaude) dispatch({ type: 'SET_API_KEY_CLAUDE', value: result.apiKeyClaude })
      if (result.apiKeyOpenAI) dispatch({ type: 'SET_API_KEY_OPENAI', value: result.apiKeyOpenAI })
      if (result.provider)     dispatch({ type: 'SET_PROVIDER', provider: result.provider })
      if (result.model)        dispatch({ type: 'SET_MODEL', value: result.model })
    })
  }, [])

  // Persist keys + provider whenever they change
  useEffect(() => {
    chrome.storage.local.set({
      apiKeyClaude: state.apiKeyClaude,
      apiKeyOpenAI: state.apiKeyOpenAI,
      provider:     state.provider,
      model:        state.model,
    })
  }, [state.apiKeyClaude, state.apiKeyOpenAI, state.provider, state.model])

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state.log])

  // Listen for background messages
  useEffect(() => {
    const handler = (message: ExtensionMessage) => {
      switch (message.type) {
        case 'LOG':
        case 'SCAN_STATUS':
          dispatch({ type: 'LOG', msg: message.payload.msg }); break
        case 'SCAN_ERROR':
          dispatch({ type: 'SCAN_ERROR', msg: message.payload.msg }); break
        case 'QUESTIONS_LOADED':
          dispatch({ type: 'QUESTIONS_LOADED', questions: message.payload.questions }); break
        case 'QUEUE_STARTED':
          dispatch({ type: 'QUEUE_STARTED' }); break
        case 'QUEUE_PAUSED':
          dispatch({ type: 'QUEUE_PAUSED' }); break
        case 'QUEUE_RESUMED':
          dispatch({ type: 'QUEUE_RESUMED' }); break
        case 'QUEUE_COMPLETE':
          dispatch({ type: 'QUEUE_COMPLETE', ...message.payload }); break
        case 'QUESTION_UPDATE':
          dispatch({ type: 'QUESTION_UPDATE', question: message.payload.question }); break
        default: break
      }
    }
    chrome.runtime.onMessage.addListener(handler)
    return () => chrome.runtime.onMessage.removeListener(handler)
  }, [])

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleScan = useCallback(() => {
    dispatch({ type: 'SCANNING' })
    chrome.runtime.sendMessage({ type: 'SCAN_PAGE' })
  }, [])

  const handleStart = useCallback(async () => {
    // Strip invisible Unicode characters that break HTTP header encoding
    const cleanKey = (k: string) => k.replace(/[^\x20-\xFF]/g, '').trim()
    const activeKey = cleanKey(state.provider === 'openai' ? state.apiKeyOpenAI : state.apiKeyClaude)
    if (!activeKey) {
      const providerLabel = state.provider === 'openai' ? 'OpenAI' : 'Claude'
      dispatch({ type: 'LOG', msg: `✗ Please enter your ${providerLabel} API key first.` })
      return
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    dispatch({ type: 'LOG', msg: `▶ Starting with ${state.provider} / ${state.model}` })
    chrome.runtime.sendMessage({
      type: 'START_QUEUE',
      payload: {
        provider:           state.provider,
        apiKeyClaude:       cleanKey(state.apiKeyClaude),
        apiKeyOpenAI:       cleanKey(state.apiKeyOpenAI),
        model:              state.model,
        tabId:              tab?.id,
        concurrency:        state.concurrency,
        delayBetweenAnswers: state.delay,
      },
    })
  }, [state])

  const handlePause  = useCallback(() => chrome.runtime.sendMessage({ type: 'PAUSE_QUEUE' }), [])
  const handleResume = useCallback(() => chrome.runtime.sendMessage({ type: 'RESUME_QUEUE' }), [])
  const handleStop   = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'STOP_QUEUE' })
    dispatch({ type: 'LOG', msg: '■ Stopped by user' })
  }, [])

  // ── Derived stats ────────────────────────────────────────────────────────────
  const total    = state.questions.length
  const answered = state.questions.filter((q) => q.status === 'answered').length
  const failed   = state.questions.filter((q) => q.status === 'failed').length
  const progress = total > 0 ? Math.round(((answered + failed) / total) * 100) : 0

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 text-sm font-sans">

      {/* Header */}
      <header className="flex items-center gap-2 px-4 py-3 bg-brand-900 border-b border-brand-700 shrink-0">
        <div className="w-6 h-6 rounded bg-brand-600 flex items-center justify-center text-xs font-bold">Q</div>
        <span className="font-semibold tracking-wide text-brand-100">QA Agent</span>
        <span className="ml-auto text-xs text-brand-300 capitalize">{state.provider} · {state.model}</span>
      </header>

      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Settings */}
        <Settings
          provider={state.provider}
          apiKeyClaude={state.apiKeyClaude}
          apiKeyOpenAI={state.apiKeyOpenAI}
          model={state.model}
          concurrency={state.concurrency}
          delay={state.delay}
          onProviderChange={(v) => dispatch({ type: 'SET_PROVIDER', provider: v })}
          onApiKeyClaudeChange={(v) => dispatch({ type: 'SET_API_KEY_CLAUDE', value: v })}
          onApiKeyOpenAIChange={(v) => dispatch({ type: 'SET_API_KEY_OPENAI', value: v })}
          onModelChange={(v) => dispatch({ type: 'SET_MODEL', value: v })}
          onConcurrencyChange={(v) => dispatch({ type: 'SET_CONCURRENCY', value: v })}
          onDelayChange={(v) => dispatch({ type: 'SET_DELAY', value: v })}
        />

        {/* Progress bar */}
        {total > 0 && (
          <ProgressBar progress={progress} answered={answered} failed={failed} total={total} />
        )}

        {/* Control buttons */}
        <div className="flex gap-2 px-4 py-2 shrink-0 flex-wrap">
          <button
            onClick={handleScan}
            disabled={state.runState === 'running' || state.runState === 'scanning'}
            className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-xs font-medium transition-colors"
          >
            {state.runState === 'scanning' ? '⟳ Scanning…' : '🔍 Scan Page'}
          </button>

          {(state.runState === 'scanned' || state.runState === 'idle' || state.runState === 'scanning') && (
            <button
              onClick={handleStart}
              disabled={state.questions.length === 0}
              className="px-3 py-1.5 rounded bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-xs font-medium transition-colors"
            >
              ▶ Start
            </button>
          )}

          {state.runState === 'running' && (
            <>
              <button onClick={handlePause}
                className="px-3 py-1.5 rounded bg-yellow-600 hover:bg-yellow-500 text-xs font-medium transition-colors">
                ⏸ Pause
              </button>
              <button onClick={handleStop}
                className="px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-xs font-medium transition-colors">
                ■ Stop
              </button>
            </>
          )}

          {state.runState === 'paused' && (
            <button onClick={handleResume}
              className="px-3 py-1.5 rounded bg-brand-600 hover:bg-brand-500 text-xs font-medium transition-colors">
              ▶ Resume
            </button>
          )}

          {(state.runState === 'done' || state.runState === 'paused') && (
            <button onClick={() => dispatch({ type: 'RESET' })}
              className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-xs font-medium transition-colors">
              ↺ Reset
            </button>
          )}
        </div>

        {/* Question list */}
        <QuestionList questions={state.questions} />

        {/* Activity log */}
        <div className="shrink-0 border-t border-gray-800 bg-gray-900 px-4 py-2 max-h-48 overflow-y-auto qa-scroll">
          <p className="text-xs text-gray-500 mb-1 uppercase tracking-widest">Log</p>
          {state.log.map((entry, i) => (
            <p key={i} className="text-xs text-gray-400 leading-5">{entry}</p>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  )
}
