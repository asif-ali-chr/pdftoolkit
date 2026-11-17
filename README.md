# PDF Toolkit

Client-side PDF tools (iLovePDF-style). Files never leave the browser.

## Run
    npm install
    npm run dev        # development
    npm run lint
    npm run build      # production build in dist/

## Structure
    src/tools/registry.js     list of all tools (home grid and routes are generated from it)
    src/tools/<id>/index.jsx  the tool's UI
    src/tools/<id>/process.js the tool's pure logic (no DOM; runs in a worker or Node)
    src/components/           DropZone, FileList, ProgressBar, DownloadButton, ErrorMessage, ToolLayout
    src/hooks/                useFileList, usePdfPreview
    src/lib/                  pdf.js (load, page ranges), render.js (pdf.js thumbnails),
                              download.js, files.js, workerClient.js (runJob with progress + cancel)
    src/workers/pdf.worker.js operations that run off the main thread

## Add a tool
1. Write `src/tools/<id>/process.js` (pure function: input buffers -> Uint8Array).
2. Add it to `operations` in `src/workers/pdf.worker.js`.
3. Write `src/tools/<id>/index.jsx` using the shared components and `runJob('<id>', payload, {...})`.
4. In `registry.js`, set `load: () => import('./<id>/index.jsx')`.
