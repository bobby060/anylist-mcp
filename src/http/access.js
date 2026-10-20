import { BlockList, isIP } from "net";

// ── Source IP allowlist ───────────────────────────────────────────────────────
// ALLOWED_IPS: comma-separated IPs/CIDRs. When set, every request except
// /health must come from one of them. For a Claude connector that means
// Anthropic's outbound range plus wherever you do the one-time browser setup.

let _cache = { raw: undefined, list: null };

function allowedList() {
  const raw = process.env.ALLOWED_IPS || "";
  if (raw !== _cache.raw) {
    const list = new BlockList();
    for (const entry of raw.split(",").map(s => s.trim()).filter(Boolean)) {
      const [net, prefix] = entry.split("/");
      const type = isIP(net) === 6 ? "ipv6" : "ipv4";
      if (prefix) list.addSubnet(net, parseInt(prefix, 10), type);
      else list.addAddress(net, type);
    }
    _cache = { raw, list: raw ? list : null };
  }
  return _cache.list;
}

export function isIpAllowed(ip) {
  const list = allowedList();
  if (!list) return true;
  if (!ip) return false;
  const addr = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  return list.check(addr, isIP(addr) === 6 ? "ipv6" : "ipv4");
}

export function requireAllowedIp(req, res, next) {
  if (req.path === "/health" || isIpAllowed(req.ip)) return next();
  console.log(`[access] blocked ${req.method} ${req.path} from ip=${req.ip}`);
  res.status(403).json({ error: "forbidden" });
}

// ── Setup gate ────────────────────────────────────────────────────────────────
// The browser-facing pages (login, register, AnyList setup, OAuth consent) are
// only needed while someone is connecting a client. Keep SETUP_OPEN=false the
// rest of the time so no login form is reachable; the token-based endpoints
// Claude uses day to day are unaffected.

export function isSetupOpen() {
  return process.env.SETUP_OPEN === "true";
}

export function requireSetupOpen(req, res, next) {
  if (isSetupOpen()) return next();
  console.log(`[access] setup closed: ${req.method} ${req.path} ip=${req.ip}`);
  res.status(404).send("Not found");
}
