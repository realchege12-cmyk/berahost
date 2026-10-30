import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import zlib from "node:zlib";
import { logger } from "./logger";

const _require = createRequire(import.meta.url);

export type WASenderStatus = "disconnected" | "connecting" | "connected";

let _status: WASenderStatus = "disconnected";
let _sock: any = null;
let _sessionDir: string | null = null;

// ── Dual-socket lifecycle tracking — prevents aesDecryptGCM crypto conflicts ──
let _activeConn: any = null;
let _reconnecting = false;

export function getWASenderStatus(): WASenderStatus {
  return _status;
}

// ── Connected-event listeners ─────────────────────────────────────────────────
type ConnectedCallback = () => void;
const _connectedCallbacks: ConnectedCallback[] = [];

export function onWASenderConnected(cb: ConnectedCallback): void {
  _connectedCallbacks.push(cb);
}

function fireConnected(): void {
  for (const cb of _connectedCallbacks) {
    try { cb(); } catch {}
  }
}

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  if (_status !== "connected" || !_sock) {
    throw new Error("Platform WhatsApp sender is not connected");
  }
  const normalized = String(to).replace(/\D/g, "");
  const jid = `${normalized}@s.whatsapp.net`;
  await _sock.sendMessage(jid, { text });
}

export function compressCredsToSession(credsPath: string): string {
  const data = fs.readFileSync(credsPath);
  const compressed = zlib.gzipSync(data);
  return "BERAHOST~" + compressed.toString("base64");
}

export function decompressSessionToCreds(session: string, dir: string): void {
  const b64 = session.startsWith("BERAHOST~") ? session.slice(9) : session;
  const buf = Buffer.from(b64, "base64");
  const decompressed = zlib.gunzipSync(buf);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "creds.json"), decompressed);
}

function makeSilentLogger() {
  const pino = _require("pino");
  return pino({ level: "fatal" });
}

// ── Suppress Baileys / Signal Protocol noise ─────────────────────────────────
// Mirrors the noise-filter from the reference connection file so production
// logs stay clean when BERAHOST boots the platform WA sender.
const _noisePatterns = [
  "Closing session:", "Closing open session", "Decrypted message with closed session",
  "_chains:", "registrationId:", "currentRatchet:", "ephemeralKeyPair:",
  "pubKey: <Buffer", "privKey: <Buffer", "lastRemoteEphemeralKey:",
  "previousCounter:", "rootKey: <Buffer", "indexInfo:", "baseKey: <Buffer",
  "baseKeyType:", "remoteIdentityKey:", "pendingPreKey:", "signedKeyId:",
  "preKeyId:", "closed: -1", "used: 17", "created: 17", "messageKeys: {}",
  "chainKey: [Object]", "chainType:", "SessionEntry {",
  "pre key", "prekey", "pre-key", "uploading pre", "need to generate",
  "generating pre", "key bundle", "key count", "uploading keys",
  "count of pre keys", "refilling keys", "upload pre", "refreshing keys",
  "sending key bundle", "identity key", "signed pre key", "one-time pre",
  "recv", "send node", "got ping", "send ping", "keep alive", "keepalive",
  "noise handshake", "decrypt", "encrypt node", "connecting to WA",
  "connect to WA", "message retry", "waiting for", "decrypt message",
  "frame noise", "frame encode", "frame decode", "WA noise",
];
function _isNoise(args: unknown[]): boolean {
  const s = String(args[0] ?? "").toLowerCase();
  return _noisePatterns.some((p) => s.includes(p.toLowerCase()));
}
const _origLog   = console.log.bind(console);
const _origWarn  = console.warn.bind(console);
const _origError = console.error.bind(console);
console.log   = (...a: unknown[]) => { if (!_isNoise(a)) _origLog(...a); };
console.warn  = (...a: unknown[]) => { if (!_isNoise(a)) _origWarn(...a); };
console.error = (...a: unknown[]) => { if (!_isNoise(a)) _origError(...a); };

type SessionCallback = (sessionId: string) => void;
type ErrorCallback   = (msg: string)       => void;
type CodeCallback    = (code: string)       => void;

