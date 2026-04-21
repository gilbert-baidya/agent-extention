import { useState, useCallback } from 'react'
import type { AIProvider } from '../../types'

// ─── Available models per provider ───────────────────────────────────────────

const CLAUDE_MODELS = [
  { value: 'claude-opus-4-6',    label: 'Claude Opus 4.6 (most capable)' },
  { value: 'claude-sonnet-4-6',  label: 'Claude Sonnet 4.6 (recommended)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
]

const OPENAI_MODELS = [
  { value: 'gpt-5.2-chat-latest', label: 'GPT-5.2 Chat (recommended)' },
  { value: 'gpt-5.4',             label: 'GPT-5.4 (latest)' },
  { value: 'gpt-5.4-mini',        label: 'GPT-5.4 mini (fast)' },
  { value: 'gpt-4o',              label: 'GPT-4o (stable fallback)' },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  provider:      AIProvider
  apiKeyClaude:  string
  apiKeyOpenAI:  string
  model:         string
  concurrency:   number
  delay:         number
  onProviderChange:    (v: AIProvider) => void
  onApiKeyClaudeChange:(v: string) => void
  onApiKeyOpenAIChange:(v: string) => void
  onModelChange:       (v: string) => void
  onConcurrencyChange: (v: number) => void
  onDelayChange:       (v: number) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Settings({
  provider, apiKeyClaude, apiKeyOpenAI, model,
  concurrency, delay,
  onProviderChange, onApiKeyClaudeChange, onApiKeyOpenAIChange,
  onModelChange, onConcurrencyChange, onDelayChange,
}: Props) {
  const [showClaude, setShowClaude]       = useState(false)
  const [showOpenAI, setShowOpenAI]       = useState(false)
  const [open, setOpen]                   = useState(true)
  const [savedClaude, setSavedClaude]     = useState(false)
  const [savedOpenAI, setSavedOpenAI]     = useState(false)

  // Show "Saved ✓" for 2 seconds after key changes
  const handleClaudeKey = useCallback((v: string) => {
    onApiKeyClaudeChange(v)
    if (v.length > 10) {
      setSavedClaude(true)
      setTimeout(() => setSavedClaude(false), 2000)
    }
  }, [onApiKeyClaudeChange])

  const handleOpenAIKey = useCallback((v: string) => {
    onApiKeyOpenAIChange(v)
    if (v.length > 10) {
      setSavedOpenAI(true)
      setTimeout(() => setSavedOpenAI(false), 2000)
    }
  }, [onApiKeyOpenAIChange])

  const models = provider === 'openai' ? OPENAI_MODELS : CLAUDE_MODELS

  // When provider changes, auto-select the first model for that provider
  function handleProviderChange(p: AIProvider) {
    onProviderChange(p)
    const defaultModel = p === 'openai' ? 'gpt-5.2-chat-latest' : 'claude-sonnet-4-6'
    onModelChange(defaultModel)
  }

  return (
    <div className="shrink-0 border-b border-gray-800">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2 text-xs text-gray-400 hover:text-gray-200 transition-colors"
      >
        <span className="uppercase tracking-widest">Settings</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-3 flex flex-col gap-3">

          {/* ── Provider Toggle ── */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">AI Provider</label>
            <div className="flex rounded overflow-hidden border border-gray-700">
              <button
                onClick={() => handleProviderChange('claude')}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                  provider === 'claude'
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                ✦ Claude
              </button>
              <button
                onClick={() => handleProviderChange('openai')}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                  provider === 'openai'
                    ? 'bg-green-700 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                ◎ OpenAI
              </button>
            </div>
          </div>

          {/* ── Claude API Key ── */}
          <div className={provider === 'openai' ? 'opacity-50' : ''}>
            <label className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              Claude API Key
              {provider === 'openai'
                ? <span className="text-gray-600">(inactive)</span>
                : savedClaude && <span className="text-green-400 font-medium">✓ Saved</span>
              }
            </label>
            <div className="flex gap-1">
              <input
                type={showClaude ? 'text' : 'password'}
                value={apiKeyClaude}
                onChange={(e) => handleClaudeKey(e.target.value)}
                placeholder="sk-ant-…"
                disabled={provider === 'openai'}
                className="flex-1 bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5 border border-gray-700 focus:border-brand-500 focus:outline-none disabled:cursor-not-allowed"
              />
              <button onClick={() => setShowClaude(!showClaude)}
                className="text-xs px-2 py-1.5 bg-gray-700 rounded hover:bg-gray-600 transition-colors">
                {showClaude ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {/* ── OpenAI API Key ── */}
          <div className={provider === 'claude' ? 'opacity-50' : ''}>
            <label className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              OpenAI API Key
              {provider === 'claude'
                ? <span className="text-gray-600">(inactive)</span>
                : savedOpenAI && <span className="text-green-400 font-medium">✓ Saved</span>
              }
            </label>
            <div className="flex gap-1">
              <input
                type={showOpenAI ? 'text' : 'password'}
                value={apiKeyOpenAI}
                onChange={(e) => handleOpenAIKey(e.target.value)}
                placeholder="sk-…"
                disabled={provider === 'claude'}
                className="flex-1 bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5 border border-gray-700 focus:border-green-500 focus:outline-none disabled:cursor-not-allowed"
              />
              <button onClick={() => setShowOpenAI(!showOpenAI)}
                className="text-xs px-2 py-1.5 bg-gray-700 rounded hover:bg-gray-600 transition-colors">
                {showOpenAI ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {/* ── Model Selector ── */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Model</label>
            <select
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              className="w-full bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5 border border-gray-700 focus:outline-none focus:border-brand-500"
            >
              {models.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-600 mt-0.5">
              Keys stored locally only — never sent to our servers.
            </p>
          </div>

          {/* ── Concurrency ── */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Parallel workers: <span className="text-gray-300">{concurrency}</span>
            </label>
            <input
              type="range" min={1} max={10} value={concurrency}
              onChange={(e) => onConcurrencyChange(Number(e.target.value))}
              className="w-full accent-brand-500"
            />
            <div className="flex justify-between text-xs text-gray-600">
              <span>1 (safe)</span><span>10 (fast)</span>
            </div>
          </div>

          {/* ── Delay ── */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Delay between answers: <span className="text-gray-300">{delay}ms</span>
            </label>
            <input
              type="range" min={200} max={3000} step={100} value={delay}
              onChange={(e) => onDelayChange(Number(e.target.value))}
              className="w-full accent-brand-500"
            />
            <div className="flex justify-between text-xs text-gray-600">
              <span>200ms</span><span>3s</span>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
