// A switch that waited for chats ends after its select answered, maybe with Settings closed: the
// window that selected follows the host's pushed progress and tells how it ended, once.

import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import {
  observeAntigravityChatSignIn,
  readAntigravityChatSignIn,
  subscribeAntigravityChatSignIns
} from '@/runtime/provider-accounts/sign-in/antigravity-chat-sign-in-status'
import { callAntigravityAccounts } from '@/runtime/provider-accounts/sign-in/runtime-antigravity-accounts-client'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type { AntigravityAccountTarget } from '../../../../shared/agent-accounts/antigravity/antigravity-account-types'

// A switch gives up after 5 minutes; past this the host has nothing more to say.
const FOLLOW_LIMIT_MS = 10 * 60_000

const following = new Set<string>()

const hostKey = (owner: RuntimeClientTarget): string =>
  owner.kind === 'local' ? '' : owner.environmentId

/** Follows the switch to `accountId` this window's select started, until it ends. */
export function followAntigravityAccountSwitch(
  owner: RuntimeClientTarget,
  target: AntigravityAccountTarget,
  accountId: string
): void {
  const key = hostKey(owner)
  if (following.has(key)) {
    return
  }
  following.add(key)
  const release = observeAntigravityChatSignIn(owner)
  let reading = false
  // A push that lands during a read is checked again once it answers.
  let recheck = false
  let unsubscribe = (): void => {}
  const stop = (): void => {
    clearTimeout(limit)
    unsubscribe()
    release()
    following.delete(key)
  }
  const limit = setTimeout(stop, FOLLOW_LIMIT_MS)
  // The push can lag the select's answer, so the rows have the last word on whether it ended.
  const check = (): void => {
    if (reading) {
      recheck = true
      return
    }
    const view = readAntigravityChatSignIn(owner)
    if (view.status !== 'known' || view.accountSwitch?.accountId === accountId) {
      return
    }
    reading = true
    void callAntigravityAccounts(owner, target, 'List').then(
      (rows) => {
        reading = false
        if (rows.switching?.accountId === accountId) {
          if (recheck) {
            recheck = false
            check()
          }
          return
        }
        stop()
        if (rows.switchFailed?.accountId === accountId) {
          toast.error(
            translate(
              'accounts.antigravity.switchFailedToast',
              'Antigravity account update failed.'
            ),
            { description: rows.switchFailed.message }
          )
        } else if (rows.selectedAccountId === accountId) {
          // Selected is what new chats launch on, even if another agy has since written its login.
          const account = rows.accounts.find((entry) => entry.id === accountId)
          toast.success(
            translate('accounts.antigravity.switched', 'Switched to {{account}}', {
              account: account?.email ?? account?.subject ?? accountId
            })
          )
        }
      },
      // Unreadable rows say nothing about how it ended.
      stop
    )
  }
  unsubscribe = subscribeAntigravityChatSignIns(check)
  check()
}
