import { useLayoutEffect, useState, type RefObject } from 'react'
import { WORKER_DOCK_HEADER_ROW } from './WorkerDockPill'

// A row's resting height: one line of title and age.
export const WORKER_DOCK_ROW = 32
const MAX_ROWS = 6
// Jump to latest (32px) and its 8px gap ride above the open panel, so the panel leaves them room.
const JUMP_ROOM = 40
const CRAMPED = 'data-worker-dock-cramped'

/** The panel list's max height: six rows, or fewer when the chat above the dock is shorter, so the
 *  panel and the Jump to latest above it never run off the pane. Re-read when the pane, the dock or the
 *  task list under the panel (either lifts it as it grows) resizes; the panel's own growth (every frame
 *  of the morph) moves nothing this reads. */
export function useWorkerDockCardBudget({
  root,
  card,
  open,
  rows
}: {
  root: RefObject<HTMLElement | null>
  card: RefObject<HTMLElement | null>
  open: boolean
  rows: number
}): number {
  const [budget, setBudget] = useState(WORKER_DOCK_ROW * MAX_ROWS)
  useLayoutEffect(() => {
    const pane = root.current?.closest('[data-native-chat-root]')
    if (!open || !pane) {
      return
    }
    const measure = () => {
      const paneTop = pane.getBoundingClientRect().top
      const bottom = card.current?.getBoundingClientRect().bottom
      if (bottom === undefined) {
        return
      }
      // Besides the list: the header (bulk actions included), the list's 4px padding above and
      // below, and the borders, then Jump to latest's room and 8px of air.
      const room = bottom - paneTop - WORKER_DOCK_HEADER_ROW - 10 - JUMP_ROOM - 8
      setBudget(Math.max(WORKER_DOCK_ROW, Math.min(WORKER_DOCK_ROW * MAX_ROWS, room)))
      // Too short for one row and Jump to latest even without the air: Jump steps aside while the card is open
      // (hidden, so nothing half off the pane can be pressed) and returns when it folds.
      pane.toggleAttribute(CRAMPED, room + 8 < WORKER_DOCK_ROW)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return () => pane.removeAttribute(CRAMPED)
    }
    const observer = new ResizeObserver(measure)
    // The card rides the transcript's end, which rises as anything under it grows (the message box,
    // a docked task list that mounts or opens): the transcript viewport just before the chip's row
    // shrinks for all of them.
    const viewport = root.current?.parentElement?.previousElementSibling
    for (const element of [pane, viewport]) {
      if (element) {
        observer.observe(element)
      }
    }
    return () => {
      observer.disconnect()
      pane.removeAttribute(CRAMPED)
    }
  }, [root, card, open, rows])
  return budget
}
