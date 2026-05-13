import { Transform } from 'node:stream';

const POLL_PATH = '/api/worker/delegations/next';
/** @type {Set<string>} */
const silencedReqIds = new Set();
const MAX_SILENCED = 4000;

function trimSilencedSet() {
  if (silencedReqIds.size <= MAX_SILENCED) return;
  const keep = [...silencedReqIds].slice(-2000);
  silencedReqIds.clear();
  for (const id of keep) silencedReqIds.add(id);
}

/**
 * @param {string} line — une ligne JSON Pino (sans \n final)
 * @returns {boolean} true = écrire la ligne vers stdout
 */
function shouldEmitLine(line) {
  if (!line || line[0] !== '{') return true;
  let o;
  try {
    o = JSON.parse(line);
  } catch {
    return true;
  }
  const url = o.req?.url;
  if (typeof url === 'string' && url.includes(POLL_PATH)) {
    if (o.reqId != null) silencedReqIds.add(String(o.reqId));
    trimSilencedSet();
    return false;
  }
  if (o.msg === 'request completed' && o.reqId != null) {
    const id = String(o.reqId);
    if (silencedReqIds.has(id)) {
      silencedReqIds.delete(id);
      return false;
    }
  }
  return true;
}

/**
 * Stream intermédiaire : Pino écrit ici, on réémet vers stdout en masquant le poll worker.
 * Corrélation incoming (URL) / completed via `reqId`.
 * @returns {import('node:stream').Transform}
 */
export function createPinoDelegationsPollFilterStream() {
  let buf = '';
  const t = new Transform({
    transform(chunk, _enc, callback) {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.length > 0 && shouldEmitLine(line)) {
          this.push(`${line}\n`);
        }
      }
      callback();
    },
    flush(callback) {
      if (buf.length > 0) {
        const line = buf.replace(/\r?\n$/, '');
        buf = '';
        if (line.length > 0 && shouldEmitLine(line)) {
          this.push(`${line}\n`);
        }
      }
      callback();
    }
  });
  t.pipe(process.stdout, { end: false });
  return t;
}

/**
 * @returns {boolean}
 */
export function isDelegationsPollLogFilterEnabled() {
  const v = process.env.LOG_FILTER_DELEGATIONS_POLL?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off') return false;
  return true;
}
