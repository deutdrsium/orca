// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BotTools } from '../../../../shared/bot-tools'

type Call = { method: string; params: Record<string, unknown>; resolve: (value: unknown) => void }

const host = vi.hoisted(() => {
  const state: {
    calls: Call[]
    changed: ((hostId: string, scope: unknown) => void) | null
  } = { calls: [], changed: null }
  return state
})

vi.mock('@/lib/bot-hosts', () => ({
  botRefKey: (bot: { hostId: string; id: string }) => `${bot.hostId}\0${bot.id}`,
  isSameBot: (a: { hostId: string; id: string }, b: { hostId: string; id: string }) =>
    a.hostId === b.hostId && a.id === b.id,
  callBotRpc: (_bot: unknown, method: string, params: Record<string, unknown>) =>
    new Promise((resolve) => host.calls.push({ method, params, resolve }))
}))
vi.mock('@/lib/bot-catalog', () => ({
  useBots: () => [{ hostId: 'local', id: 'bot-1', agent: 'codex' }]
}))
vi.mock('@/lib/bots-changed-window-event', () => ({
  onBotsChanged: (listener: (hostId: string, scope: unknown) => void) => {
    host.changed = listener
    return () => {}
  }
}))

const BOT = { hostId: 'local' as const, id: 'bot-1' }
const pending = (method: string) => host.calls.filter((call) => call.method === method)
const tools = (own: BotTools['own'], checkBasis?: string): BotTools => ({
  agent: 'codex',
  own,
  inherited: [],
  ...(checkBasis === undefined ? {} : { checkBasis })
})
const linear = { name: 'linear', detail: 'https://mcp.linear.app/mcp', remote: true }

async function answer(call: Call | undefined, value: unknown): Promise<void> {
  await act(async () => {
    call?.resolve(value)
  })
}

beforeEach(() => {
  host.calls.length = 0
})
afterEach(() => {
  cleanup()
  vi.resetModules()
})

describe('useBotTools', () => {
  it('checks Connectors whose only apps Orca signed in to', async () => {
    const { useBotTools } = await import('./bot-tool-checks')
    renderHook(() => useBotTools(BOT, 'apps'))
    const signedIn = {
      name: 'notion',
      detail: 'https://mcp.notion.com/mcp',
      remote: false,
      signIn: { state: 'signed-in' as const, limited: false }
    }
    await answer(pending('bots.tools.list')[0], tools([signedIn]))
    expect(pending('bots.tools.problems').map((call) => call.params)).toEqual([
      { botId: 'bot-1', scope: 'remote' }
    ])
  })

  it('checks again after the Codex Arguments change, and again when they change back', async () => {
    const { useBotTools } = await import('./bot-tool-checks')
    const { result } = renderHook(() => useBotTools(BOT, 'check'))
    await answer(pending('bots.tools.list')[0], tools([linear], '["-c","a=1"]'))
    await answer(pending('bots.tools.problems')[0], { problems: {} })
    expect(result.current.view).toMatchObject({ status: 'ready', problems: {} })

    // Another bot setting changed: the same basis keeps the settled check.
    act(() => host.changed?.('local', undefined))
    await answer(pending('bots.tools.list')[1], tools([linear], '["-c","a=1"]'))
    expect(pending('bots.tools.problems')).toHaveLength(1)

    act(() => host.changed?.('local', undefined))
    await answer(pending('bots.tools.list')[2], tools([linear], '[]'))
    await answer(pending('bots.tools.list').at(-1), tools([linear], '[]'))
    expect(pending('bots.tools.problems')).toHaveLength(2)

    act(() => host.changed?.('local', undefined))
    await answer(pending('bots.tools.list').at(-1), tools([linear], '["-c","a=1"]'))
    await answer(pending('bots.tools.list').at(-1), tools([linear], '["-c","a=1"]'))
    expect(pending('bots.tools.problems')).toHaveLength(3)
  })
})
