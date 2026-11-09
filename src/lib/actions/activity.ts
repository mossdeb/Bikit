"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * One page opened by a signed-in account, added to its day in
 * user_activity_days (migration 00058, by request, 2026-11-09): which
 * page, with the ids taken out; the kind of device; and the country and
 * city Vercel reads off the request's IP. The IP itself goes nowhere.
 * Never fails loudly — a page must not break because it could not be
 * counted.
 */
export async function recordActivity(pathname: string): Promise<void> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub) return;
    const h = await headers();
    const city = h.get("x-vercel-ip-city");
    await supabase.rpc("record_user_activity", {
      p_area: areaOf(pathname),
      p_device: deviceOf(h.get("user-agent") ?? ""),
      p_country: h.get("x-vercel-ip-country") ?? "",
      // Vercel sends the city URL-encoded ("S%C3%A3o%20Br%C3%A1s").
      p_city: city ? safeDecode(city) : "",
    });
  } catch {
    // Counting is never worth an error on screen.
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The page without its ids: "/pro/sessoes/:id/pista". */
function areaOf(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] || "/";
  return path
    .split("/")
    .map((part) => (UUID.test(part) || /^\d+$/.test(part) ? ":id" : part))
    .join("/")
    .slice(0, 120);
}

function deviceOf(userAgent: string): string {
  if (/iPad|Tablet/i.test(userAgent)) return "tablet";
  if (/Mobi|Android|iPhone/i.test(userAgent)) return "mobile";
  return "desktop";
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
