import ErrorMessage from './ErrorMessage.jsx'

/**
 * Common panel every tool renders inside (the page title and icon come from ToolPage).
 * Shows an error banner above the tool's own content.
 */
export default function ToolLayout({ children, error, onDismissError }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <ErrorMessage message={error} onDismiss={onDismissError} />
      {children}
    </section>
  )
}
