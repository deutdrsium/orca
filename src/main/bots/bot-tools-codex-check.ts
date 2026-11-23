// A Codex bot's tools checked in one app-server session: Codex's loaded config names the ones it
// can't add, and a thread with the rest says how each of those is.
import { botFailure, botFailureEnglish } from '../../shared/bots/bot-failure-copy'
import type { BotToolProblem, BotToolServer } from '../../shared/bot-tools'
import { redactBotToolProblems } from './bot-tool-redaction'
import { cliWithLaunchTools, withRelayProblems } from './bot-launch-tools'
import { CLI_TIMEOUT_MS, codexSession } from './bot-tools-cli'
import { codexTakenToolProblem, codexThread, settledCodexToolProblems } from './bot-tools-codex'
import {
  codexLoadedServers,
  codexRefusedOf,
  codexServerKindsOf,
  codexServersOff
} from './bot-tools-codex-conflicts'
import type { BotToolsCli } from './bot-tools-host'

type Problems = Record<string, BotToolProblem>

/** A tool the check couldn't finish for: not known to work, and not known not to. */
const notFinished = (names: Iterable<string>): Problems =>
  Object.fromEntries(
    [...names].map((name) => [
      name,
      { kind: 'unconfirmed', detail: botFailureEnglish(botFailure('toolCodexCheckFailed')) }
    ])
  )

class NothingLeftToCheck extends Error {}

const conflicts = (names: Iterable<string>): Problems =>
  Object.fromEntries([...names].map((name) => [name, codexTakenToolProblem(name)]))

/**
 * Problems of `candidates`, the bot's tools Codex may add: `startable` are the ones a thread starts
 * (not signed in by Orca). A name Codex's config runs as the other kind is a conflict, kept once
 * known whatever fails after; the tools the check then couldn't finish say so. The thread starts
 * only the bot's servers: every other one the config loads is turned off. `remote` starts no
 * command, so nothing opens when the config can't be read. Only `signal` throws away what is known.
 */
export async function codexBotToolProblems(
  cli: BotToolsCli,
  candidates: readonly BotToolServer[],
  startable: readonly BotToolServer[],
  ownerStdioNames: readonly string[],
  { remote, signal }: { remote: boolean; signal?: AbortSignal }
): Promise<Problems> {
  const known = new Set<string>()
  const unfinished = (): Problems => ({
    ...notFinished(startable.map(({ name }) => name).filter((name) => !known.has(name))),
    ...conflicts(known)
  })
  // A grant is made only for a tool the thread starts; a signed-in one needs only the config read.
  const launch = startable.length > 0 ? await cliWithLaunchTools(cli, startable) : null
  try {
    return await codexSession(
      launch?.cli ?? cli,
      CLI_TIMEOUT_MS,
      async (rpc) => {
        const added = codexServerKindsOf(candidates)
        const loaded = await codexLoadedServers(rpc, cli.folder)
        if (!loaded && (remote || !launch)) {
          // Without the config, neither a signed-in tool's name nor a command-free thread is known.
          return notFinished(candidates.map(({ name }) => name))
        }
        for (const name of loaded ? codexRefusedOf(loaded, added) : []) {
          known.add(name)
        }
        const open = startable.filter((server) => !known.has(server.name))
        if (!launch || open.length === 0) {
          return conflicts(known)
        }
        const opened = await codexThread(rpc, launch.cli, launch.tools, ownerStdioNames, {
          refused: startable.filter((server) => known.has(server.name)).map(({ name }) => name),
          onRefused: (name) => {
            known.add(name)
            // A thread with none of the tools left to check isn't opened.
            if (open.every((server) => known.has(server.name))) {
              throw new NothingLeftToCheck()
            }
          },
          // Only the bot's servers start: the check reads no other, and a remote one runs no command.
          ...(loaded ? { extraConfig: codexServersOff(loaded, added) } : {})
        }).catch((error: unknown) => {
          if (error instanceof NothingLeftToCheck) {
            return null
          }
          throw error
        })
        if (!opened) {
          return conflicts(known)
        }
        const thread = opened
        // The status under a left-out name is the owner's own server's, not the bot's.
        const checked = open
          .map(({ name }) => name)
          .filter((name) => !thread.leftOut.includes(name))
        const problems = await settledCodexToolProblems(rpc, thread.threadId, checked, signal)
        return {
          ...withRelayProblems(cli, startable, redactBotToolProblems(problems, startable)),
          ...conflicts(known)
        }
      },
      signal
    )
  } catch (error) {
    if (signal?.aborted || known.size === 0) {
      throw error
    }
    return unfinished()
  }
}
