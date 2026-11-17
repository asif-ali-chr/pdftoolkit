import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-slate-600">That tool does not exist.</p>
      <Link to="/" className="mt-6 inline-block text-orange-600 hover:underline">
        Back to all tools
      </Link>
    </div>
  )
}
