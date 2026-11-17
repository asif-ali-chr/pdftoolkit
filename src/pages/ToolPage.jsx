import { lazy, Suspense } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { tools, getTool, getCategory } from '../tools/registry.js'
import NotFound from './NotFound.jsx'

// Created once at module level: each tool's code is split into its own chunk
// and is only downloaded when that tool's page is opened.
const lazyComponents = Object.fromEntries(
  tools.filter((t) => t.load).map((t) => [t.id, lazy(t.load)]),
)

function ComingSoon({ tool }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-lg font-semibold text-slate-700">This tool is coming soon</p>
      <p className="mt-1 text-sm text-slate-500">The page, route and registry entry are ready; the tool itself is built in a later step.</p>
      {tool.note && <p className="mt-4 text-sm text-amber-700">Note: {tool.note}</p>}
    </div>
  )
}

export default function ToolPage() {
  const { toolId } = useParams()
  const tool = getTool(toolId)
  if (!tool) return <NotFound />

  const category = getCategory(tool.category)
  const Icon = tool.icon
  const ToolUI = lazyComponents[tool.id]

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} aria-hidden="true" /> All tools
      </Link>
      <div className="mb-6 flex items-center gap-3">
        <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${category.badge}`}>
          <Icon size={24} aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{tool.name}</h1>
          <p className="text-slate-600">{tool.description}</p>
        </div>
      </div>

      {ToolUI ? (
        <Suspense fallback={<p className="text-slate-500">Loading tool...</p>}>
          <ToolUI />
        </Suspense>
      ) : (
        <ComingSoon tool={tool} />
      )}
    </div>
  )
}
