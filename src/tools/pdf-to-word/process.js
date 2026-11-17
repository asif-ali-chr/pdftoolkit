import JSZip from 'jszip'
import { openPdf } from '../../lib/render.js'
import { baseName } from '../../lib/files.js'

/**
 * Escape XML special characters.
 */
function escapeXml(unsafe) {
  return (unsafe || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '&':
        return '&amp;'
      case "'":
        return '&apos;'
      case '"':
        return '&quot;'
      default:
        return c
    }
  })
}

/**
 * Calculate visual brightness of a 6-character hex color (0 - 255).
 */
function getColorBrightness(hex) {
  if (!hex) return 0
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return 0
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000
}

/**
 * Check if a cell string represents a number, currency, or percentage.
 */
function isNumericCell(str) {
  if (!str) return false
  const clean = str.trim().replace(/,/g, '')
  return /^[$€£¥₹]?\s*[-+]?\d+(\.\d+)?%?$/.test(clean)
}

/**
 * Clean up raw PDF font names (e.g. "ABCDEF+Helvetica-BoldMT") into standard desktop font families.
 */
function cleanFontName(raw, fallback = 'Calibri') {
  if (!raw) return { name: fallback, isBold: false, isItalic: false }
  let name = String(raw).replace(/^[A-Z]{6}\+/, '') // strip subset prefix ABCDEF+

  const isBold = /bold|black|heavy|700|800|900/i.test(name)
  const isItalic = /italic|oblique/i.test(name)

  name = name
    .replace(/[-_]?(bold|italic|oblique|regular|mt|ps|roman|semibold|medium|light)/gi, '')
    .trim()
  name = name.replace(/([a-z])([A-Z])/g, '$1 $2') // CamelCase to spaced

  if (/helvetica/i.test(name)) name = 'Arial'
  else if (/times/i.test(name)) name = 'Times New Roman'
  else if (/courier/i.test(name)) name = 'Courier New'
  else if (/arial/i.test(name)) name = 'Arial'
  else if (/calibri/i.test(name)) name = 'Calibri'
  else if (/cambria/i.test(name)) name = 'Cambria'
  else if (/georgia/i.test(name)) name = 'Georgia'
  else if (/verdana/i.test(name)) name = 'Verdana'
  else if (/tahoma/i.test(name)) name = 'Tahoma'
  else if (/trebuchet/i.test(name)) name = 'Trebuchet MS'
  else if (/garamond/i.test(name)) name = 'Garamond'
  else if (/segoe/i.test(name)) name = 'Segoe UI'
  else if (/roboto/i.test(name)) name = 'Roboto'
  else if (/opensans/i.test(name)) name = 'Open Sans'
  else if (/lato/i.test(name)) name = 'Lato'
  else if (/montserrat/i.test(name)) name = 'Montserrat'
  else if (/consolas/i.test(name)) name = 'Consolas'

  return { name: name || fallback, isBold, isItalic }
}

/**
 * Extract sequential text colors from PDF.js operator stream.
 */
function extractPageColors(ops) {
  if (!ops || !ops.fnArray) return []
  const textColors = []
  let currentColor = '#000000'

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    const args = ops.argsArray[i]

    // Color setting opcodes (RGB: 59, Gray: 57, CMYK: 61, Color: 54, 55)
    if ((fn === 59 || fn === 57 || fn === 61 || fn === 54 || fn === 55) && args && typeof args[0] === 'string') {
      currentColor = args[0]
    }

    // Text show opcodes (showText: 44, showSpacedText: 45)
    if (fn === 44 || fn === 45) {
      textColors.push(currentColor)
    }
  }

  return textColors
}

/**
 * Segment horizontal text items into distinct column cells based on gutters.
 */
