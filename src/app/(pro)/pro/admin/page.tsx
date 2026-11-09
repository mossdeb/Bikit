import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/lab-access";

/**
 * Administration (by request, 2026-11-09): how each account uses the app,
 * read off the daily summaries in user_activity_days (migration 00058) and
 * the accounts' own rows. The owner's account only — anyone else gets a
 * page that does not exist. Read with the service role, server-side; no
 * account's data leaves this page. In Portuguese only, like the lab's
 * probes: one reader.
 */
export const dynamic = "force-dynamic";

/** The window the activity columns are read over, days. */
const WINDOW_DAYS = 30;

type Account = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  lastSeenAt: string | null;
  activeDays7: number;
  activeDays30: number;
  pages30: number;
  place: string | null;
  devices: string[];
  sessions: number;
  lastSessionAt: string | null;
  bikes: number;
};

const DAY_MS = 86_400_000;

function lisbonDay(offsetDays: number): string {
  const d = new Date(Date.now() - offsetDays * DAY_MS);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });
}

/** "hoje", "ontem", "há 3 dias", or the date. */
function ago(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
  if (days <= 0) {
    const hours = Math.floor(
      (Date.now() - new Date(iso).getTime()) / 3_600_000,
    );
    return hours <= 0 ? "agora" : `há ${hours} h`;
  }
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const DEVICE_LABEL: Record<string, string> = {
  desktop: "Computador",
  mobile: "Telemóvel",
  tablet: "Tablet",
};

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!isAdmin(claims?.claims?.email as string | undefined)) notFound();

  const admin = createAdminClient();
  const since30 = lisbonDay(WINDOW_DAYS - 1);
  const since7 = lisbonDay(6);
  const [
    { data: usersPage },
    { data: activity },
    { data: sessions },
    { data: bikes },
  ] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin
      .from("user_activity_days")
      .select(
        "user_id, day, last_seen_at, page_views, areas, devices, country, city",
      )
      .gte("day", since30)
      .order("day", { ascending: false }),
    admin.from("imu_sessions").select("user_id, created_at"),
    admin.from("bikes").select("user_id"),
  ]);

  const rows = activity ?? [];
  const accounts: Account[] = (usersPage?.users ?? []).map((u) => {
    const mine = rows.filter((r) => r.user_id === u.id);
    const latest = mine[0] ?? null;
    const mySessions = (sessions ?? []).filter((s) => s.user_id === u.id);
    const lastSessionAt = mySessions.reduce<string | null>(
      (a, s) => (a == null || s.created_at > a ? s.created_at : a),
      null,
    );
    const lastSeen = mine.reduce<string | null>(
      (a, r) => (a == null || r.last_seen_at > a ? r.last_seen_at : a),
      null,
    );
    const metadata = u.user_metadata as { full_name?: string } | undefined;
    return {
      id: u.id,
      email: u.email ?? "",
      name: metadata?.full_name?.trim() || null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      lastSeenAt: lastSeen,
      activeDays7: mine.filter((r) => r.day >= since7).length,
      activeDays30: mine.length,
      pages30: mine.reduce((n, r) => n + r.page_views, 0),
      place: latest?.city
        ? `${latest.city}${latest.country ? `, ${latest.country}` : ""}`
        : (latest?.country ?? null),
      devices: [...new Set(mine.flatMap((r) => r.devices))],
      sessions: mySessions.length,
      lastSessionAt,
      bikes: (bikes ?? []).filter((b) => b.user_id === u.id).length,
    };
  });
  // The most recently active first; then by the last sign-in.
  const recency = (a: Account) => a.lastSeenAt ?? a.lastSignInAt ?? "";
  accounts.sort((a, b) => recency(b).localeCompare(recency(a)));

  const active7 = new Set(
    rows.filter((r) => r.day >= since7).map((r) => r.user_id),
  ).size;
  const active30 = new Set(rows.map((r) => r.user_id)).size;
  const pages30 = rows.reduce((n, r) => n + r.page_views, 0);

  // The pages most used: how many account-days opened each.
  const areaCounts = new Map<string, number>();
  for (const r of rows)
    for (const area of r.areas)
      areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);
  const topAreas = [...areaCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  // Where from: account-days per place.
  const placeCounts = new Map<string, number>();
  for (const r of rows) {
    if (!r.country) continue;
    const place = r.city ? `${r.city}, ${r.country}` : r.country;
    placeCounts.set(place, (placeCounts.get(place) ?? 0) + 1);
  }
  const topPlaces = [...placeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const tiles = [
    { label: "Contas", value: accounts.length },
    { label: "Ativas nos últimos 7 dias", value: active7 },
    { label: `Ativas nos últimos ${WINDOW_DAYS} dias`, value: active30 },
    { label: `Páginas abertas em ${WINDOW_DAYS} dias`, value: pages30 },
  ];

  return (
    <div className="space-y-6 pt-4 pb-10 sm:pt-8">
      <div>
        <h1 className="font-display text-2xl font-semibold">Administração</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Como as contas usam a app, a partir do resumo diário de utilização. O
          registo começou a 9 de novembro de 2026; antes disso só há o último
          login.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p className="mt-1 font-display text-3xl font-bold tabular-nums">
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">Conta</th>
                <th className="px-3 py-3 font-medium">Última atividade</th>
                <th className="px-3 py-3 font-medium">Último login</th>
                <th className="px-3 py-3 text-right font-medium">
                  Dias ativos
                  <span className="block font-normal">
                    7 d · {WINDOW_DAYS} d
                  </span>
                </th>
                <th className="px-3 py-3 text-right font-medium">
                  Páginas
                  <span className="block font-normal">{WINDOW_DAYS} d</span>
                </th>
                <th className="px-3 py-3 font-medium">De onde</th>
                <th className="px-3 py-3 font-medium">Dispositivo</th>
                <th className="px-3 py-3 text-right font-medium">Bicicletas</th>
                <th className="px-5 py-3 text-right font-medium">
                  Sessões IMU
                  <span className="block font-normal">última</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-border last:border-0 align-top"
                >
                  <td className="px-5 py-3">
                    <p className="font-medium">{a.name ?? a.email}</p>
                    {a.name && (
                      <p className="text-xs text-muted-foreground">{a.email}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Criada a {shortDate(a.createdAt)}
                    </p>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {ago(a.lastSeenAt)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                    {ago(a.lastSignInAt)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {a.activeDays7} · {a.activeDays30}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {a.pages30}
                  </td>
                  <td className="px-3 py-3">{a.place ?? "—"}</td>
                  <td className="px-3 py-3">
                    {a.devices.length > 0
                      ? a.devices.map((d) => DEVICE_LABEL[d] ?? d).join(", ")
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {a.bikes}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {a.sessions}
                    {a.lastSessionAt && (
                      <span className="block text-xs text-muted-foreground">
                        {ago(a.lastSessionAt)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg bg-card p-5">
          <h2 className="font-semibold">Páginas mais usadas</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Em quantos dias, somando as contas, cada página foi aberta (
            {WINDOW_DAYS} d).
          </p>
          {topAreas.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Ainda sem dados.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {topAreas.map(([area, n]) => (
                <li
                  key={area}
                  className="flex items-center justify-between gap-4 py-2 text-sm"
                >
                  <span className="min-w-0 truncate font-mono text-xs">
                    {area}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {n}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg bg-card p-5">
          <h2 className="font-semibold">De onde acedem</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Cidade aproximada, pelo endereço IP; em quantos dias, somando as
            contas ({WINDOW_DAYS} d).
          </p>
          {topPlaces.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Ainda sem dados.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {topPlaces.map(([place, n]) => (
                <li
                  key={place}
                  className="flex items-center justify-between gap-4 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">{place}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {n}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
