// A bot's tools on the host that runs it: kept in its home folder, checked and signed in through its
// agent's own CLI, under the account its next turn uses.
import { BotFailureError } from '../../shared/bots/bot-failure-copy'
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runProcess } from '@orca/process-host'
import type {
  BotInheritedTool,
  BotToolProblem,
  BotTools,
  BotToolServer,
  BotToolInput
} from '../../shared/bot-tools'
import {
  claudeMirrorArgs,
  claudeMirrorChanges,
  claudeUnmirrorArgs,
  readClaudeInheritedTools,
  readClaudeMirror
} from './bot-tools-claude'
import {
  codexTakenToolProblems,
  readCodexInheritedToolNames,
  readCodexStdioToolNames
} from './bot-tools-codex'
import { codexBotToolProblems } from './bot-tools-codex-check'
import { codexToolCheckBasis } from './bot-tools-codex-args'
import {
  botOwnTool,
  readBotToolServers,
  changeBotToolServers,
  type BotToolNewCredential
} from './bot-tools-file'
import { resolveBotToolInput } from './bot-tool-details'
import { claudeBotToolProblems } from './bot-tools-claude-check'
import { acpLaunchSpecFor } from '../acp/launch/acp-launch-registry'
import { redactBotToolProblems } from './bot-tool-redaction'
import { cliWithLaunchTools, withRelayProblems } from './bot-launch-tools'
import type { BotAgent } from '../../shared/bot-types'
import { readBotToolOAuth, withSavedBotToolHeaders } from './bot-tool-credentials'

type BotToolsFolder = {
  botId: string
  folder: string
  /** Claude: a folder of Orca's own where the CLI keeps the bot's servers to sign them in. */
  signInFolder: string
  /** The home folders of this host's other bots on the same agent, which may share a sign-in. */
  otherBotFolders: readonly string[]
}

/** The agent CLI a Claude Code or Codex bot's turns run, as the host would launch it now. */
export type BotToolsCli = BotToolsFolder & {
  agent: 'claude' | 'codex'
  command: string
  prefixArgs: string[]
  env: Record<string, string>
  /** Claude: its config dir when not the default; Codex: its CODEX_HOME. */
  accountHome: string | null
  /** Codex: the root options a chat's app-server gets from the Codex Arguments setting, such as
   *  `-c` overrides, so a check here loads the config the bot's chats do. */
  appServerArgs?: readonly string[]
}

/** A bot's tools on this host. Only Claude Code and Codex have a CLI Orca checks and signs them in
 *  through; another agent's tools are its folder's file, delivered at launch. */
export type BotToolsHome =
  | BotToolsCli
  | (BotToolsFolder & { agent: Exclude<BotAgent, BotToolsCli['agent']> })

export const hasBotToolsCli = (home: BotToolsHome): home is BotToolsCli =>
  home.agent === 'claude' || home.agent === 'codex'

import { codexSession, runBotToolsCli } from './bot-tools-cli'

export { codexSession, runBotToolsCli }

/** The tools the bot gets from its owner's own Claude Code or Codex config; none read for another agent. */
export async function inheritedTools(cli: BotToolsHome): Promise<BotInheritedTool[]> {
  if (cli.agent === 'claude') {
    return await readClaudeInheritedTools(cli.accountHome)
  }
  if (cli.agent !== 'codex') {
    return []
  }
  const names = cli.accountHome ? await readCodexInheritedToolNames(cli.accountHome) : []
  return names.map((name) => ({ name }))
}

/** The owner's Codex stdio servers, read from the same config.toml as its inherited tools. */
export async function codexStdioToolNames(cli: BotToolsCli): Promise<string[]> {
  return cli.accountHome ? await readCodexStdioToolNames(cli.accountHome) : []
}

export async function listBotTools(cli: BotToolsHome): Promise<BotTools> {
  const [servers, inherited] = await Promise.all([
    readBotToolServers(cli.folder),
    inheritedTools(cli)
  ])
  return {
    agent: cli.agent,
    own: servers.map((server) => botOwnTool(server, cli.folder)),
    inherited,
    ...(cli.agent === 'codex' ? { checkBasis: codexToolCheckBasis(cli.appServerArgs) } : {})
  }
}

/**
 * Claude's sign-in folder, made its own git repo so Claude keys its servers to it even under a home
 * kept in git, and mirroring the bot's servers.
 */
