import {
  Combine, Split, FileMinus2, FileOutput, LayoutGrid, ScanLine,
  Minimize2, Wrench, ScanText,
  Image, FileText, Presentation, Sheet, Globe,
  FileImage, FileType, FileSpreadsheet, Archive,
  RotateCw, ListOrdered, Stamp, Crop, PenLine, TextCursorInput,
  Unlock, Lock, Signature, EyeOff, Columns2,
  Sparkles, Languages,
} from 'lucide-react'

/**
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name
 * @property {string} badge   Tailwind classes for the icon badge (full class names so Tailwind can find them)
 */

/**
 * @typedef {Object} Tool
 * @property {string} id            URL slug, e.g. "merge" -> /merge
 * @property {string} name
 * @property {string} category      Category id
 * @property {import('react').ComponentType<any>} icon
 * @property {string} description
 * @property {(() => Promise<{default: import('react').ComponentType}>) | null} load
 *           Lazy loader for the tool's UI. null = not built yet (shows "coming soon").
 * @property {string} [note]        Honest limitation shown on the tool page
 */

/** @type {Category[]} */
export const categories = [
  { id: 'organize', name: 'Organize PDF', badge: 'bg-orange-100 text-orange-600' },
  { id: 'optimize', name: 'Optimize PDF', badge: 'bg-lime-100 text-lime-700' },
  { id: 'to-pdf', name: 'Convert to PDF', badge: 'bg-amber-100 text-amber-600' },
  { id: 'from-pdf', name: 'Convert from PDF', badge: 'bg-sky-100 text-sky-600' },
  { id: 'edit', name: 'Edit PDF', badge: 'bg-fuchsia-100 text-fuchsia-700' },
  { id: 'security', name: 'PDF Security', badge: 'bg-indigo-100 text-indigo-600' },
  { id: 'intelligence', name: 'PDF Intelligence', badge: 'bg-violet-100 text-violet-600' },
]

/**
 * Master list of tools. To add a tool: add one entry here and point `load`
 * at its component. The home grid and routes update automatically.
 * @type {Tool[]}
 */
