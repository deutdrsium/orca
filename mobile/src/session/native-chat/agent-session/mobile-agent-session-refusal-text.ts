import { agentSessionStartRefusalParts } from '../../../../../src/shared/agent-session/failures/agent-session-refusal-notice'
import type { AgentSessionRefusalReference } from '../../../../../src/shared/agent-session/failures/agent-session-wire-refusals'
import { agentSessionRefusalFailure } from '../../../../../src/shared/agent-session/failures/agent-session-write-failure'
import { mobileAgentSessionWriteNoticeText } from './agent-session-write-notice-copy'

/** A chat refusal from the host, in the phone's chat failure words. */
export function mobileAgentSessionRefusalText(refusal: AgentSessionRefusalReference): string {
  return mobileAgentSessionWriteNoticeText(
    agentSessionStartRefusalParts(agentSessionRefusalFailure(refusal))
  )
}