export async function claudeSignInFolder(
  cli: BotToolsCli,
  allServers: readonly BotToolServer[]
): Promise<string> {
  // A tool with saved values goes through the relay and never signs in, so Claude's config never holds it.
  const servers = allServers.filter((server) => !('url' in server && server.credential))
  const folder = cli.signInFolder
  await mkdir(folder, { recursive: true })
  if (!existsSync(join(folder, '.git'))) {
    const made = await runProcess({ program: 'git', args: ['init', '-q'], cwd: folder })
    if (made.code !== 0) {
      throw new BotFailureError('toolSignInFolderFailed', {
        detail: made.stderr.trim() || 'git init failed'
      })
    }
  }
  const mirror = await readClaudeMirror(cli.accountHome, folder)
  for (const name of Object.keys(mirror)) {
    if (!servers.some((server) => server.name === name)) {
      await runBotToolsCli(cli, claudeUnmirrorArgs(name), folder)
    }
  }
  const changes = claudeMirrorChanges(mirror, servers)
  for (const server of changes) {
    await runBotToolsCli(cli, claudeUnmirrorArgs(server.name), folder)
    const added = await runBotToolsCli(cli, claudeMirrorArgs(server), folder)
    if (added.code !== 0) {
      throw new BotFailureError('toolClaudePrepareFailed', { name: server.name })
    }
  }
  return folder
}

/**
 * Only the bot's own tools that need something; a working one isn't listed. `remote` checks only
 * the URL servers, so no command is started; `signal` stops the check and closes its session.
 */
export async function botToolProblems(
  cli: BotToolsHome,
  { remote = false, signal }: { remote?: boolean; signal?: AbortSignal } = {}
): Promise<Record<string, BotToolProblem>> {
  const own = await readBotToolServers(cli.folder)
  // Its chats start without them, so each row says why instead of looking ready.
  const off = acpLaunchSpecFor(cli.agent)?.botToolsOff
  if (off) {
    return Object.fromEntries(
      own.map((server) => [server.name, { kind: 'failed', detail: `Off: ${off}.` }])
    )
  }
  const scoped = own.filter((server) => !remote || 'url' in server)
  // Codex runs the owner's stdio server of a taken name instead, even for a tool Orca signs in to.
  const ownerStdioNames = cli.agent === 'codex' ? await codexStdioToolNames(cli) : []
  const taken = codexTakenToolProblems(scoped, ownerStdioNames)
  const candidates = scoped.filter((server) => !Object.hasOwn(taken, server.name))
  // A tool Orca signs in to has its state from Orca's own store; checking it would start it.
  const servers = candidates.filter(
    (server) =>
      !('url' in server && server.credential && readBotToolOAuth(cli.folder, server.credential))
  )
  // Another agent has no CLI check, so its rows show no problem, as a Claude or Codex row it confirmed.
  if (!hasBotToolsCli(cli) || (cli.agent === 'claude' ? servers : candidates).length === 0) {
    return taken
  }
  signal?.throwIfAborted()
  if (cli.agent === 'claude') {
    const launch = await cliWithLaunchTools(cli, servers)
    return withRelayProblems(
      cli,
      servers,
      redactBotToolProblems(await claudeBotToolProblems(launch.cli, launch.tools, signal), servers)
    )
  }
  return {
    ...(await codexBotToolProblems(cli, candidates, servers, ownerStdioNames, { remote, signal })),
    ...taken
  }
}

/** A name the bot or its owner already uses would merge into, or shadow, the other server. */
export async function botToolNameTaken(
  cli: BotToolsHome,
  name: string,
  editingName?: string
): Promise<BotFailureError | null> {
  const [servers, inherited] = await Promise.all([
    readBotToolServers(cli.folder),
    inheritedTools(cli)
  ])
  if (servers.some((server) => server.name === name && server.name !== editingName)) {
    return new BotFailureError('toolNameTaken', { name })
  }
  const agent = cli.agent === 'claude' ? 'Claude Code' : 'Codex'
  return inherited.some((tool) => !tool.plugin && tool.name === name)
    ? new BotFailureError('toolNameTakenByAgent', { agent, name })
    : null
}

export async function addBotTool(
  cli: BotToolsHome,
  server: BotToolServer,
  credentials?: ReadonlyMap<string, BotToolNewCredential>
): Promise<void> {
  const taken = await botToolNameTaken(cli, server.name)
  if (taken) {
    throw taken
  }
  await changeBotToolServers(
    cli.folder,
    (servers) => {
      if (servers.some((entry) => entry.name === server.name)) {
        throw new BotFailureError('toolNameTaken', { name: server.name })
      }
      return [...servers, server]
    },
    undefined,
    undefined,
    credentials
  )
}

export async function updateBotTool(
  cli: BotToolsHome,
  name: string,
  version: string,
  input: BotToolInput
): Promise<BotToolServer> {
  const taken = await botToolNameTaken(cli, input.name, name)
  if (taken) {
    throw taken
  }
  let updated: BotToolServer | undefined
  await changeBotToolServers(
    cli.folder,
    (servers) => {
      const previous = servers.find((entry) => entry.name === name)
      if (!previous) {
        throw new BotFailureError('toolGone')
      }
      updated = resolveBotToolInput(input, withSavedBotToolHeaders(cli.folder, previous))
      const replacement = updated
      return servers.map((server) => (server.name === name ? replacement : server))
    },
    version,
    { from: name, to: input.name }
  )
  if (!updated) {
    throw new BotFailureError('toolNotUpdated')
  }
  return updated
}
