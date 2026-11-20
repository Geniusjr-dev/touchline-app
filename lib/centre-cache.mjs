export function createCentreCache(load, maxAge = 20_000, maxEntries = 24) {
  const cache = new Map();
  const pending = new Map();
  const queuedRefreshes = new Map();
  function peek(id) {
    const entry = cache.get(id);
    return entry && Date.now() - entry.at < maxAge ? entry.data : null;
  }
  function read(id, { force = false } = {}) {
    if (pending.has(id)) {
      const request = pending.get(id);
      if (!force) return request;
      if (!queuedRefreshes.has(id)) {
        queuedRefreshes.set(id, request.catch(() => null).then(() => {
          queuedRefreshes.delete(id);
          return read(id, { force: true });
        }));
      }
      return queuedRefreshes.get(id);
    }
    const cached = !force && peek(id);
    if (cached) return Promise.resolve(cached);
    const request = Promise.resolve().then(() => load(id)).then((data) => {
      if (data) {
        cache.delete(id);
        cache.set(id, { data, at: Date.now() });
        if (cache.size > maxEntries) cache.delete(cache.keys().next().value);
      }
      return data;
    }).finally(() => pending.delete(id));
    pending.set(id, request);
    return request;
  }
  return { peek, read };
}
