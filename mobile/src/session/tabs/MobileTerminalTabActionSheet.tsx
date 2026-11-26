import { ActionSheetModal } from '../../components/sheets/ActionSheetModal'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { getMobileTerminalActionSheetActions } from '../../terminal/session/tab-actions/mobile-terminal-action-sheet-actions'
import { isTerminalPhoneDisplayMode } from '../../terminal/session/pane-layout/terminal-phone-display-mode'
import { useMobileAllowAutoCloseActions } from './mobile-worker-auto-close'
import { mobileSessionTabMenuHeader } from './MobileSessionTabMark'
import type { MobileSessionController } from '../use-mobile-session-controller'
import { useWorkspaceOnPairedHost } from '../../navigation/workspace-execution-host'
import {
  getMobileTerminalChatContinuationActions,
  resolveMobileTerminalChatContinuation
} from '../native-chat/history/mobile-terminal-chat-continuation-actions'
import { continueMobileTerminalInChat } from '../mobile-terminal-chat-continuation'

/** The tapped terminal tab's actions: chat view, display size, rename, clear, close. */
export function MobileTerminalTabActionSheet({
  controller
}: {
  controller: MobileSessionController
}) {
  const t = useMobileTranslation()
  const { actionTarget, setActionTarget, sessionTabs } = controller
  const workerActions = useMobileAllowAutoCloseActions(
    controller.client,
    actionTarget && { terminal: actionTarget.handle }
  )
  const workspaceOnPairedHost = useWorkspaceOnPairedHost()
  const terminalTabs = sessionTabs.filter((tab) => tab.type === 'terminal')
  const chatContinuationActions = getMobileTerminalChatContinuationActions({
    continuation: resolveMobileTerminalChatContinuation({
      tab: actionTarget && terminalTabs.find((tab) => tab.terminal === actionTarget.handle),
      hostCapabilities: controller.hostCapabilities,
      workspaceOnPairedHost
    }),
    onDismiss: () => setActionTarget(null),
    onContinue: (continuation) => void continueMobileTerminalInChat(controller, continuation)
  }).map((action) => ({
    ...action,
    disabled: controller.createTabBusy || controller.connState !== 'connected'
  }))
  return (
    <ActionSheetModal
      visible={actionTarget != null}
      {...mobileSessionTabMenuHeader(
        actionTarget && terminalTabs.find((tab) => tab.terminal === actionTarget.handle),
        controller.terminals
      )}
      groupDestructive
      title={actionTarget?.title || t('session.sheets.terminal', 'Terminal')}
      actions={getMobileTerminalActionSheetActions({
        target: actionTarget,
        tabs: terminalTabs,
        isTabChatView: controller.nativeChatController.isTabChatView,
        nativeChatTranscriptIsLocalReadable: controller.nativeChatTranscriptIsLocalReadable,
        onDismiss: () => setActionTarget(null),
        onToggleChat: controller.toggleTabChatView,
        chatContinuationActions,
        isPhoneMode: (handle) => isTerminalPhoneDisplayMode(handle, controller.terminalModes),
        onToggleDisplayMode: (handle) => void controller.toggleDisplayMode(handle),
        onRename: controller.setRenameTarget,
        onClear: (target) => void controller.handleClearTerminal(target),
        onClose: (target) => void controller.handleCloseTerminal(target),
        onCloseSessionTab: (tab) => void controller.handleCloseSessionTab(tab),
        bulkCloseActions: controller.bulkCloseActions,
        workerActions
      })}
      onClose={() => setActionTarget(null)}
    />
  )
}