function extractLineCells(lineItems) {
  if (lineItems.length === 0) return []
  lineItems.sort((a, b) => a.x - b.x)

  const cells = []
  let currentCell = {
    text: lineItems[0].text,
    x: lineItems[0].x,
    maxX: lineItems[0].x + lineItems[0].width,
    fontSize: lineItems[0].fontSize,
    fontFamily: lineItems[0].fontFamily,
    isBold: lineItems[0].isBold,
    isItalic: lineItems[0].isItalic,
    color: lineItems[0].color,
  }

  for (let i = 1; i < lineItems.length; i++) {
    const it = lineItems[i]
    const gap = it.x - currentCell.maxX

    // Column gutters in PDF tables are typically > 20pt or > 2.0x font size
    if (gap > Math.max(20, currentCell.fontSize * 2.0)) {
      cells.push({
        text: currentCell.text.trim(),
        x: currentCell.x,
        maxX: currentCell.maxX,
        fontSize: currentCell.fontSize,
        fontFamily: currentCell.fontFamily,
        isBold: currentCell.isBold,
        isItalic: currentCell.isItalic,
        color: currentCell.color,
      })
      currentCell = {
        text: it.text,
        x: it.x,
        maxX: it.x + it.width,
        fontSize: it.fontSize,
        fontFamily: it.fontFamily,
        isBold: it.isBold,
        isItalic: it.isItalic,
        color: it.color,
      }
    } else {
      const needsSpace = gap > 1.5 && !currentCell.text.endsWith(' ') && !it.text.startsWith(' ')
      currentCell.text += (needsSpace ? ' ' : '') + it.text
      currentCell.maxX = Math.max(currentCell.maxX, it.x + it.width)
      currentCell.fontSize = Math.max(currentCell.fontSize, it.fontSize)
      if (it.isBold) currentCell.isBold = true
      if (it.isItalic) currentCell.isItalic = true
      if (it.color && it.color !== '000000') currentCell.color = it.color
    }
  }

  cells.push({
    text: currentCell.text.trim(),
    x: currentCell.x,
    maxX: currentCell.maxX,
    fontSize: currentCell.fontSize,
    fontFamily: currentCell.fontFamily,
    isBold: currentCell.isBold,
    isItalic: currentCell.isItalic,
    color: currentCell.color,
  })

  return cells.filter((c) => c.text.length > 0)
}

/**
 * Cluster raw PDF text items into visual lines by Y coordinate proximity.
 */
