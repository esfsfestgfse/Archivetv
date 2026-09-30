/* Opt-in Roku receiver session state.
 *
 * This is deliberately separate from Chromecast and from normal playback
 * queues. A Roku receiver polls one session, while the browser/mobile remote
 * appends small commands and the latest playback state. No current channel
 * path reads this object unless a Roku session is explicitly created.
 */

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const RECEIVER_ONLINE_MS = 30 * 1000;
const MAX_COMMANDS = 32;
const MAX_TEXT = 240;
const ALLOWED_ACTIONS = new Set([
  "TUNE", "NEXT", "PREV", "SKIP", "GUIDE", "BACK", "PLAY", "PAUSE", "STOP",
  "POWER", "MUTE", "VOLUME", "HEARTBEAT",
]);

function text(value, limit = MAX_TEXT) {
  return String(value || "").trim().slice(0, limit);
}

function safeSession(value) {
  return text(value, 96).replace(/[^A-Za-z0-9._:-]/g, "");
}

function safeUrl(value) {
  const candidate = text(value, 4096);
  try {
    const url = new URL(candidate);
    if (!/^https?:$/.test(url.protocol)) return "";
    return url.href;
  } catch (_) {
    return "";
  }
}

function safeMedia(value) {
  if (!value || typeof value !== "object") return null;
  const url = safeUrl(value.url);
  if (!url) return null;
  const type = String(value.type || "video").toLowerCase() === "audio" ? "audio" : "video";
  return {
    url,
    type,
    title: text(value.title),
    source: text(value.source, 80),
    duration: Math.max(0, Math.min(86_400, Number(value.duration) || 0)),
    poster: safeUrl(value.poster),
  };
}

function safeState(value) {
  const input = value && typeof value === "object" ? value : {};
  const channel = Math.max(0, Math.min(9999, Number(input.channel) || 0));
  return {
    channel,
    channelName: text(input.channelName),
    powered: input.powered !== false,
    title: text(input.title),
    subtitle: text(input.subtitle),
    volume: Math.max(0, Math.min(1, Number(input.volume) || 0)),
    muted: input.muted === true,
    guideOpen: input.guideOpen === true,
    media: safeMedia(input.media),
    updatedAt: Date.now(),
  };
}

function safeCommand(value) {
  const input = value && typeof value === "object" ? value : {};
  const action = text(input.action, 24).toUpperCase();
  if (!ALLOWED_ACTIONS.has(action) || action === "HEARTBEAT") return null;
  const payload = {
    action,
    channel: Math.max(0, Math.min(9999, Number(input.channel) || 0)),
    level: Math.max(0, Math.min(1, Number(input.level) || 0)),
    muted: input.muted === true,
    guideOpen: input.guideOpen === true,
    media: safeMedia(input.media),
    sentAt: Date.now(),
  };
  return payload;
}

function emptyState(code) {
  return {
    version: 1,
    code,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    sequence: 0,
    commands: [],
    state: safeState({}),
    receiver: { online: false, lastSeenAt: 0, model: "" },
    controllerLastSeenAt: Date.now(),
  };
}

export class RokuSession {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async read() {
    const value = await this.ctx.storage.get("session");
    if (!value || typeof value !== "object") return null;
    if (Number(value.expiresAt) && Date.now() > Number(value.expiresAt)) return null;
    return value;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const code = safeSession(url.searchParams.get("code") || request.headers.get("X-RealSignal-Roku-Code"));
    const action = text(url.searchParams.get("action"), 24).toLowerCase();
    const current = await this.read();

    if (request.method === "GET") {
      if (!current || !code || code !== current.code) return Response.json({ error: "Roku session not found" }, { status: 404 });
      const since = Math.max(0, Number(url.searchParams.get("since")) || 0);
      const now = Date.now();
      return Response.json({
        ok: true,
        version: 1,
        session: current.code,
        expiresAt: current.expiresAt,
        sequence: current.sequence,
        state: current.state,
        commands: current.commands.filter((item) => Number(item.sequence) > since),
        receiver: {
          online: now - Number(current.receiver && current.receiver.lastSeenAt || 0) <= RECEIVER_ONLINE_MS,
          lastSeenAt: Number(current.receiver && current.receiver.lastSeenAt || 0),
          model: text(current.receiver && current.receiver.model, 120),
        },
      }, { headers: { "Cache-Control": "no-store" } });
    }

    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET,POST" } });
    let body;
    try { body = await request.json(); } catch (_) { return Response.json({ error: "invalid Roku session payload" }, { status: 400 }); }
    const requestedAction = text(body && body.action, 24).toLowerCase();

    if (requestedAction === "init") {
      const initCode = safeSession(body && body.code);
      if (!initCode || initCode !== code) return Response.json({ error: "invalid Roku session code" }, { status: 401 });
      const next = current || emptyState(initCode);
      next.state = safeState(body && body.state);
      next.expiresAt = Date.now() + SESSION_TTL_MS;
      next.controllerLastSeenAt = Date.now();
      await this.ctx.storage.put("session", next);
      return Response.json({ ok: true, session: next.code, expiresAt: next.expiresAt, state: next.state });
    }

    if (!current || !code || code !== current.code) return Response.json({ error: "Roku session not found" }, { status: 404 });
    const now = Date.now();
    current.expiresAt = now + SESSION_TTL_MS;

    if (requestedAction === "heartbeat") {
      current.receiver = { online: true, lastSeenAt: now, model: text(body && body.model, 120) };
      await this.ctx.storage.put("session", current);
      return Response.json({ ok: true, sequence: current.sequence, expiresAt: current.expiresAt });
    }

    if (requestedAction === "command") {
      const command = safeCommand(body && body.command);
      if (!command) return Response.json({ error: "unsupported Roku command" }, { status: 400 });
      current.sequence = Number(current.sequence || 0) + 1;
      command.sequence = current.sequence;
      current.commands = (Array.isArray(current.commands) ? current.commands : []).concat(command).slice(-MAX_COMMANDS);
      if (body && body.state) current.state = safeState(body.state);
      current.controllerLastSeenAt = now;
      await this.ctx.storage.put("session", current);
      return Response.json({ ok: true, sequence: current.sequence, expiresAt: current.expiresAt });
    }

    return Response.json({ error: "unsupported Roku session action" }, { status: 400 });
  }
}

export { safeCommand, safeMedia, safeState };
