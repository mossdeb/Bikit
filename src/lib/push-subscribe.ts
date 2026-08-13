import { savePushSubscription } from "@/lib/actions/push";

/** The VAPID public key travels as base64url, but PushManager.subscribe only
 * takes raw bytes. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * Asks for permission and registers this device, shared by the settings
 * switch and the prompt that follows an install. One copy because the order
 * of the first two lines is load-bearing and easy to lose in a second one:
 * Safari only honours requestPermission() inside the gesture that triggered
 * it, so it has to run before any other await.
 *
 * Returns whether the device ended up subscribed. A refusal is a false, not
 * a throw — being told no is an ordinary outcome here.
 */
export async function subscribeToPush(vapidPublicKey: string): Promise<boolean> {
  try {
    if ((await Notification.requestPermission()) !== "granted") return false;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    await savePushSubscription(subscription.toJSON(), navigator.userAgent);
    return true;
  } catch (e) {
    console.error("[push] failed to subscribe", e);
    return false;
  }
}

/** Whether this browser can carry push at all. On iOS the PushManager only
 * exists once the app has been added to the Home Screen, which is why the
 * install prompt comes first and this one waits for a standalone launch. */
export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** iOS is the one platform where push needs the app installed: Safari only
 * exposes the PushManager to a Home Screen launch. Everywhere else a plain
 * tab can hold a subscription. iPadOS claims to be a Mac, so the touch count
 * is what separates them. */
export function isIosDevice(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

/** True only when the app is running as an installed app rather than a tab. */
export function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}
