import React from 'react'
import { View } from 'react-native'
import { tookOverLabel } from '../../../../../src/shared/native-chat/took-over-notice'
import { useMobileTranslation } from '../../../i18n/use-mobile-translation'
import { mobileNativeChatRowId } from './viewport/mobile-native-chat-reading-place'
import { styles } from './messages/mobile-native-chat-message-styles'
import { MobileNativeChatDivider } from './MobileNativeChatDivider'
import { nativeChatNoticeCopy } from './notices/native-chat-notice-copy'

/** Orca's first turn to a bot it just created, which the owner never typed. */
export function MobileNativeChatBotCreatedRow({ rowId }: { rowId: string }): React.JSX.Element {
  const t = useMobileTranslation()
  return (
    <View style={styles.row} testID={mobileNativeChatRowId(rowId)}>
      <MobileNativeChatDivider label={nativeChatNoticeCopy(t).botCreated} />
    </View>
  )
}

/** Orca's turn handing the bot a workspace: a divider naming it; any goal follows as the owner's words. */
export function MobileNativeChatTookOverRow({
  rowId,
  workspace
}: {
  rowId?: string
  workspace: string
}): React.JSX.Element {
  return (
    <View style={styles.row} testID={rowId ? mobileNativeChatRowId(rowId) : undefined}>
      <MobileNativeChatDivider label={tookOverLabel(workspace)} />
    </View>
  )
}
