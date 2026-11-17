import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// pdf.js does its parsing in its own worker; Vite gives us the bundled file's URL.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/**
 * Open a PDF with pdf.js. Always call `await close()` when finished, to free its memory.
 * Note: pdf.js takes ownership of `data`'s buffer, so pass a fresh copy.
 * @param {Uint8Array} data
 * @returns {Promise<{ pdf: import('pdfjs-dist').PDFDocumentProxy, close: () => Promise<void> }>}
 */
export async function openPdf(data) {
  const task = pdfjsLib.getDocument({ data })
  try {
    const pdf = await task.promise
    return { pdf, close: () => task.destroy() }
  } catch (err) {
    await task.destroy()
    throw err
  }
}

/**
 * Render one pdf.js page into a new canvas that is `maxWidth` CSS pixels wide.
 * The caller should set canvas.width = canvas.height = 0 when done to free memory.
 */
export async function renderPageToCanvas(page, { maxWidth = 160 } = {}) {
  const base = page.getViewport({ scale: 1 })
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const viewport = page.getViewport({ scale: (maxWidth / base.width) * dpr })

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  await page.render({ canvas, viewport }).promise
  return canvas
}

export function canvasToBlobUrl(canvas, type = 'image/jpeg', quality = 0.8) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('Could not create image'))),
      type,
      quality,
    )
  })
}

/**
 * Render a small thumbnail of one page. Never rejects.
 * The caller owns `url` and must call URL.revokeObjectURL(url) when done.
 * @param {File} file
 * @returns {Promise<{ status: 'ready' | 'locked' | 'error', url: string | null, pageCount: number | null }>}
 */
export async function renderThumbnail(file, { pageNumber = 1, maxWidth = 96 } = {}) {
  let doc
  try {
    const data = new Uint8Array(await file.arrayBuffer())
    doc = await openPdf(data)
    const { pdf } = doc
    const page = await pdf.getPage(pageNumber)
    const canvas = await renderPageToCanvas(page, { maxWidth })
    const url = await canvasToBlobUrl(canvas)
    canvas.width = canvas.height = 0
    page.cleanup()
    return { status: 'ready', url, pageCount: pdf.numPages }
  } catch (err) {
    if (err?.name === 'PasswordException') return { status: 'locked', url: null, pageCount: null }
    return { status: 'error', url: null, pageCount: null }
  } finally {
    await doc?.close()
  }
}

/**
 * Render thumbnails for all pages in a PDF document sequentially.
 * Calls `onPageRendered(pageNumber, totalPages, url)` after each page so the UI can update progressively.
 * @param {File} file
 * @param {{ maxWidth?: number, onPageRendered?: (page: number, total: number, url: string) => void, signal?: AbortSignal }} [options]
 * @returns {Promise<{ status: 'ready' | 'locked' | 'error' | 'aborted', totalPages: number | null, thumbnails: string[], error?: string }>}
 */
export async function renderAllThumbnails(file, { maxWidth = 160, onPageRendered, signal } = {}) {
  let doc
  const createdUrls = []
  try {
    const data = new Uint8Array(await file.arrayBuffer())
    if (signal?.aborted) return { status: 'aborted', totalPages: null, thumbnails: [] }
    doc = await openPdf(data)
    const { pdf } = doc
    const totalPages = pdf.numPages
    const thumbnails = []

    for (let p = 1; p <= totalPages; p++) {
      if (signal?.aborted) break
      const page = await pdf.getPage(p)
      const canvas = await renderPageToCanvas(page, { maxWidth })
      const url = await canvasToBlobUrl(canvas)
      canvas.width = canvas.height = 0
      page.cleanup()
      createdUrls.push(url)
      thumbnails.push(url)
      onPageRendered?.(p, totalPages, url)
    }

    if (signal?.aborted) {
      createdUrls.forEach((u) => URL.revokeObjectURL(u))
      return { status: 'aborted', totalPages: null, thumbnails: [] }
    }

    return { status: 'ready', totalPages, thumbnails }
  } catch (err) {
    createdUrls.forEach((u) => URL.revokeObjectURL(u))
    if (err?.name === 'PasswordException') return { status: 'locked', totalPages: null, thumbnails: [] }
    return { status: 'error', error: err?.message || 'Could not render pages', totalPages: null, thumbnails: [] }
  } finally {
    await doc?.close()
  }
}

/**
 * Render a pdf.js page at high resolution to a Blob (JPEG or PNG).
 * Fills white background for JPEG so transparent PDF pages do not turn black.
 * @param {import('pdfjs-dist').PDFPageProxy} page
 * @param {{ scale?: number, type?: 'image/jpeg' | 'image/png', quality?: number }} [options]
 * @returns {Promise<Blob>}
 */
export async function renderPageToBlob(page, { scale = 2.0, type = 'image/jpeg', quality = 0.92 } = {}) {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)

  if (type === 'image/jpeg') {
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
  }

  await page.render({ canvas, viewport }).promise

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to create image blob'))),
      type,
      quality,
    )
  })

  canvas.width = canvas.height = 0
  return blob
}
