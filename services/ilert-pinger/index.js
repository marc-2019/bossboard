/**
 * Cloud-side ilert health→heartbeat pinger.
 *
 * For each ILERT_HB_<NAME> + ILERT_HEALTH_<NAME> pair:
 *   1) GET health URL
 *   2) Only if healthy, GET ilert heartbeat URL
 *
 * Runs every 2 minutes + once on boot.
 * Exposes GET /health for Railway.
 */

import http from 'node:http';

const INTERVAL_MS = Number(process.env.ILERT_PING_INTERVAL_MS || 120_000);
const PORT = Number(process.env.PORT || 8080);
const UA = 'BossBoard-ilert-health-pinger/1.0';

function loadTargets() {
  const targets = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('ILERT_HB_') || !value) continue;
    const name = key.slice('ILERT_HB_'.length);
    const healthUrl = (process.env[`ILERT_HEALTH_${name}`] || '').trim();
    const heartbeatUrl = value.trim();
    if (!healthUrl || !heartbeatUrl.startsWith('https://')) continue;
    targets.push({ name, healthUrl, heartbeatUrl });
  }
  return targets;
}

async function probe(url, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': UA },
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

async function runCycle() {
  const targets = loadTargets();
  if (targets.length === 0) {
    console.warn(
      '[ilert-pinger] No ILERT_HB_* + ILERT_HEALTH_* pairs configured',
    );
    return { ok: false, results: [] };
  }

  const results = [];
  for (const t of targets) {
    const health = await probe(t.healthUrl);
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

    const hb = await probe(t.heartbeatUrl);
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
  return { ok: true, results };
}

let lastCycle = { at: null, results: [] };
let cycleInFlight = false;

async function safeCycle() {
  if (cycleInFlight) return;
  cycleInFlight = true;
  try {
    const out = await runCycle();
    lastCycle = { at: new Date().toISOString(), results: out.results };
  } catch (err) {
    console.error('[ilert-pinger] cycle failed:', err);
  } finally {
    cycleInFlight = false;
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    const body = JSON.stringify({
      status: 'ok',
      service: 'ilert-health-pinger',
      lastCycle,
      targets: loadTargets().map((t) => t.name),
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`[ilert-pinger] listening on :${PORT}`);
  const names = loadTargets().map((t) => t.name);
  console.log(
    `[ilert-pinger] targets (${names.length}): ${names.join(', ') || '(none)'}`,
  );
  void safeCycle();
  setInterval(() => void safeCycle(), INTERVAL_MS);
});