function clusterLines(items, textColors = [], commonObjs = null) {
  const valid = items.filter((it) => it.str && it.str.length > 0)
  if (valid.length === 0) return []

  // Associate non-whitespace items with operator stream colors
  let colorIdx = 0
  const mapped = valid.map((it) => {
    const isWhitespaceOnly = it.str.trim().length === 0
    let itemColor = '#000000'
    if (!isWhitespaceOnly) {
      if (colorIdx < textColors.length) {
        itemColor = textColors[colorIdx]
        colorIdx++
      }
    }

    const cleanHex = (itemColor.startsWith('#') ? itemColor.slice(1) : itemColor).toUpperCase()

    // Resolve font from page.commonObjs if available
    const fObj = commonObjs?.has?.(it.fontName) ? commonObjs.get(it.fontName) : null
    const rawFontName = fObj?.loadedName || it.fontName || ''
    const fontInfo = cleanFontName(rawFontName)
    const isBold = Boolean(fObj?.bold || fontInfo.isBold)
    const isItalic = Boolean(fObj?.italic || fontInfo.isItalic)
    const fontFamily = fontInfo.name

    return {
      text: it.str,
      x: it.transform[4],
      y: it.transform[5],
      width: it.width,
      fontSize: Math.hypot(it.transform[0], it.transform[1]) || it.height || 12,
      fontFamily,
      isBold,
      isItalic,
      color: cleanHex || '000000',
    }
  })

  // Sort items top-to-bottom (Y descending), then left-to-right (X ascending)
  mapped.sort((a, b) => b.y - a.y || a.x - b.x)

  const lines = []
  let currentLine = []
  let currentY = null

  for (const item of mapped) {
    if (currentY === null) {
      currentLine.push(item)
      currentY = item.y
    } else if (Math.abs(item.y - currentY) <= item.fontSize * 0.4) {
      currentLine.push(item)
    } else {
      currentLine.sort((a, b) => a.x - b.x)
      lines.push(currentLine)
      currentLine = [item]
      currentY = item.y
    }
  }

  if (currentLine.length > 0) {
    currentLine.sort((a, b) => a.x - b.x)
    lines.push(currentLine)
  }

  // Extract cell segments and grouped runs
  return lines
    .map((lineItems) => {
      const cells = extractLineCells(lineItems)
      const fullText = cells.map((c) => c.text).join(' ')
      const avgFontSize =
        lineItems.reduce((acc, it) => acc + it.fontSize, 0) / lineItems.length

      // Dominant font family and styling on line
      const dominantFont = lineItems[0]?.fontFamily || 'Calibri'
      const hasBold = lineItems.some((it) => it.isBold)
      const hasItalic = lineItems.some((it) => it.isItalic)
      const dominantColor = lineItems.find((it) => it.color !== '000000')?.color || '000000'

      // Group adjacent items of identical style into runs
      const runs = []
      let currentRun = null
      for (const it of lineItems) {
        if (!it.text) continue
        const font = it.fontFamily || 'Calibri'
        const size = Math.round(it.fontSize * 2)
        const bold = Boolean(it.isBold)
        const italic = Boolean(it.isItalic)
        const color = it.color || '000000'

        if (
          currentRun &&
          currentRun.font === font &&
          currentRun.size === size &&
          currentRun.bold === bold &&
          currentRun.italic === italic &&
          currentRun.color === color
        ) {
          const needsSpace =
            !currentRun.text.endsWith(' ') && !it.text.startsWith(' ')
          currentRun.text += (needsSpace ? ' ' : '') + it.text
        } else {
          if (currentRun) runs.push(currentRun)
          currentRun = { text: it.text, font, size, bold, italic, color }
        }
      }
      if (currentRun) runs.push(currentRun)

      return {
        cells,
        runs,
        text: fullText.trim(),
        y: lineItems[0].y,
        fontSize: avgFontSize,
        fontFamily: dominantFont,
        isBold: hasBold,
        isItalic: hasItalic,
        color: dominantColor,
      }
    })
    .filter((l) => l.text.length > 0)
}

/**
 * Align a group of table rows into normalized grid columns with calculated DXA widths and alignment.
 */
function normalizeTableGrid(tableRows, contentWidthDxa = 9360) {
  const colCenters = []
  for (const row of tableRows) {
    for (const cell of row.cells) {
      const existing = colCenters.find((c) => Math.abs(c.x - cell.x) < 35)
      if (existing) {
        existing.count++
        existing.minX = Math.min(existing.minX, cell.x)
        existing.maxX = Math.max(existing.maxX, cell.maxX)
      } else {
        colCenters.push({ x: cell.x, count: 1, minX: cell.x, maxX: cell.maxX })
      }
    }
  }
  colCenters.sort((a, b) => a.x - b.x)

  const numCols = colCenters.length
  if (numCols === 0) return { colWidths: [], colAlignments: [], rows: [] }

  // Compute boundaries between columns
  const boundaries = [colCenters[0].minX]
  for (let i = 0; i < numCols - 1; i++) {
    boundaries.push((colCenters[i].maxX + colCenters[i + 1].minX) / 2)
  }
  boundaries.push(colCenters[numCols - 1].maxX)

  const rawWidths = []
  for (let i = 0; i < numCols; i++) {
    rawWidths.push(Math.max(30, boundaries[i + 1] - boundaries[i]))
  }
  const totalRaw = rawWidths.reduce((a, b) => a + b, 0)
  const colWidths = rawWidths.map((w) =>
    Math.round((w / Math.max(1, totalRaw)) * contentWidthDxa),
  )

  // Map each row's cells to the nearest column center
  const rows = tableRows.map((row) => {
    const rowCells = new Array(numCols).fill(null)
    for (const cell of row.cells) {
      let bestIdx = 0
      let minDiff = Infinity
      colCenters.forEach((col, idx) => {
        const diff = Math.abs(col.x - cell.x)
        if (diff < minDiff) {
          minDiff = diff
          bestIdx = idx
        }
      })
      rowCells[bestIdx] = cell
    }
    return rowCells.map(
      (c) =>
        c || {
          text: '',
          fontSize: 10,
          fontFamily: 'Calibri',
          isBold: false,
          isItalic: false,
          color: '000000',
        },
    )
  })

  // Detect column text alignment (right-align numbers/currencies, left-align text)
  const colAlignments = []
  for (let c = 0; c < numCols; c++) {
    const dataCells = rows
      .slice(1)
      .map((r) => r[c].text)
      .filter((t) => t && t.trim().length > 0)
    if (
      dataCells.length > 0 &&
      dataCells.filter(isNumericCell).length / dataCells.length >= 0.5
    ) {
      colAlignments.push('right')
    } else {
      colAlignments.push('left')
    }
  }

  return { colWidths, colAlignments, rows }
}

