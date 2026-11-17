import { PDFDocument } from 'pdf-lib'
import { loadPdfDocument } from '../../lib/pdf.js'

/**
 * Merge PDFs in the order given. Pure logic: no DOM, so it runs in a worker or in Node tests.
 * @param {{ name: string, buffer: ArrayBuffer }[]} files
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<Uint8Array>}
 */
export async function mergePdfBuffers(files, onProgress = () => {}) {
  if (files.length < 2) throw new Error('Choose at least two PDF files to merge.')

  const out = await PDFDocument.create()
  out.setProducer('PDF Toolkit')
  out.setCreator('PDF Toolkit')

  for (let i = 0; i < files.length; i++) {
    const { name, buffer } = files[i]
    const source = await loadPdfDocument(buffer, name)
    const pages = await out.copyPages(source, source.getPageIndices())
    pages.forEach((page) => out.addPage(page))
    onProgress(i + 1, files.length)
  }

  return out.save()
}