// ── Shared: read creds.json and emit session string ──────────────────────────
async function extractAndEmitSession(
  sessDir: string,
  onSession: SessionCallback,
  onError: ErrorCallback,
  setStatus: (s: WASenderStatus) => void,
): Promise<void> {
  try {
    await new Promise((r) => setTimeout(r, 3000));
    const credsPath = path.join(sessDir, "creds.json");
    let attempts = 0;
    while (!fs.existsSync(credsPath) && attempts < 10) {
      await new Promise((r) => setTimeout(r, 1000));
      attempts++;
    }
    if (fs.existsSync(credsPath)) {
      const sessionId = compressCredsToSession(credsPath);
      onSession(sessionId);
    } else {
      setStatus("disconnected");
      onError("Could not read session data after connection.");
    }
  } catch (e: any) {
    setStatus("disconnected");
    onError(e?.message ?? "Failed to read session.");
  }
}

// ── Close the current active socket cleanly ──────────────────────────────────
async function closeActiveConn(): Promise<void> {
  if (!_activeConn) return;
  const c = _activeConn;
  _activeConn = null;
  _sock = null;
  try { c.ev.removeAllListeners(); } catch {}
  try { c.ws?.terminate?.(); }       catch {}
  try { c.end?.(); }                 catch {}
  // Give signal store time to flush before creating a new socket.
  // Skipping this causes the aesDecryptGCM crypto crash on reconnect.
  await new Promise((r) => setTimeout(r, 800));
}

// ── Pairing code connection ──────────────────────────────────────────────────
export async function connectViaPair(
  number: string,
  onCode: CodeCallback,
  onSession: SessionCallback,
  onError: ErrorCallback,
): Promise<() => void> {
  if (_status === "connecting" || _status === "connected") {
    onError("Already connecting or connected. Disconnect first.");
    return () => {};
  }

  _status = "connecting";
  _reconnecting = false;

  const sessDir = path.join("/tmp", `bh_plat_pair_${Date.now()}`);
  fs.mkdirSync(sessDir, { recursive: true });
  _sessionDir = sessDir;

  let done = false;
  const setStatus = (s: WASenderStatus) => { _status = s; };

  const cleanup = () => {
    done = true;
    try { _activeConn?.ev?.removeAllListeners(); } catch {}
    try { _activeConn?.ws?.terminate?.(); }        catch {}
    _activeConn = null;
    _sock = null;
    if (_status !== "connected") _status = "disconnected";
  };

  const scheduleReconnect = (delayMs = 5000) => {
    if (_reconnecting || done) return;
    _reconnecting = true;
    setTimeout(async () => {
      _reconnecting = false;
      if (done) return;
      await closeActiveConn();
      createSocket().catch(() => {});
    }, delayMs);
  };

  const createSocket = async () => {
    if (done) return;

    const baileys = _require("@whiskeysockets/baileys");
    const {
      makeWASocket,
      useMultiFileAuthState,
      fetchLatestBaileysVersion,
      makeCacheableSignalKeyStore,
      DisconnectReason,
      jidNormalizedUser,
    } = baileys;
    const { Boom } = _require("@hapi/boom");

    const pinoLog = makeSilentLogger();
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(sessDir);

    // Per-socket flag — resets on each reconnect so we re-request a fresh code
    let pairingRequested = false;

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pinoLog),
      },
      printQRInTerminal: false,
      logger: pinoLog,
      browser: ["Ubuntu", "Chrome", "22.0.0"],
      markOnlineOnConnect: true,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      keepAliveIntervalMs: 20000,
      connectTimeoutMs: 90000,
      defaultQueryTimeoutMs: 30000,
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 3,
    });

    // Track for proper teardown — set BEFORE any listeners
    _activeConn = sock;
    _sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      // WA fires `qr` to signal it is ready for pairing — request code here.
      // Calling requestPairingCode before this event causes a 515 error.
      if (qr && !pairingRequested && !done) {
        pairingRequested = true;
        logger.info("Platform WA: qr event — requesting pairing code");
        try {
          const code: string = await sock.requestPairingCode(number);
          if (!done) onCode(code);
        } catch (e: any) {
          logger.warn({ e }, "Platform WA: pairing code request failed — retrying in 10s");
          setTimeout(async () => {
            if (done) return;
            try {
              const code: string = await sock.requestPairingCode(number);
              if (!done) onCode(code);
            } catch (e2: any) {
              logger.error({ e2 }, "Platform WA: pairing code retry failed");
              if (!done) onError(e2?.message ?? "Failed to generate pairing code.");
              cleanup();
            }
          }, 10000);
        }
      }

      if (connection === "open" && !done) {
        done = true;
        _status = "connected";
        fireConnected();
        const botJid = jidNormalizedUser(sock.user?.id || "");
        logger.info({ name: sock.user?.name, jid: botJid }, "Platform WA sender: connected via pairing code");
        await extractAndEmitSession(sessDir, onSession, onError, setStatus);
        return;
      }

      if (connection === "close") {
        const err        = lastDisconnect?.error;
        const statusCode = err instanceof Boom ? err.output.statusCode : (err as any)?.output?.statusCode ?? null;

        // Logged out — wipe session and stop reconnecting
        if (statusCode === DisconnectReason.loggedOut) {
          logger.warn("Platform WA: logged out — clearing session");
          try { fs.rmSync(sessDir, { recursive: true, force: true }); } catch {}
          fs.mkdirSync(sessDir, { recursive: true });
          if (!done) {
            onError("Logged out by WhatsApp. Please reconnect.");
            cleanup();
          }
          return;
        }

        if (done) return;

        // 515: WA requested clean restart
        if (statusCode === 515) {
          logger.warn("Platform WA: 515 — WA restart requested, reconnecting in 8s");
          scheduleReconnect(8000);
          return;
        }

        // 408: Pairing timed out — reconnect to get a fresh code
        if (statusCode === 408) {
          pairingRequested = false;
          logger.warn("Platform WA: 408 pairing timeout — reconnecting in 6s");
          scheduleReconnect(6000);
          return;
        }

        // 401: Session explicitly rejected
        if (statusCode === 401) {
          _status = "disconnected";
          onError("Session rejected by WhatsApp. Please try again.");
          cleanup();
          return;
        }

        logger.warn({ statusCode }, "Platform WA: unexpected disconnect — reconnecting in 5s");
        scheduleReconnect(5000);
      }
    });
  };

  try {
    await createSocket();
  } catch (e: any) {
    _status = "disconnected";
    onError(e?.message ?? "Failed to start connection.");
    cleanup();
  }

  return cleanup;
}

