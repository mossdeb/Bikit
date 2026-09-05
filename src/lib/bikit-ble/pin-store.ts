/**
 * Where a device's PIN is kept between connections: **with the account**, so
 * the laptop in the garage and the phone on the trail both open the same
 * logger without retyping it. The device asks on every BLE connection (it
 * forgets at disconnect); this only saves the typing, never the step.
 *
 * Server first, this browser second. The account row (migration 00042,
 * RLS-scoped) is the truth; localStorage keeps a copy so a flaky connection
 * to the server does not turn into a PIN prompt in a place with no signal,
 * and so the prompt does not wait on a round trip when the copy is here.
 * The copy is refreshed from the server whenever the server answers.
 *
 * Keyed by the device's advertised name (`BIKIT-176D`), known before
 * authentication; the chip uid, from INFO, is not.
 *
 * Every localStorage access is guarded: it throws in private windows and in
 * some embedded browsers, and a PIN that cannot be cached must degrade to
 * "ask again", never to a broken connect. Server failures are swallowed the
 * same way — a save that did not land means one more prompt, not an error
 * in the way of the transfer.
 */

import {
  forgetImuDevicePin,
  getImuDevicePin,
  saveImuDevicePin,
} from "@/lib/actions/imu";

const PREFIX = "bikit_ble_pin:";

function readLocal(deviceName: string): string | null {
  try {
    return localStorage.getItem(PREFIX + deviceName);
  } catch {
    return null;
  }
}

function writeLocal(deviceName: string, pin: string | null): void {
  try {
    if (pin === null) localStorage.removeItem(PREFIX + deviceName);
    else localStorage.setItem(PREFIX + deviceName, pin);
  } catch {
    // Nothing to do: the PIN will be asked for again next time.
  }
}

export async function loadDevicePin(
  deviceName: string,
): Promise<string | null> {
  try {
    const remote = await getImuDevicePin(deviceName);
    if (remote) {
      writeLocal(deviceName, remote);
      return remote;
    }
  } catch {
    // Server unreachable — fall through to the local copy.
  }
  return readLocal(deviceName);
}

export async function saveDevicePin(
  deviceName: string,
  pin: string,
): Promise<void> {
  writeLocal(deviceName, pin);
  try {
    await saveImuDevicePin(deviceName, pin);
  } catch {
    // Kept locally at least; the next successful save syncs it.
  }
}

export async function forgetDevicePin(deviceName: string): Promise<void> {
  writeLocal(deviceName, null);
  try {
    await forgetImuDevicePin(deviceName);
  } catch {
    // The local copy is gone, which is what stops the retry loop.
  }
}