export const tools = [
  // Organize
  { id: 'merge', name: 'Merge PDF', category: 'organize', icon: Combine, description: 'Combine several PDFs into one, in the order you choose.', load: () => import('./merge/index.jsx') },
  { id: 'split', name: 'Split PDF', category: 'organize', icon: Split, description: 'Split a PDF by page ranges or into single pages.', load: () => import('./split/index.jsx') },
  { id: 'remove-pages', name: 'Remove pages', category: 'organize', icon: FileMinus2, description: 'Delete the pages you do not need.', load: () => import('./remove-pages/index.jsx') },
  { id: 'extract-pages', name: 'Extract pages', category: 'organize', icon: FileOutput, description: 'Pull selected pages out into a new PDF.', load: () => import('./extract-pages/index.jsx') },
  { id: 'organize', name: 'Organize PDF', category: 'organize', icon: LayoutGrid, description: 'Reorder, rotate and delete pages by dragging thumbnails.', load: () => import('./organize/index.jsx') },
  { id: 'scan-to-pdf', name: 'Scan to PDF', category: 'organize', icon: ScanLine, description: 'Turn camera photos or scans into a PDF.', load: null },

  // Optimize
  { id: 'compress', name: 'Compress PDF', category: 'optimize', icon: Minimize2, description: 'Reduce file size by compressing page images.', load: () => import('./compress/index.jsx'), note: 'Browser compression re-renders pages as images, so text may no longer be selectable.' },
  { id: 'repair', name: 'Repair PDF', category: 'optimize', icon: Wrench, description: 'Try to recover a damaged PDF.', load: null, note: 'Only mild corruption can be fixed in the browser.' },
  { id: 'ocr', name: 'OCR PDF', category: 'optimize', icon: ScanText, description: 'Make scanned PDFs searchable and selectable.', load: null },

  // Convert to PDF
  { id: 'jpg-to-pdf', name: 'JPG to PDF', category: 'to-pdf', icon: Image, description: 'Turn images into a PDF.', load: () => import('./jpg-to-pdf/index.jsx') },
  { id: 'word-to-pdf', name: 'Word to PDF', category: 'to-pdf', icon: FileText, description: 'Convert .docx files to PDF.', load: null, note: 'Layout fidelity is moderate for complex documents.' },
  { id: 'powerpoint-to-pdf', name: 'PowerPoint to PDF', category: 'to-pdf', icon: Presentation, description: 'Convert slides to PDF.', load: null, note: 'Not feasible to do well in the browser; skipped for now.' },
  { id: 'excel-to-pdf', name: 'Excel to PDF', category: 'to-pdf', icon: Sheet, description: 'Convert spreadsheets to PDF.', load: null, note: 'Basic tables only.' },
  { id: 'html-to-pdf', name: 'HTML to PDF', category: 'to-pdf', icon: Globe, description: 'Convert HTML pages to PDF.', load: null },

  // Convert from PDF
  { id: 'pdf-to-jpg', name: 'PDF to JPG', category: 'from-pdf', icon: FileImage, description: 'Export each page as an image.', load: () => import('./pdf-to-jpg/index.jsx') },
  { id: 'pdf-to-word', name: 'PDF to Word', category: 'from-pdf', icon: FileType, description: 'Extract text into an editable Word file.', load: () => import('./pdf-to-word/index.jsx'), note: 'Layout is not preserved; best for text-heavy files.' },
  { id: 'pdf-to-powerpoint', name: 'PDF to PowerPoint', category: 'from-pdf', icon: Presentation, description: 'Put each page on a slide.', load: null, note: 'Slides are page images, not editable text.' },
  { id: 'pdf-to-excel', name: 'PDF to Excel', category: 'from-pdf', icon: FileSpreadsheet, description: 'Extract tables into a spreadsheet.', load: null, note: 'Works only for clean, simple tables.' },
  { id: 'pdf-to-pdfa', name: 'PDF to PDF/A', category: 'from-pdf', icon: Archive, description: 'Convert to an archival PDF/A format.', load: null, note: 'Needs a heavy engine; may not pass strict validators.' },

  // Edit
  { id: 'rotate', name: 'Rotate PDF', category: 'edit', icon: RotateCw, description: 'Rotate all or selected pages.', load: null },
  { id: 'page-numbers', name: 'Add page numbers', category: 'edit', icon: ListOrdered, description: 'Stamp page numbers on every page.', load: () => import('./page-numbers/index.jsx') },
  { id: 'watermark', name: 'Add watermark', category: 'edit', icon: Stamp, description: 'Add a text or image watermark.', load: null },
  { id: 'crop', name: 'Crop PDF', category: 'edit', icon: Crop, description: 'Trim margins from your pages.', load: null },
  { id: 'edit', name: 'Edit PDF', category: 'edit', icon: PenLine, description: 'Add text, shapes and images on top of pages.', load: null, note: 'Existing text cannot be edited in place.' },
  { id: 'forms', name: 'PDF Forms', category: 'edit', icon: TextCursorInput, description: 'Fill in PDF form fields.', load: null },

  // Security
  { id: 'unlock', name: 'Unlock PDF', category: 'security', icon: Unlock, description: 'Remove a password you know from a PDF.', load: null },
  { id: 'protect', name: 'Protect PDF', category: 'security', icon: Lock, description: 'Add a password to a PDF.', load: null },
  { id: 'sign', name: 'Sign PDF', category: 'security', icon: Signature, description: 'Draw or type a signature and place it on a page.', load: null },
  { id: 'redact', name: 'Redact PDF', category: 'security', icon: EyeOff, description: 'Permanently black out sensitive content.', load: null },
  { id: 'compare', name: 'Compare PDF', category: 'security', icon: Columns2, description: 'See what changed between two PDFs.', load: null },

  // Intelligence (planned after v1)
  { id: 'summarize', name: 'AI Summarizer', category: 'intelligence', icon: Sparkles, description: 'Summarize a PDF.', load: null, note: 'Planned after v1 (needs an on-device or user-supplied model).' },
  { id: 'translate', name: 'Translate PDF', category: 'intelligence', icon: Languages, description: 'Translate a PDF into another language.', load: null, note: 'Planned after v1 (needs an on-device or user-supplied model).' },
]

export const getTool = (id) => tools.find((t) => t.id === id)
export const getCategory = (id) => categories.find((c) => c.id === id)
