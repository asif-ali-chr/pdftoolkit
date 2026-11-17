import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { categories, tools } from '../tools/registry.js'
import ToolCard from '../components/ToolCard.jsx'

export default function Home() {
  const [query, setQuery] = useState('')

  // Group tools by category, keeping only tools that match the search.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return categories
      .map((category) => ({
        category,
        items: tools.filter(
          (t) =>
            t.category === category.id &&
            (!q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)),
        ),
      }))
      .filter((g) => g.items.length > 0)
  }, [query])

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">Every PDF tool, right in your browser</h1>
        <p className="mt-2 text-slate-600">Free, private and works offline. Nothing is uploaded.</p>
        <div className="relative mx-auto mt-6 max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools (e.g. merge, compress)"
            aria-label="Search tools"
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-center text-slate-500">No tools match "{query}".</p>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {groups.map(({ category, items }) => (
            <section key={category.id}>
              <h2 className="mb-2 px-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {category.name}
              </h2>
              <div className="flex flex-col">
                {items.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} badge={category.badge} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
