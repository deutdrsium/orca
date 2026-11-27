import { useTranslate } from '@/i18n/use-translate'
import {
  useEffect,
  useLayoutEffect,
  type KeyboardEvent,
  type ReactNode,
  type MouseEvent,
  type RefObject
} from 'react'
import { useLatestHandler } from '@/lib/use-latest-handler'
import { cn } from '@/lib/class-names'
import { WorkerDockGlyph } from './WorkerDockGlyph'
import type { WorkerDockGlyph as Glyph } from './worker-dock-card-order'

// Where Jump to latest rests while the open panel rises over the transcript: 8px above it.
const JUMP_LIFT = '--native-chat-worker-jump-lift'

// A zero-height row at the transcript's end: the chip sits on it, over the transcript (which keeps
// room for it at its end), and the open panel rises from there. When the transcript
// gives up its floor, the chip is an ordinary row in the stack instead.
export const WORKER_DOCK_FLOAT_CLASS =
  'pointer-events-none relative h-0 shrink-0 [[data-native-chat-dock-fit~=transcript]_&]:flex [[data-native-chat-dock-fit~=transcript]_&]:h-auto [[data-native-chat-dock-fit~=transcript]_&]:flex-col'
/** The chip row's height folded (the chip) and open (the list's header, a row's height). */
export const WORKER_DOCK_CHIP_ROW = 24
export const WORKER_DOCK_HEADER_ROW = 32
// The chip's footprint over the transcript's end: the transcript pads its end by this, so its last
// line still clears the chip.
const CHIP_ROOM = '--native-chat-worker-chip-room'
// Raised over the transcript, opaque even when the chat's message-box surface is translucent.
export const WORKER_DOCK_SURFACE_CLASS =
  'pointer-events-auto border border-border bg-chat-canvas bg-[linear-gradient(var(--color-chat-composer-surface),var(--color-chat-composer-surface))] text-foreground [[data-native-chat-dock-fit~=transcript]_&]:static'

/** The chip's one dot: the worst state among the workers. Red needs you, the dot grid while
 *  work runs, yellow waiting, green done; false (nothing could be read) is a grey ring. */
function WorkerDockChipDot({ glyph }: { glyph: Glyph | false }) {
  if (glyph === 'running') {
    return <WorkerDockGlyph glyph="running" chip />
  }
  return (
    <span aria-hidden="true" className="inline-flex size-3 shrink-0 items-center justify-center">
      <span
        className={cn(
          'block size-2 rounded-full',
          (glyph === 'ask' || glyph === 'failed') && 'bg-destructive',
          glyph === 'queued' && 'bg-status-warning',
          glyph === 'done' && 'bg-status-success',
          glyph === false && 'border-[1.5px] border-muted-foreground'
        )}
      />
    </span>
  )
}

/** The chip's text. Short of room (the open header beside its actions), what needs you or runs
 *  ("2 needs you") stays whole and only the worker count after it ("· 5 workers") gives way; a
 *  lone worker's title truncates. */
function WorkerDockChipLabel({ label }: { label: string }) {
  const [lead, ...rest] = label.split(' · ')
  return (
    <span data-worker-dock-pill-title="" className="flex min-w-0">
      <span className={rest.length ? 'shrink-0' : 'min-w-0 truncate'}>{lead}</span>
      {/* A no-break space: a plain one would collapse at the item's edge. */}
      {rest.length ? (
        <span className="min-w-0 truncate">{`\u00a0· ${rest.join(' · ')}`}</span>
      ) : null}
    </span>
  )
}

/** The worker chip ("3 running"). Open, the same chip (one button, so focus stays put) heads the
 *  list: its dot and text sit left, in line with the rows' marks and titles, and the bulk actions
 *  sit at its right. */
export function WorkerDockPill({
  pill,
  glyph,
  label,
  latest,
  total,
  expanded,
  listId,
  action,
  onToggle,
  onEnterList
}: {
  pill: RefObject<HTMLButtonElement | null>
  glyph: Glyph | false
  /** The chip's text: the one worker's title, how many run or need you, or what is known. */
  label: string
  /** The most relevant worker's title, for assistive technology. */
  latest: string
  total: number
  expanded: boolean
  listId: string
  /** The open list's bulk actions, at the header's right. */
  action: ReactNode
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void
  /** Moves focus into the open list's first row. */
  onEnterList: () => void
}) {
  const t = useTranslate()
  return (
    <div
      className={cn(
        'flex shrink-0 items-center rounded-t-[inherit] border-b transition-[height,border-color] duration-[280ms] ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none',
        // Open, as tall as a row (32px); folded, the chip's 24px.
        expanded ? 'h-8 gap-1 border-border pr-1.5' : 'h-6 border-transparent'
      )}
    >
      <button
        ref={pill}
        type="button"
        data-worker-dock-pill=""
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-label={
          total <= 1
            ? undefined
            : t('components.native-chat.workerDock.chipLabel', '{{label}}, latest: {{title}}', {
                label,
                title: latest
              })
        }
        className={cn(
          'flex h-full min-w-0 flex-1 items-center rounded-[inherit] text-xs whitespace-nowrap hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          // Open, the list's 4px inset plus a row's 8px puts the dot over the rows' marks.
          expanded ? 'justify-start gap-2 pr-2 pl-3' : 'justify-center gap-1.5 px-2.5'
        )}
        onClick={onToggle}
        onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
          // The open chip heads the list, so down moves into its first row.
          if (expanded && event.key === 'ArrowDown') {
            event.preventDefault()
            onEnterList()
          }
        }}
      >
        <WorkerDockChipDot glyph={glyph} />
        <WorkerDockChipLabel label={label} />
      </button>
      {expanded ? action : null}
    </div>
  )
}

