'use client'

import { useStore } from '@/store/useStore'

/**
 * Guards a user's first real action in Trading, Academy, or Auto Trader
 * behind the disclaimer + risk-tier dialog (TradingGateDialog.tsx). Once
 * profile.trading_disclaimer_accepted_at is set, every call just runs the
 * action immediately — this only interrupts once, ever, per account.
 */
export function useTradingGate() {
  const { profile, setTradingGatePrompt } = useStore()

  const guardFirstAction = (action: () => void) => {
    if (profile?.trading_disclaimer_accepted_at) {
      action()
      return
    }
    setTradingGatePrompt({ onAccept: action })
  }

  return { guardFirstAction }
}
