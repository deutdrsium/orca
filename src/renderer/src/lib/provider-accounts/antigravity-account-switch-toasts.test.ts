import { expect, it, vi } from 'vitest'
import type {
  AntigravityAccountState,
  AntigravityAccountSwitchProgress
} from '../../../../shared/agent-accounts/antigravity/antigravity-account-types'

// The host's pushed sign-in status, as the status store hands it to its readers.
const host = vi.hoisted(() => {
  const pushed: {
    accountSwitch: AntigravityAccountSwitchProgress | null
    rows: AntigravityAccountState[]
    /** Reads that answer when the test says, ahead of `rows`. */
    reads: Promise<AntigravityAccountState>[]
  } = { accountSwitch: null, rows: [], reads: [] }
  return Object.assign(pushed, {
    listeners: new Set<() => void>(),
    success: vi.fn(),
    error: vi.fn()
  })
})
vi.mock('sonner', () => ({ toast: { success: host.success, error: host.error } }))
vi.mock('@/runtime/provider-accounts/sign-in/antigravity-chat-sign-in-status', () => ({
  observeAntigravityChatSignIn: () => () => {},
  readAntigravityChatSignIn: () => ({ status: 'known', accountSwitch: host.accountSwitch }),
  subscribeAntigravityChatSignIns: (listener: () => void) => {
    host.listeners.add(listener)
    return () => host.listeners.delete(listener)
  }
}))
vi.mock('@/runtime/provider-accounts/sign-in/runtime-antigravity-accounts-client', () => ({
  callAntigravityAccounts: async () => host.reads.shift() ?? host.rows.shift()
}))

const { followAntigravityAccountSwitch } = await import('./antigravity-account-switch-toasts')

const rows = (patch: Partial<AntigravityAccountState>): AntigravityAccountState => ({
  accounts: [
    {
      id: 'b',
      email: 'b@example.com',
      subject: 'b',
      authMethod: 'consumer',
      createdAt: 0,
      updatedAt: 0
    }
  ],
  activeAccountId: 'a',
  selectedAccountId: 'a',
  currentAccount: null,
  ...patch
})
const push = (next: typeof host.accountSwitch) => {
  host.accountSwitch = next
  host.listeners.forEach((listener) => listener())
}

it('tells how a waiting switch ended once, after the host says it ended', async () => {
  // The push lags the select's answer: the rows still say it waits.
  host.rows.push(rows({ switching: { accountId: 'b', waitingForChats: 1 } }))
  followAntigravityAccountSwitch({ kind: 'local' }, { runtime: 'host' }, 'b')
  // A second Settings section in this window asks too.
  followAntigravityAccountSwitch({ kind: 'local' }, { runtime: 'host' }, 'b')
  push({ accountId: 'b', waitingForChats: 1 })
  await vi.waitFor(() => expect(host.rows).toHaveLength(0))
  expect(host.success).not.toHaveBeenCalled()

  host.rows.push(rows({ activeAccountId: 'b', selectedAccountId: 'b' }))
  push(null)
  await vi.waitFor(() => expect(host.success).toHaveBeenCalledTimes(1))
  expect(host.success).toHaveBeenCalledWith('Switched to b@example.com')
  push(null)
  expect(host.success).toHaveBeenCalledTimes(1)
  expect(host.error).not.toHaveBeenCalled()
})

it('names why a waiting switch failed', async () => {
  push({ accountId: 'b', waitingForChats: 1 })
  followAntigravityAccountSwitch({ kind: 'local' }, { runtime: 'host' }, 'b')
  host.rows.push(rows({ switchFailed: { accountId: 'b', message: '1 chat is still running.' } }))
  push(null)
  await vi.waitFor(() => expect(host.error).toHaveBeenCalledTimes(1))
  expect(host.error).toHaveBeenCalledWith('Antigravity account update failed.', {
    description: '1 chat is still running.'
  })
})

it('reads again when the switch ends while a read of it is still out', async () => {
  host.success.mockClear()
  // The push lags the select's answer, so the first read goes out at once and answers late.
  push(null)
  const late = Promise.withResolvers<AntigravityAccountState>()
  host.reads.push(late.promise)
  followAntigravityAccountSwitch({ kind: 'local' }, { runtime: 'host' }, 'b')
  // The switch ends while that read is out; the late answer still shows it waiting.
  host.rows.push(rows({ activeAccountId: 'b', selectedAccountId: 'b' }))
  push(null)
  late.resolve(rows({ switching: { accountId: 'b', waitingForChats: 1 } }))
  await vi.waitFor(() => expect(host.success).toHaveBeenCalledWith('Switched to b@example.com'))
})
