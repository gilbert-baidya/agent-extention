import type { MCQQuestion, QuestionStatus } from '../../types'

interface Props {
  questions: MCQQuestion[]
}

const STATUS_CONFIG: Record<QuestionStatus, { icon: string; color: string; label: string }> = {
  pending:    { icon: '○', color: 'text-gray-500',  label: 'Pending' },
  answering:  { icon: '⟳', color: 'text-blue-400',  label: 'Answering…' },
  researching:{ icon: '🔗', color: 'text-purple-400',label: 'Researching…' },
  answered:   { icon: '✓', color: 'text-green-400', label: 'Answered' },
  failed:     { icon: '✗', color: 'text-red-400',   label: 'Failed' },
  skipped:    { icon: '–', color: 'text-gray-500',  label: 'Skipped' },
}

function QuestionItem({ q }: { q: MCQQuestion }) {
  const cfg = STATUS_CONFIG[q.status]
  return (
    <div className="px-4 py-2 border-b border-gray-800 hover:bg-gray-900 transition-colors">
      <div className="flex items-start gap-2">
        <span className={`${cfg.color} font-mono text-xs mt-0.5 shrink-0 w-4 text-center`}>
          {cfg.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-300 leading-4 truncate" title={q.text}>
            <span className="text-gray-500 mr-1">Q{q.index + 1}.</span>
            {q.text}
          </p>
          {q.status === 'answered' && q.selectedAnswer && (
            <p className="text-xs text-green-400 mt-0.5">
              → {q.selectedAnswer}
              {q.confidence !== undefined && (
                <span className="text-gray-500 ml-1">
                  ({Math.round(q.confidence * 100)}% confidence)
                </span>
              )}
            </p>
          )}
          {q.status === 'failed' && q.error && (
            <p className="text-xs text-red-400 mt-0.5 truncate" title={q.error}>
              {q.error}
            </p>
          )}
          {q.referenceUrl && (
            <p className="text-xs mt-0.5 truncate"
               title={q.referenceUrl}
               style={{ color: q.status === 'researching' ? '#c084fc' : '#6b7280' }}>
              🔗 {q.status === 'researching' ? 'Reading: ' : ''}{q.referenceUrl}
            </p>
          )}
          {!q.referenceUrl && q.status === 'pending' && (
            <p className="text-xs text-gray-600 mt-0.5">No reference link detected</p>
          )}
        </div>
        <span className={`text-xs ${cfg.color} shrink-0`}>{cfg.label}</span>
      </div>
    </div>
  )
}

export default function QuestionList({ questions }: Props) {
  if (questions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 text-xs">
        Click "Scan Page" to detect MCQ questions
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto qa-scroll">
      {questions.map((q) => (
        <QuestionItem key={q.id} q={q} />
      ))}
    </div>
  )
}
