import { PDFDocument } from 'pdf-lib'

/**
 * Load a PDF with pdf-lib and turn the library's errors into messages a user can act on.
 * Safe to call from the main thread or from a worker.
 * @param {ArrayBuffer | Uint8Array} buffer
 * @param {string} [name] file name, used in error messages
 * @returns {Promise<PDFDocument>}
 */
export async function loadPdfDocument(buffer, name = 'This file') {
  try {
    return await PDFDocument.load(buffer)
  } catch (err) {
    const message = String(err?.message || '')
    if (err?.name === 'EncryptedPDFError' || /encrypted/i.test(message)) {
      throw new Error(`${name} is password-protected. Unlock it first.`, { cause: err })
    }
    throw new Error(`${name} could not be read. It may be damaged or not a real PDF.`, { cause: err })
  }
}

/**
 * Parse a page selection like "1-3, 5, 8-" into 0-based page indices.
 *  - "5"    -> page 5
 *  - "2-4"  -> pages 2, 3, 4
 *  - "8-"   -> page 8 to the last page
 * Order is kept as typed. Throws an Error with a friendly message if the input is invalid.
 * @param {string} input
 * @param {number} pageCount
 * @returns {number[]}
 */
export function parsePageRanges(input, pageCount) {
  const text = String(input ?? '').trim()
  if (!text) throw new Error('Enter at least one page or range, for example 1-3, 5.')

  const indices = []
  for (const part of text.split(',')) {
    const token = part.trim()
    if (!token) continue

    const match = /^(\d+)(?:\s*(-)\s*(\d*))?$/.exec(token)
    if (!match) throw new Error(`"${token}" is not a valid page or range.`)

    const start = Number(match[1])
    const hasDash = Boolean(match[2])
    const end = hasDash ? (match[3] === '' ? pageCount : Number(match[3])) : start

    if (start < 1 || end < 1 || start > pageCount || end > pageCount) {
      throw new Error(`"${token}" is outside this document (it has ${pageCount} pages).`)
    }
    if (start > end) throw new Error(`"${token}" is backwards. Write it as ${end}-${start}.`)

    for (let p = start; p <= end; p++) indices.push(p - 1)
  }

  if (indices.length === 0) throw new Error('Enter at least one page or range, for example 1-3, 5.')
  return indices
}