// A dialog, menu or toast a row opened is portalled out of the card but still belongs to it.
const KEEPS_CARD_OPEN =
  '[role="dialog"],[role="alertdialog"],[data-radix-popper-content-wrapper],[data-sonner-toaster]'

/** While the card is open, a press anywhere outside the pill and the card folds it, as Escape does. */
export function useWorkerDockOutsidePress(
  root: RefObject<HTMLElement | null>,
  open: boolean,
  onOutside: () => void
): void {
  const fold = useLatestHandler(onOutside)
  useEffect(() => {
    if (!open) {
      return
    }
    const press = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element) || root.current?.contains(target)) {
        return
      }
      // Folding under a row's dialog would unmount the row it returns focus to. This pane's Jump to
      // latest shares the card's slot: folding on its press would move it before the click lands.
      // Another pane's Jump is just outside.
      const pane = root.current?.closest('[data-native-chat-root]')
      const ownJump = Boolean(
        pane?.contains(target) && target.closest('[data-native-chat-jump-latest]')
      )
      if (!ownJump && !target.closest(KEEPS_CARD_OPEN)) {
        fold()
      }
    }
    document.addEventListener('pointerdown', press, true)
    return () => document.removeEventListener('pointerdown', press, true)
  }, [root, open, fold])
}

/** While the chip shows, the transcript keeps room for it at its end and Jump to latest rests 8px
 *  above it; while the panel is open, and until it has folded, 8px above where the panel ends up
 *  rather than hiding behind it. Measured from the chip's row at the transcript's end and the
 *  settled parts (borders, chip row and the list's own height), and again only when a height
 *  changes, so the morph's frames, which only change widths and the clipped track, cost nothing. */
export function useWorkerDockJumpLift({
  root,
  card,
  content,
  shown,
  open
}: {
  root: RefObject<HTMLElement | null>
  card: RefObject<HTMLElement | null>
  content: RefObject<HTMLElement | null>
  shown: boolean
  open: boolean
}): void {
  useLayoutEffect(() => {
    const row = root.current
    const element = card.current
    const pane = element?.closest<HTMLElement>('[data-native-chat-root]')
    if (!shown || !row || !element || !pane || typeof ResizeObserver === 'undefined') {
      return
    }
    const list = open ? content.current : null
    const place = () => {
      // The chip row's settled heights, not its animating one.
      const borders = element.offsetHeight - element.clientHeight
      const folded = borders + WORKER_DOCK_CHIP_ROW
      const full = list ? borders + WORKER_DOCK_HEADER_ROW + list.offsetHeight : folded
      const rowTop = row.getBoundingClientRect().top
      const box = element.getBoundingClientRect()
      // Once the transcript gives up its floor the chip is an ordinary row below it: no room to keep.
      const over = box.top < rowTop - 1
      const above = Math.max(0, rowTop - box.bottom)
      pane.style.setProperty(CHIP_ROOM, `${over ? above + folded : 0}px`)
      // Jump keeps its 12px rest above the chip, and 8px above the open panel; a chip that is a
      // row of its own lifts nothing.
      pane.style.setProperty(JUMP_LIFT, `${over ? above + full + (list ? 8 : 12) : 0}px`)
    }
    const heights = new Map<Element, number>()
    const observer = new ResizeObserver((entries) => {
      let changed = false
      for (const entry of entries) {
        const height = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height
        changed = changed || heights.get(entry.target) !== height
        heights.set(entry.target, height)
      }
      if (changed) {
        place()
      }
    })
    observer.observe(row)
    if (list) {
      observer.observe(list)
    }
    place()
    return () => {
      observer.disconnect()
      pane.style.removeProperty(CHIP_ROOM)
      pane.style.removeProperty(JUMP_LIFT)
    }
  }, [root, card, content, shown, open])
}