// ── Disconnect ────────────────────────────────────────────────────────────────
export function disconnect(): void {
  try { _activeConn?.ws?.close(); } catch {}
  _activeConn = null;
  _sock = null;
  _status = "disconnected";
  _reconnecting = false;
  if (_sessionDir) {
    try { fs.rmSync(_sessionDir, { recursive: true, force: true }); } catch {}
    _sessionDir = null;
  }
}

// ── Restore from saved session ────────────────────────────────────────────────
export async function initFromSession(sessionId: string): Promise<void> {
  if (_status === "connected") return;
  _status = "connecting";

  const sessDir = path.join("/tmp", `bh_plat_live_${Date.now()}`);
  try {
    decompressSessionToCreds(sessionId, sessDir);
    _sessionDir = sessDir;

    const baileys = _require("@whiskeysockets/baileys");
    const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, jidNormalizedUser } = baileys;
    const pinoLog = makeSilentLogger();
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(sessDir);

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pinoLog),
      },
      printQRInTerminal: false,
      logger: pinoLog,
      browser: ["Ubuntu", "Chrome", "22.0.0"],
      markOnlineOnConnect: true,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      keepAliveIntervalMs: 20000,
      connectTimeoutMs: 90000,
      defaultQueryTimeoutMs: 30000,
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 3,
    });

    _activeConn = sock;
    _sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update: any) => {
      const { connection, lastDisconnect } = update;
      if (connection === "open") {
        _status = "connected";
        fireConnected();
        const botJid = jidNormalizedUser(sock.user?.id || "");
        logger.info({ name: sock.user?.name, jid: botJid }, "Platform WA sender connected successfully");
      } else if (connection === "close") {
        const code = (lastDisconnect?.error as any)?.output?.statusCode;
        _status = "disconnected";
        _activeConn = null;
        _sock = null;

        // 515: WA restart
        if (code === 515) {
          logger.warn("Platform WA (live): 515 restart — reconnecting in 8s");
          setTimeout(() => {
            if (_status !== "connected") {
              initFromSession(sessionId).catch((err) => {
                logger.error({ err }, "Platform WA sender 515 reconnect failed");
                _status = "disconnected";
              });
            }
          }, 8000);
          return;
        }

        logger.warn({ code }, "Platform WA sender disconnected");
        if (code !== 401 && code !== 403) {
          setTimeout(() => {
            if (_status !== "connected") {
              initFromSession(sessionId).catch((err) => {
                logger.error({ err }, "Platform WA sender reconnect failed");
                _status = "disconnected";
              });
            }
          }, 15000);
        }
      }
    });
  } catch (e: any) {
    _status = "disconnected";
    logger.error({ err: e }, "Failed to init platform WA sender from session");
    try { fs.rmSync(sessDir, { recursive: true, force: true }); } catch {}
  }
}
