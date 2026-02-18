import { useUiStore } from '../stores/ui'
import type { ConnectionMode } from '../../shared/types'

declare global {
  interface Window {
    NATIVE_API_BASE?: string
    _nativeSSEHandler?: (json: string) => void
    nativeBridge?: {
      triggerToolbarAction?: (action: string) => void
      setConnectionStatus?: (status: ConnectionMode) => void
      onSelectionChanged?: (selected: number, total: number) => void
    }
  }
}

export function useNativeBridge() {
  const uiStore = useUiStore()

  // Native app injects SSE events by calling this function
  window._nativeSSEHandler = (json: string) => {
    try {
      const event = JSON.parse(json)
      // SSE composable listens for this custom event
      window.dispatchEvent(new CustomEvent('native-sse', { detail: event }))
    } catch (e) {
      console.error('[NativeBridge] Failed to parse SSE event', e)
    }
  }

  // Native app can trigger toolbar actions
  window.nativeBridge = {
    triggerToolbarAction: (action: string) => {
      window.dispatchEvent(new CustomEvent('toolbar-action', { detail: action }))
    },
    setConnectionStatus: (status: ConnectionMode) => {
      uiStore.connectionMode = status
    },
    onSelectionChanged: undefined,
  }

  return {
    apiBase: window.NATIVE_API_BASE ?? '',
    isNative: !!window.NATIVE_API_BASE,
  }
}