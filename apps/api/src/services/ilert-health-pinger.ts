/**
 * Cloud-side ilert heartbeat pinger.
 *
 * Problem: Production alert sources were HEARTBEAT type, pinged from a home/office
 * machine. When home internet died, heartbeats expired and ilert emailed
 * "Production DOWN" even though Railway apps were healthy.
 *
 * Fix: from this API process (cloud), every few minutes:
 *   1) Probe a public health URL
 *   2) Only if healthy, GET the ilert heartbeat URL
 *
 * Config (env):
 *   ILERT_HEALTH_PINGER_ENABLED=true
 *   ILERT_HB_<NAME>=https://api.ilert.com/api/heartbeats/...
 *   ILERT_HEALTH_<NAME>=https://api.example.com/health
 *
 * Example:
 *   ILERT_HB_BOSSBOARD_API=https://api.ilert.com/api/heartbeats/il1hb...
 *   ILERT_HEALTH_BOSSBOARD_API=https://api.instilligent.com/health
 */

export interface IlertPingTarget {
  name: string;
  healthUrl: string;
  heartbeatUrl: string;
}

export interface IlertPingResult {
  name: string;
  healthOk: boolean;
  heartbeatOk: boolean;
  healthStatus?: number;
  heartbeatStatus?: number;
  error?: string;
}

function loadTargetsFromEnv(): IlertPingTarget[] {
  const targets: IlertPingTarget[] = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('ILERT_HB_') || !value) continue;
    const name = key.slice('ILERT_HB_'.length);
    const healthUrl = process.env[`ILERT_HEALTH_${name}`]?.trim() || '';
    const heartbeatUrl = value.trim();
    if (!healthUrl || !heartbeatUrl.startsWith('https://')) continue;
    targets.push({ name, healthUrl, heartbeatUrl });
  }
  return targets;
}

async function probe(
  url: string,
  timeoutMs: number,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'BossBoard-ilert-health-pinger/1.0' },
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run one ping cycle for all configured targets.
 * Safe no-op when disabled or no targets configured.
 */
export async function runIlertHealthPings(): Promise<{
  enabled: boolean;
  results: IlertPingResult[];
}> {
  const enabled =
    process.env.ILERT_HEALTH_PINGER_ENABLED === 'true' ||
    process.env.ILERT_HEALTH_PINGER_ENABLED === '1';

  if (!enabled) {
    return { enabled: false, results: [] };
  }

  const targets = loadTargetsFromEnv();
  if (targets.length === 0) {
    console.warn(
      '[ilert-pinger] Enabled but no ILERT_HB_* + ILERT_HEALTH_* pairs found',
    );
    return { enabled: true, results: [] };
  }

  const results: IlertPingResult[] = [];
  for (const t of targets) {
    const health = await probe(t.healthUrl, 12_000);
    if (!health.ok) {
      results.push({
        name: t.name,
        healthOk: false,
        heartbeatOk: false,
        healthStatus: health.status,
        error: health.error || `health HTTP ${health.status}`,
      });
      console.warn(
        `[ilert-pinger] ${t.name}: health FAIL (${health.status ?? health.error}) — not pinging heartbeat`,
      );
      continue;
    }

    const hb = await probe(t.heartbeatUrl, 12_000);
    results.push({
      name: t.name,
      healthOk: true,
      heartbeatOk: hb.ok,
      healthStatus: health.status,
      heartbeatStatus: hb.status,
      error: hb.ok ? undefined : hb.error || `heartbeat HTTP ${hb.status}`,
    });
    if (hb.ok) {
      console.log(`[ilert-pinger] ${t.name}: health OK → heartbeat OK`);
    } else {
      console.warn(
        `[ilert-pinger] ${t.name}: health OK but heartbeat FAIL (${hb.status ?? hb.error})`,
      );
    }
  }

  return { enabled: true, results };
}

export default {
  runIlertHealthPings,
  loadTargetsFromEnv,
};