/**
 * Group sequential lines into document blocks (tables and paragraphs).
 */
function groupPageBlocks(linesWithCells, detectTables = true, contentWidthDxa = 9360) {
  if (linesWithCells.length === 0) return []

  const blocks = []
  let pendingTable = []
  let pendingParagraphLines = []

  function flushParagraph() {
    if (pendingParagraphLines.length === 0) return

    const fontSizes = [...pendingParagraphLines.map((l) => l.fontSize)].sort(
      (a, b) => a - b,
    )
    const medianSize = fontSizes[Math.floor(fontSizes.length / 2)] || 12

    let currentPara = null

    for (let i = 0; i < pendingParagraphLines.length; i++) {
      const line = pendingParagraphLines[i]
      const prevLine = i > 0 ? pendingParagraphLines[i - 1] : null

      const isHeading1 = line.fontSize >= Math.max(18, medianSize * 1.4)
      const isHeading2 = !isHeading1 && line.fontSize >= Math.max(14, medianSize * 1.2)
      const isHeading = isHeading1 || isHeading2
      const isListItem = /^[•\-*▪►\u2022\u25cf\u25aa]|\d+[.)]\s/.test(line.text)

      const verticalGap = prevLine ? Math.abs(prevLine.y - line.y) : 0
      const isWideGap = prevLine ? verticalGap > prevLine.fontSize * 1.8 : false

      const shouldStartNew =
        !currentPara ||
        isHeading ||
        currentPara.type === 'heading1' ||
        currentPara.type === 'heading2' ||
        isListItem ||
        currentPara.isListItem ||
        isWideGap ||
        Math.abs(line.fontSize - currentPara.fontSize) > 2.5

      if (shouldStartNew) {
        if (currentPara) {
          blocks.push({
            type: 'paragraph',
            data: {
              type: currentPara.type,
              isListItem: currentPara.isListItem,
              text: currentPara.lines.join(' '),
              runs: currentPara.runs,
              fontFamily: currentPara.fontFamily,
              fontSize: currentPara.fontSize,
              color: currentPara.color,
            },
          })
        }
        currentPara = {
          type: isHeading1 ? 'heading1' : isHeading2 ? 'heading2' : 'body',
          isListItem,
          fontSize: line.fontSize,
          fontFamily: line.fontFamily,
          color: line.color,
          lines: [line.text],
          runs: [...(line.runs || [])],
        }
      } else {
        currentPara.lines.push(line.text)
        currentPara.runs.push(...(line.runs || []))
      }
    }

    if (currentPara) {
      blocks.push({
        type: 'paragraph',
        data: {
          type: currentPara.type,
          isListItem: currentPara.isListItem,
          text: currentPara.lines.join(' '),
          runs: currentPara.runs,
          fontFamily: currentPara.fontFamily,
          fontSize: currentPara.fontSize,
          color: currentPara.color,
        },
      })
    }
    pendingParagraphLines = []
  }

  function flushTable() {
    if (pendingTable.length === 0) return
    if (pendingTable.length >= 2) {
      const gridData = normalizeTableGrid(pendingTable, contentWidthDxa)
      blocks.push({ type: 'table', data: gridData })
    } else {
      pendingParagraphLines.push(pendingTable[0])
    }
    pendingTable = []
  }

  for (let i = 0; i < linesWithCells.length; i++) {
    const line = linesWithCells[i]
    const isMultiColumn = detectTables && line.cells.length >= 2

    if (isMultiColumn) {
      flushParagraph()
      pendingTable.push(line)
    } else {
      flushTable()
      pendingParagraphLines.push(line)
    }
  }

  flushParagraph()
  flushTable()

  return blocks
}

