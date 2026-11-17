import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import { loadPdfDocument } from '../../lib/pdf.js'
import { baseName } from '../../lib/files.js'

function calculateCoordinates({
  width,
  height,
  textWidth,
  textHeight,
  rotation = 0,
  position = 'bottom-right',
  margin = 36,
}) {
  const normRot = ((rotation % 360) + 360) % 360
  const [vPos, hPos] = position.split('-') // e.g. ['bottom', 'right']

  if (normRot === 0) {
    let x = margin
    if (hPos === 'center') x = (width - textWidth) / 2
    if (hPos === 'right') x = width - margin - textWidth

    let y = margin
    if (vPos === 'top') y = height - margin - textHeight

    return { x, y, rotate: 0 }
  }

  if (normRot === 90) {
    let y = margin
    if (hPos === 'center') y = (height - textWidth) / 2
    if (hPos === 'right') y = height - margin - textWidth

    let x = margin + textHeight
    if (vPos === 'top') x = width - margin

    return { x, y, rotate: -90 }
  }

  if (normRot === 180) {
    let x = width - margin
    if (hPos === 'center') x = (width + textWidth) / 2
    if (hPos === 'right') x = margin + textWidth

    let y = height - margin
    if (vPos === 'top') y = margin + textHeight

    return { x, y, rotate: 180 }
  }

  if (normRot === 270) {
    let y = height - margin
    if (hPos === 'center') y = (height + textWidth) / 2
    if (hPos === 'right') y = margin + textWidth

    let x = width - margin - textHeight
    if (vPos === 'top') x = margin

    return { x, y, rotate: 90 }
  }

  return { x: margin, y: margin, rotate: 0 }
}

/**
 * @typedef {Object} PageNumberOptions
 * @property {'bottom-right' | 'bottom-center' | 'bottom-left' | 'top-right' | 'top-center' | 'top-left'} [position]
 * @property {'page-n-of-total' | 'n-slash-total' | 'just-n' | 'dash-n-dash'} [format]
 * @property {string} [customTemplate]
 * @property {number} [startPage] - 1-based page index to start numbering
 * @property {number} [endPage] - 1-based page index to end numbering
 * @property {number} [firstNumber] - number value on the first numbered page (default: 1)
 * @property {boolean} [skipFirstPage] - skip page 1 (cover page)
 * @property {number} [fontSize] - font size in pt (e.g. 10, 12, 14)
 * @property {'helvetica' | 'times' | 'courier'} [fontFamily]
 * @property {'black' | 'dark-gray' | 'light-gray'} [color]
 * @property {number} [margin] - margin in pt
 */

/**
 * Add page numbers to a PDF document.
 * Pure logic: no DOM, runs in a Web Worker or in Node.
 *
 * @param {{
 *   file: { name: string, buffer: ArrayBuffer },
 *   options?: PageNumberOptions
 * }} payload
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{ files: { name: string, bytes: Uint8Array }[] }>}
 */
export async function addPageNumbersPdfBuffer({ file, options = {} }, onProgress = () => {}) {
  if (!file?.buffer) throw new Error('No PDF file provided.')

  const {
    position = 'bottom-right',
    format = 'page-n-of-total',
    customTemplate,
    startPage = 1,
    endPage,
    firstNumber = 1,
    skipFirstPage = false,
    fontSize = 12,
    fontFamily = 'helvetica',
    color = 'black',
    margin = 36,
  } = options

  const doc = await loadPdfDocument(file.buffer, file.name)
  const totalPages = doc.getPageCount()
  const base = baseName(file.name)

  const fontMap = {
    helvetica: StandardFonts.Helvetica,
    times: StandardFonts.TimesRoman,
    courier: StandardFonts.Courier,
  }
  const font = await doc.embedFont(fontMap[fontFamily] || StandardFonts.Helvetica)

  const colorMap = {
    black: rgb(0, 0, 0),
    'dark-gray': rgb(0.3, 0.3, 0.3),
    'light-gray': rgb(0.55, 0.55, 0.55),
  }
  const textColor = colorMap[color] || rgb(0, 0, 0)

  // Determine page range to number
  const effectiveStart = skipFirstPage ? Math.max(startPage, 2) : Math.max(startPage, 1)
  const effectiveEnd = Math.min(endPage || totalPages, totalPages)

  // Determine total pages count used in format string
  const totalCountForFormat = effectiveEnd - effectiveStart + 1

  for (let i = 0; i < totalPages; i++) {
    const pageNumber = i + 1
    const page = doc.getPage(i)

    if (pageNumber >= effectiveStart && pageNumber <= effectiveEnd) {
      const currentNumber = firstNumber + (pageNumber - effectiveStart)

      let text = `Page ${currentNumber} of ${totalCountForFormat}`
      if (format === 'n-slash-total') {
        text = `${currentNumber} / ${totalCountForFormat}`
      } else if (format === 'just-n') {
        text = `${currentNumber}`
      } else if (format === 'dash-n-dash') {
        text = `- ${currentNumber} -`
      } else if (customTemplate) {
        text = customTemplate
          .replace(/{n}/g, String(currentNumber))
          .replace(/{total}/g, String(totalCountForFormat))
      }

      const textWidth = font.widthOfTextAtSize(text, fontSize)
      const textHeight = font.heightAtSize(fontSize)
      const { width, height } = page.getSize()
      const rotation = page.getRotation().angle || 0

      const coords = calculateCoordinates({
        width,
        height,
        textWidth,
        textHeight,
        rotation,
        position,
        margin,
      })

      page.drawText(text, {
        x: coords.x,
        y: coords.y,
        size: fontSize,
        font,
        color: textColor,
        rotate: degrees(coords.rotate),
      })
    }

    onProgress(i + 1, totalPages)
  }

  const bytes = await doc.save()

  return {
    files: [
      {
        name: `${base}-numbered.pdf`,
        bytes,
      },
    ],
  }
}
