// Tiny key-value store for quotas, cookies and clip jobs.
// Uses Upstash Redis over REST when configured (Vercel → Storage → Upstash Redis
// sets KV_REST_API_URL / KV_REST_API_TOKEN), otherwise an in-memory map
// (fine for local dev; on serverless it resets between instances).
const mem = new Map(); // key -> { v, exp }

function memGet(k) {
  const e = mem.get(k);
  if (!e) return null;
  if (e.exp && e.exp < Date.now()) {
    mem.delete(k);
    return null;
  }
  return e.v;
}

export function store(env = {}) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    const call = async (cmds) => {
      const r = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(cmds),
      });
      if (!r.ok) throw new Error(`kv ${r.status}`);
      return (await r.json()).map((x) => x.result);
    };
    return {
      persistent: true,
      async get(k) {
        const [v] = await call([['GET', k]]);
        return v == null ? null : JSON.parse(v);
      },
      async set(k, v, ttl) {
        await call([ttl ? ['SET', k, JSON.stringify(v), 'EX', ttl] : ['SET', k, JSON.stringify(v)]]);
      },
      async incr(k, by, ttl) {
        const [v] = await call([['INCRBY', k, by], ['EXPIRE', k, ttl]]);
        return Number(v);
      },
    };
  }

  return {
    persistent: false,
    async get(k) {
      return memGet(k);
    },
    async set(k, v, ttl) {
      mem.set(k, { v, exp: ttl ? Date.now() + ttl * 1000 : 0 });
    },
    async incr(k, by, ttl) {
      const v = (Number(memGet(k)) || 0) + by;
      mem.set(k, { v, exp: Date.now() + ttl * 1000 });
      return v;
    },
  };
}