/**
 * Build Word OpenXML styles.xml with presets or extracted PDF typography.
 */
function buildStylesXml(preset = 'original', dominantFont = 'Calibri') {
  const fonts = {
    original: { name: dominantFont, h1Color: '1E293B', h2Color: '334155' },
    modern: { name: 'Calibri', h1Color: '1F497D', h2Color: '2E74B5' },
    formal: { name: 'Times New Roman', h1Color: '111111', h2Color: '222222' },
    clean: { name: 'Arial', h1Color: '0F172A', h2Color: '334155' },
  }
  const f = fonts[preset] || fonts.original

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n' +
    '  <w:docDefaults>\n' +
    '    <w:rPrDefault>\n' +
    '      <w:rPr>\n' +
    '        <w:rFonts w:ascii="' +
    f.name +
    '" w:hAnsi="' +
    f.name +
    '" w:cs="' +
    f.name +
    '"/>\n' +
    '        <w:sz w:val="22"/>\n' +
    '        <w:szCs w:val="22"/>\n' +
    '        <w:lang w:val="en-US"/>\n' +
    '      </w:rPr>\n' +
    '    </w:rPrDefault>\n' +
    '  </w:docDefaults>\n' +
    '  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">\n' +
    '    <w:name w:val="Normal"/>\n' +
    '    <w:qFormat/>\n' +
    '  </w:style>\n' +
    '  <w:style w:type="paragraph" w:styleId="Heading1">\n' +
    '    <w:name w:val="heading 1"/>\n' +
    '    <w:basedOn w:val="Normal"/>\n' +
    '    <w:next w:val="Normal"/>\n' +
    '    <w:qFormat/>\n' +
    '    <w:pPr><w:spacing w:before="280" w:after="120"/></w:pPr>\n' +
    '    <w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/><w:color w:val="' +
    f.h1Color +
    '"/></w:rPr>\n' +
    '  </w:style>\n' +
    '  <w:style w:type="paragraph" w:styleId="Heading2">\n' +
    '    <w:name w:val="heading 2"/>\n' +
    '    <w:basedOn w:val="Normal"/>\n' +
    '    <w:next w:val="Normal"/>\n' +
    '    <w:qFormat/>\n' +
    '    <w:pPr><w:spacing w:before="220" w:after="80"/></w:pPr>\n' +
    '    <w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="' +
    f.h2Color +
    '"/></w:rPr>\n' +
    '  </w:style>\n' +
    '</w:styles>'
  )
}

/**
 * Render a native Word OpenXML table with exact column widths, borders, shading, and alignment.
 */
