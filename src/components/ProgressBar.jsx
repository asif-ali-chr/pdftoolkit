import { X } from 'lucide-react'

/**
 * @param {{ done: number, total: number, label?: string, onCancel?: () => void }} props
 */
export default function ProgressBar({ done, total, label = 'Working...', onCancel }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">
          {label} {total > 0 && <span className="text-slate-500">({done} of {total})</span>}
        </span>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <X size={14} aria-hidden="true" /> Cancel
          </button>
        )}
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 overflow-hidden rounded-full bg-slate-200"
      >
        <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
