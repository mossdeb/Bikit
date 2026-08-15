"use client"

import { useEffect } from "react"
import { useFormStatus } from "react-dom"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToastManager } from "@/components/ui/toast"
import { STRAVA_SYNC_TOAST_ID } from "@/components/strava-sync-toast"

/** Submit button for the manual Strava sync. The action itself takes a couple
 * of seconds (a Strava round trip plus the page re-render on the way back),
 * which read as nothing happening — so the click puts a toast up immediately
 * and StravaSyncToast replaces it with the outcome under the same id. */
export function StravaSyncButton({ label, pendingMessage }: { label: string; pendingMessage: string }) {
  const { pending } = useFormStatus()
  const toastManager = useToastManager()

  useEffect(() => {
    if (!pending) return
    // timeout 0 so it stays up for as long as the request does — the result
    // toast, added under the same id, is what dismisses it.
    toastManager.add({ id: STRAVA_SYNC_TOAST_ID, description: pendingMessage, type: "loading", timeout: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  return (
    <Button
      type="submit"
      variant="outline"
      size="sm"
      disabled={pending}
      // Smaller on a phone so it fits a third of the details grid, which is
      // what every other field there gets. Desktop keeps the size it had.
      className="h-7 gap-1 rounded-full bg-transparent px-2 text-xs sm:px-2.5 sm:text-sm [&_svg:not([class*='size-'])]:size-3"
    >
      <RefreshCw className={pending ? "size-3 motion-safe:animate-spin" : "size-3"} />
      {label}
    </Button>
  )
}