function renderTableXml(tableData, stylePreset = 'original') {
  const { colWidths, colAlignments, rows } = tableData
  if (!rows || rows.length === 0) return ''

  let xml = '<w:tbl>\n'
  xml += '  <w:tblPr>\n'
  xml += '    <w:tblW w:w="0" w:type="auto"/>\n'
  xml += '    <w:jc w:val="center"/>\n'
  xml += '    <w:tblBorders>\n'
  xml += '      <w:top w:val="single" w:sz="8" w:space="0" w:color="94A3B8"/>\n'
  xml += '      <w:bottom w:val="single" w:sz="8" w:space="0" w:color="94A3B8"/>\n'
  xml += '      <w:left w:val="none"/>\n'
  xml += '      <w:right w:val="none"/>\n'
  xml += '      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>\n'
  xml += '      <w:insideV w:val="none"/>\n'
  xml += '    </w:tblBorders>\n'
  xml += '  </w:tblPr>\n'

  // Word grid column definitions
  xml += '  <w:tblGrid>\n'
  colWidths.forEach((w) => {
    xml += `    <w:gridCol w:w="${w}"/>\n`
  })
  xml += '  </w:tblGrid>\n'

  rows.forEach((row, rowIdx) => {
    const isHeader = rowIdx === 0
    xml += '  <w:tr>\n'
    if (isHeader) {
      xml += '    <w:trPr><w:tblHeader/></w:trPr>\n'
    }

    row.forEach((cell, colIdx) => {
      const colWidth = colWidths[colIdx] || 2000
      const align = colAlignments[colIdx] || 'left'
      const isCellBold = isHeader || cell.isBold
      const font = stylePreset === 'original' ? cell.fontFamily || 'Calibri' : ''
      const sizeVal = Math.round((cell.fontSize || 10) * 2)
      const colorVal = cell.color && cell.color !== '000000' ? cell.color : ''

      // Header shading: if header text is white / light, fill with dark navy #1E293B, else #F1F5F9
      let shdXml = ''
      if (isHeader) {
        const isLightText = cell.color && getColorBrightness(cell.color) > 180
        const fill = isLightText ? '1E293B' : 'F1F5F9'
        shdXml = `        <w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>\n`
      }

      xml += '    <w:tc>\n'
      xml += '      <w:tcPr>\n'
      xml += `        <w:tcW w:w="${colWidth}" w:type="dxa"/>\n`
      xml += '        <w:tcMar><w:top w:w="120"/><w:bottom w:w="120"/><w:left w:w="160"/><w:right w:w="160"/></w:tcMar>\n'
      xml += shdXml
      xml += '      </w:tcPr>\n'

      xml += '      <w:p>\n'
      xml += `        <w:pPr><w:jc w:val="${align}"/><w:spacing w:before="0" w:after="0"/></w:pPr>\n`
      xml += '        <w:r>\n'
      xml += '          <w:rPr>\n'
      if (font) {
        xml += `            <w:rFonts w:ascii="${escapeXml(font)}" w:hAnsi="${escapeXml(font)}" w:cs="${escapeXml(font)}"/>\n`
      }
      xml += `            <w:sz w:val="${sizeVal}"/><w:szCs w:val="${sizeVal}"/>\n`
      if (isCellBold) {
        xml += '            <w:b/>\n'
      }
      if (cell.isItalic) {
        xml += '            <w:i/>\n'
      }
      if (colorVal) {
        xml += `            <w:color w:val="${colorVal}"/>\n`
      }
      xml += '          </w:rPr>\n'
      xml += `          <w:t xml:space="preserve">${escapeXml(cell.text)}</w:t>\n`
      xml += '        </w:r>\n'
      xml += '      </w:p>\n'
      xml += '    </w:tc>\n'
    })
    xml += '  </w:tr>\n'
  })

  xml += '</w:tbl>\n'
  return xml
}

/**
 * Render an individual text run inside a paragraph with exact styling.
 */
