// The Codex Arguments a bot's chats launch app-server with, which a Tools check must load the same.
import { isDeepStrictEqual } from 'node:util'
import { codexStructuredLaunchArgs } from '../codex/structured/launch/codex-structured-launch-args'
import { structuredAgentConfiguredArgs } from '../native-chat/agent-launch/structured-agent-configured-args'
import type { RuntimeStore } from '../runtime/construction/runtime-store-contract'

type Settings = Parameters<typeof structuredAgentConfiguredArgs>[1]

/** The root options a chat's app-server gets from Codex Arguments; none when they can't launch one. */
export function codexChatAppServerArgs(settings: Settings): string[] {
  try {
    return codexStructuredLaunchArgs(structuredAgentConfiguredArgs('codex', settings))
  } catch {
    return []
  }
}

/** What a Codex bot's Tools check ran with, so a reader knows a check from before a change is old. */
export const codexToolCheckBasis = (appServerArgs: readonly string[] | undefined): string =>
  JSON.stringify(appServerArgs ?? [])

/** Calls `changed` when the Codex Arguments a Tools check loads change; the return stops it. */
export function watchCodexToolCheckArgs(
  store: Pick<RuntimeStore, 'getSettings' | 'onSettingsChanged'> | null,
  changed: () => void
): () => void {
  if (!store?.getSettings || !store.onSettingsChanged) {
    return () => {}
  }
  let previous = codexChatAppServerArgs(store.getSettings())
  return store.onSettingsChanged((_updates, settings) => {
    const next = codexChatAppServerArgs(settings)
    if (!isDeepStrictEqual(previous, next)) {
      previous = next
      changed()
    }
  })
}
