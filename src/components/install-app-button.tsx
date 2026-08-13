"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { InstallAppHowToButton, type InstallAppLabels } from "@/components/install-app-dialog";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function subscribeStandalone(callback: () => void) {
  const mql = window.matchMedia("(display-mode: standalone)");
  mql.addEventListener("change", callback);
  window.addEventListener("appinstalled", callback);
  return () => {
    mql.removeEventListener("change", callback);
    window.removeEventListener("appinstalled", callback);
  };
}

export function InstallAppButton({
  installButtonLabel,
  installedLabel,
  howToLabel,
  installLabels,
}: {
  installButtonLabel: string;
  installedLabel: string;
  howToLabel: string;
  installLabels: InstallAppLabels;
}) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  // Same hydration-safety approach as AppSidebar: the server can't know the
  // display mode, so this falls back to "not installed" until the client
  // mounts and reports the real value. Which platform it is no longer
  // matters here — the card that follows works that out for itself.
  const installed = useSyncExternalStore(subscribeStandalone, isStandalone, () => false);

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return <span className="text-sm text-muted-foreground">{installedLabel}</span>;
  }

  if (deferredPrompt) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={async () => {
          await deferredPrompt.prompt();
          setDeferredPrompt(null);
        }}
      >
        {installButtonLabel}
      </Button>
    );
  }

  // No browser prompt to offer, so the answer is the illustrated card — the
  // same one the dashboard shows once. It used to be a button that unfolded a
  // single line of iOS text; side by side with the card that was three ways
  // to say one thing, and the line was the worst of them.
  return <InstallAppHowToButton labels={installLabels} buttonLabel={howToLabel} />;
}
