import { Link } from 'react-router-dom'

/** @param {{ tool: import('../tools/registry.js').Tool, badge: string }} props */
export default function ToolCard({ tool, badge }) {
  const Icon = tool.icon
  return (
    <Link
      to={`/${tool.id}`}
      className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white hover:shadow-sm"
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${badge}`}>
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="font-medium text-slate-800">{tool.name}</span>
      {!tool.load && (
        <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-400">
          Soon
        </span>
      )}
    </Link>
  )
}
