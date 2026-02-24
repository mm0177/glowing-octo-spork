const windowMs = 60_000; // 1 minute
const maxRequests = 8;

const requests = new Map<string, number[]>();

export function checkRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
} {
  const now = Date.now();
  const windowStart = now - windowMs;
  const history = (requests.get(ip) ?? []).filter((t) => t > windowStart);

  if (history.length >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  history.push(now);
  requests.set(ip, history);
  return { allowed: true, remaining: maxRequests - history.length };
}

export function getClientIp(req: Request): string {
  const xff = (req.headers as Headers).get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
  return "unknown";
}
