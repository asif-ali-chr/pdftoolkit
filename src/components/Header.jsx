import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'

export default function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
        <Link to="/" className="text-xl font-bold tracking-tight text-slate-900">
          PDF<span className="text-orange-600">Toolkit</span>
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          <ShieldCheck size={14} aria-hidden="true" />
          Files never leave your device
        </span>
      </div>
    </header>
  )
}
