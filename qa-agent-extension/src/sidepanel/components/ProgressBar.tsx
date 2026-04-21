interface Props {
  progress: number   // 0–100
  answered: number
  failed:   number
  total:    number
}

export default function ProgressBar({ progress, answered, failed, total }: Props) {
  return (
    <div className="px-4 py-2 shrink-0">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{answered} answered · {failed} failed · {total - answered - failed} remaining</span>
        <span className="font-mono">{progress}%</span>
      </div>
      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-600 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
