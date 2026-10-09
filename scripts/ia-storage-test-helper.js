/* Realistic bounded Durable Object storage for IA behavioral tests. */
const assert = require('node:assert/strict');
function rotationContext(seed) {
  const data = new Map(seed ? [['rotation', structuredClone(seed)]] : []);
  let tail = Promise.resolve();
  const storage = {
    async get(key) {
      if (!Array.isArray(key)) return structuredClone(data.get(key));
      assert.ok(key.length <= 128);
      return new Map(key.filter(k => data.has(k)).map(k => [k, structuredClone(data.get(k))]));
    },
    async put(key, value) {
      const entries = typeof key === 'object' ? Object.entries(key) : [[key, value]];
      assert.ok(entries.length <= 128);
      for (const [k, v] of entries) {
        assert.ok(Buffer.byteLength(JSON.stringify(v)) < 128 * 1024);
        data.set(k, structuredClone(v));
      }
    },
    async delete(keys) {
      keys = Array.isArray(keys) ? keys : [keys]; assert.ok(keys.length <= 128);
      keys.forEach(k => data.delete(k));
    },
    async transaction(fn) {
      const before = structuredClone(data);
      try { return await fn(storage); }
      catch (error) { data.clear(); for (const entry of before) data.set(...entry); throw error; }
    },
  };
  return { storage, blockConcurrencyWhile(fn) { const work = tail.then(fn); tail = work.catch(() => {}); return work; },
    snapshot() {
      const index = data.get('ia-reservation:index');
      return index ? JSON.parse(Array.from({ length: index.chunks }, (_, i) => data.get('ia-reservation:' + i)).join('')) : structuredClone(data.get('rotation'));
    }, data };
}
module.exports = { rotationContext };
