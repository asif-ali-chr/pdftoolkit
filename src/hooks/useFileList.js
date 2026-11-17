import { useCallback, useState } from 'react'
import { arrayMove } from '@dnd-kit/sortable'

/**
 * State for a list of user-chosen files that can be added, removed and reordered.
 * Items are { id, file }. The File objects stay out of anything heavy: the bytes are
 * only read when a tool actually runs.
 */
export function useFileList() {
  const [items, setItems] = useState([])

  const addFiles = useCallback((files) => {
    setItems((prev) => [...prev, ...files.map((file) => ({ id: crypto.randomUUID(), file }))])
  }, [])

  const removeFile = useCallback((id) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const moveFile = useCallback((from, to) => {
    setItems((prev) => arrayMove(prev, from, to))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  return { items, addFiles, removeFile, moveFile, clear }
}
