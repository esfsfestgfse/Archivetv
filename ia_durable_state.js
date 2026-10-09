/* Private binding protocol. KV is only a cache; this object serializes the
   durable union so simultaneous workers cannot discard another discovery. */
import { normalizeIaFileRecord } from './ia_file_contract.js';

function mergeProgress(old = {}, next = {}) {
  const out = { ...old, ...next, steps: Math.max(old.steps || 0, next.steps || 0), parentCursor: Math.max(old.parentCursor || 0, next.parentCursor || 0) };
  for (const group of ['rails', 'parents']) {
    out[group] = { ...(old[group] || {}) };
    for (const [key, value] of Object.entries(next[group] || {}).slice(0, group === 'rails' ? 12 : 4096)) {
      const prior = out[group][key], field = group === 'rails' ? 'page' : 'offset';
      if (!prior || (value.generation || 0) > (prior.generation || 0) || (value.generation || 0) === (prior.generation || 0) && (value[field] || 0) >= (prior[field] || 0)) out[group][key] = value;
    }
  }
  return out;
}

export function mergeIaOwnedState(kind, old = {}, next = {}) {
  if (kind === 'discovery') return mergeProgress(old, next);
  if (kind === 'ledger') {
    const rows = new Map();
    for (const row of [...(old.items || []), ...(next.items || [])]) {
      if (!row?.id) continue;
      const prior = rows.get(row.id);
      if (!prior || Number(row.issuedAt || 0) >= Number(prior.issuedAt || 0)) rows.set(row.id, row);
    }
    return { ...old, ...next, items: [...rows.values()].sort((a, b) => (a.issuedAt || 0) - (b.issuedAt || 0)).slice(-256) };
  }
  const rows = new Map();
  for (const row of [...(old.candidateItems || old.items || []), ...(next.candidateItems || next.items || [])]) {
    if (!row?.identifier) continue;
    const key = normalizeIaFileRecord(row).logicalId, prior = rows.get(key);
    if (!prior) rows.set(key, row);
    else if (prior.identifier === row.identifier) {
      const known = object => Object.fromEntries(Object.entries(object || {}).filter(([, value]) => value !== null && value !== undefined && value !== '' && value !== 0));
      rows.set(key, { ...prior, ...known(row), media: { ...prior.media, ...known(row.media) } });
    } else if (Number(row.media?.verifiedAt || row.verifiedAt || 0) > Number(prior.media?.verifiedAt || prior.verifiedAt || 0)) rows.set(key, row);
  }
  const candidateItems = [...rows.values()].slice(-2048);
  return { ...old, ...next, candidateItems, candidates: candidateItems.length, catalogOrderLocked: true, lastGood: true };
}

export async function readIaChunkedState(storage, prefix) {
  const index = await storage.get(prefix + ':index');
  if (!index?.chunks) return null;
  if (!Number.isInteger(index.chunks) || index.chunks < 1 || index.chunks > 512) throw new Error('invalid state index');
  const keys = Array.from({ length: index.chunks }, (_, i) => prefix + ':' + i), values = new Map();
  for (let i = 0; i < keys.length; i += 128) {
    for (const [key, value] of await storage.get(keys.slice(i, i + 128))) values.set(key, value);
  }
  return JSON.parse(keys.map(key => values.get(key) || '').join(''));
}

// Caller wraps writes in a storage transaction; never publish a partial index.
export async function writeIaChunkedState(storage, prefix, next) {
  const index = await storage.get(prefix + ':index'), encoded = JSON.stringify(next);
  const chunks = Math.ceil(encoded.length / 12000), writes = { [prefix + ':index']: { chunks } };
  if (chunks > 512) throw new Error('state size limit');
  for (let i = 0; i < chunks; i++) writes[prefix + ':' + i] = encoded.slice(i * 12000, (i + 1) * 12000);
  const entries = Object.entries(writes);
  for (let i = 0; i < entries.length; i += 128) await storage.put(Object.fromEntries(entries.slice(i, i + 128)));
  if ((index?.chunks || 0) > chunks) {
    const obsolete = Array.from({ length: index.chunks - chunks }, (_, i) => prefix + ':' + (chunks + i));
    for (let i = 0; i < obsolete.length; i += 128) await storage.delete(obsolete.slice(i, i + 128));
  }
}

export async function handleIaOwnedState(ctx, body) {
  if (!['catalog', 'ledger', 'discovery'].includes(body.kind)) return Response.json({ error: 'invalid state kind' }, { status: 400 });
  const prefix = 'ia-owned:' + body.kind;
  const operation = async storage => {
    const old = await readIaChunkedState(storage, prefix) || {};
    if (body.read === true) return Response.json(old);
    const next = mergeIaOwnedState(body.kind, old, body.payload || {});
    await writeIaChunkedState(storage, prefix, next);
    return Response.json(next);
  };
  const run = () => ctx.storage.transaction(operation);
  return ctx.blockConcurrencyWhile(run);
}