function renderRunXml(run, stylePreset = 'original') {
  let rPr = '<w:rPr>'
  if (stylePreset === 'original' && run.font) {
    const safeFont = escapeXml(run.font)
    rPr += `<w:rFonts w:ascii="${safeFont}" w:hAnsi="${safeFont}" w:cs="${safeFont}"/>`
  }
  if (run.size) {
    rPr += `<w:sz w:val="${run.size}"/><w:szCs w:val="${run.size}"/>`
  }
  if (run.bold) {
    rPr += '<w:b/>'
  }
  if (run.italic) {
    rPr += '<w:i/>'
  }
  if (run.color && run.color !== '000000') {
    rPr += `<w:color w:val="${run.color}"/>`
  }
  rPr += '</w:rPr>'
  return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`
}

/**
 * Build Word OpenXML document.xml preserving page geometry, headings, paragraphs, and tables.
 */
function buildDocumentXml(pagesBlocks, pageDimensions, options = {}) {
  const { includePageBreaks = true, stylePreset = 'original' } = options
  const xmlParts = []

  pagesBlocks.forEach((pageObj, pageIdx) => {
    if (includePageBreaks && pageIdx > 0) {
      xmlParts.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
    }

    if (pageObj.blocks.length === 0) {
      xmlParts.push(
        '<w:p><w:pPr><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:rPr><w:i/><w:color w:val="888888"/></w:rPr><w:t xml:space="preserve">[Page ' +
          pageObj.pageNumber +
          ': Scanned or image content — no selectable text detected]</w:t></w:r></w:p>',
      )
      return
    }

    pageObj.blocks.forEach((b) => {
      if (b.type === 'table') {
        xmlParts.push(renderTableXml(b.data, stylePreset))
      } else if (b.type === 'paragraph') {
        const p = b.data
        const runs = p.runs && p.runs.length > 0 ? p.runs : [{ text: p.text, size: 22 }]

        if (p.type === 'heading1') {
          xmlParts.push(
            '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' +
              runs.map((r) => renderRunXml({ ...r, bold: true }, stylePreset)).join('') +
              '</w:p>',
          )
        } else if (p.type === 'heading2') {
          xmlParts.push(
            '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>' +
              runs.map((r) => renderRunXml({ ...r, bold: true }, stylePreset)).join('') +
              '</w:p>',
          )
        } else if (p.isListItem) {
          xmlParts.push(
            '<w:p><w:pPr><w:spacing w:before="40" w:after="60" w:line="260" w:lineRule="auto"/><w:ind w:left="400" w:hanging="200"/></w:pPr>' +
              runs.map((r) => renderRunXml(r, stylePreset)).join('') +
              '</w:p>',
          )
        } else {
          xmlParts.push(
            '<w:p><w:pPr><w:spacing w:before="0" w:after="140" w:line="276" w:lineRule="auto"/></w:pPr>' +
              runs.map((r) => renderRunXml(r, stylePreset)).join('') +
              '</w:p>',
          )
        }
      }
    })
  })

  // Set page dimensions and margins to match original PDF
  const {
    widthDxa = 12240,
    heightDxa = 15840,
    isLandscape = false,
    topMarginDxa = 1440,
    rightMarginDxa = 1440,
    bottomMarginDxa = 1440,
    leftMarginDxa = 1440,
  } = pageDimensions || {}

  xmlParts.push(
    `<w:sectPr>` +
      `<w:pgSz w:w="${widthDxa}" w:h="${heightDxa}" ${isLandscape ? 'w:orient="landscape"' : ''}/>` +
      `<w:pgMar w:top="${topMarginDxa}" w:right="${rightMarginDxa}" w:bottom="${bottomMarginDxa}" w:left="${leftMarginDxa}" w:header="720" w:footer="720" w:gutter="0"/>` +
      `</w:sectPr>`,
  )

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n' +
    '  <w:body>\n' +
    xmlParts.join('\n') +
    '\n  </w:body>\n' +
    '</w:document>'
  )
}

/**
 * Convert a PDF file to a Microsoft Word (.docx) file with visual fidelity preservation.
 *
 * @param {File | { name: string, buffer?: ArrayBuffer, arrayBuffer?: () => Promise<ArrayBuffer> }} file
 * @param {Object} [options]
 * @param {'original' | 'modern' | 'formal' | 'clean'} [options.stylePreset]
 * @param {boolean} [options.includePageBreaks]
 * @param {boolean} [options.detectTables]
 * @param {number[]} [options.pageIndices]
 * @param {(done: number, total: number) => void} [onProgress]
 * @param {AbortSignal} [signal]
 */
export async function convertPdfToWord(file, options = {}, onProgress = () => {}, signal) {
  const {
    stylePreset = 'original',
    includePageBreaks = true,
    detectTables = true,
    pageIndices,
  } = options

  const buffer = file.buffer || (await file.arrayBuffer())
  const base = baseName(file.name)
  const outputName = `${base}.docx`

  const doc = await openPdf(new Uint8Array(buffer))

  try {
    const { pdf } = doc
    const totalPages = pdf.numPages
    const targetIndices =
      pageIndices && pageIndices.length > 0
        ? pageIndices
        : Array.from({ length: totalPages }, (_, i) => i)

    const pagesBlocks = []
    let totalWords = 0
    let totalChars = 0
    let headingCount = 0
    let paragraphCount = 0
    let tableCount = 0
    let scannedPageCount = 0

    // Typography tracking across document
    const fontUsage = {}
    let primaryDimensions = null

    onProgress(0, targetIndices.length)

    for (let i = 0; i < targetIndices.length; i++) {
      if (signal?.aborted) {
        throw new DOMException('Cancelled', 'AbortError')
      }

      const p = targetIndices[i]
      if (p < 0 || p >= totalPages) continue

      const page = await pdf.getPage(p + 1)
      const viewport = page.getViewport({ scale: 1 })

      // Page dimensions in DXA (1 pt = 20 dxa)
      const pageWidthDxa = Math.round(viewport.width * 20)
      const pageHeightDxa = Math.round(viewport.height * 20)
      const isLandscape = viewport.width > viewport.height
      const contentWidthDxa = Math.max(3000, pageWidthDxa - 2880)

      if (!primaryDimensions) {
        primaryDimensions = {
          widthDxa: pageWidthDxa,
          heightDxa: pageHeightDxa,
          isLandscape,
          topMarginDxa: 1440,
          rightMarginDxa: 1440,
          bottomMarginDxa: 1440,
          leftMarginDxa: 1440,
        }
      }

      // Extract colors and operator stream
      let textColors = []
      try {
        const ops = await page.getOperatorList()
        textColors = extractPageColors(ops)
      } catch {
        // Fallback gracefully if operator stream fails
      }

      const textContent = await page.getTextContent()
      const commonObjs = page.commonObjs
      page.cleanup()

      const lines = clusterLines(textContent.items || [], textColors, commonObjs)
      const blocks = groupPageBlocks(lines, detectTables, contentWidthDxa)

      if (blocks.length === 0) {
        scannedPageCount++
      }

      // Tally typography and stats
      for (const line of lines) {
        if (line.fontFamily) {
          fontUsage[line.fontFamily] = (fontUsage[line.fontFamily] || 0) + line.text.length
        }
      }

      for (const b of blocks) {
        if (b.type === 'table') {
          tableCount++
          for (const row of b.data.rows) {
            for (const cell of row) {
              totalChars += cell.text.length
              totalWords += cell.text.trim().split(/\s+/).filter(Boolean).length
            }
          }
        } else if (b.type === 'paragraph') {
          paragraphCount++
          if (b.data.type === 'heading1' || b.data.type === 'heading2') {
            headingCount++
          }
          totalChars += b.data.text.length
          totalWords += b.data.text.trim().split(/\s+/).filter(Boolean).length
        }
      }

      pagesBlocks.push({
        pageNumber: p + 1,
        blocks,
      })

      onProgress(i + 1, targetIndices.length)
    }

    // Determine dominant font across document
    let dominantFont = 'Calibri'
    let maxCharCount = 0
    for (const [font, count] of Object.entries(fontUsage)) {
      if (count > maxCharCount) {
        maxCharCount = count
        dominantFont = font
      }
    }

    // Assemble the DOCX ZIP archive
    const zip = new JSZip()

    zip.file(
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
        '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
        '  <Default Extension="xml" ContentType="application/xml"/>\n' +
        '  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>\n' +
        '  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>\n' +
        '</Types>',
    )

    zip.file(
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
        '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>\n' +
        '</Relationships>',
    )

    zip.file(
      'word/_rels/document.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
        '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>\n' +
        '</Relationships>',
    )

    zip.file('word/styles.xml', buildStylesXml(stylePreset, dominantFont))
    zip.file(
      'word/document.xml',
      buildDocumentXml(pagesBlocks, primaryDimensions, {
        includePageBreaks,
        stylePreset,
      }),
    )

    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE',
    })

    return {
      blob,
      filename: outputName,
      wordCount: totalWords,
      charCount: totalChars,
      paragraphCount,
      headingCount,
      tableCount,
      dominantFont,
      scannedPageCount,
      totalPages: targetIndices.length,
    }
  } finally {
    await doc.close()
  }
}
