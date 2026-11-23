import { describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../shared/settings/global-settings-types'
import {
  codexChatAppServerArgs,
  codexToolCheckBasis,
  watchCodexToolCheckArgs
} from './bot-tools-codex-args'

const withArgs = (codex: string): Partial<GlobalSettings> => ({ agentDefaultArgs: { codex } })

describe('codexChatAppServerArgs', () => {
  it('keeps a quoted -c override whole, as a chat’s app-server gets it', () => {
    expect(
      codexChatAppServerArgs(withArgs(`-c 'mcp_servers.notion.command="npx -y notion"'`))
    ).toEqual(['-c', 'mcp_servers.notion.command="npx -y notion"'])
  })

  it('takes nothing from the Command wrapper: only Arguments are root options', () => {
    // The settings a chat launches from carry both; the wrapper goes before the CLI, not here.
    const settings: Partial<GlobalSettings> = {
      ...withArgs(`-c 'model="o3"'`),
      agentCmdOverrides: { codex: 'wrapper --flag codex' }
    }
    expect(codexChatAppServerArgs(settings)).toEqual(['-c', 'model="o3"'])
  })

  it('gives none for Arguments a chat can’t launch with', () => {
    expect(codexChatAppServerArgs(withArgs(`-c 'unterminated`))).toEqual([])
  })
})

describe('watchCodexToolCheckArgs', () => {
  function store(initial: Partial<GlobalSettings>) {
    let listener: ((updates: unknown, settings: Partial<GlobalSettings>) => void) | null = null
    return {
      getSettings: () => initial,
      onSettingsChanged: (next: typeof listener) => {
        listener = next
        return () => {}
      },
      change: (settings: Partial<GlobalSettings>) => listener?.({}, settings)
    }
  }

  it('tells only of a change to the Arguments a check loads, and of its undoing', () => {
    const settings = store(withArgs('-c model="o3"'))
    const changed = vi.fn()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the two store reads the watcher calls
    watchCodexToolCheckArgs(settings as never, changed)
    settings.change({ ...withArgs('-c model="o3"'), agentCmdOverrides: { codex: 'other' } })
    expect(changed).not.toHaveBeenCalled()
    settings.change(withArgs('-c model="o4"'))
    settings.change(withArgs('-c model="o3"'))
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it('names the basis a check ran with', () => {
    expect(codexToolCheckBasis(['-c', 'a=1'])).not.toBe(codexToolCheckBasis([]))
    expect(codexToolCheckBasis(undefined)).toBe(codexToolCheckBasis([]))
  })
})
