import express from "express";
import { createReadStream } from "node:fs";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { lextelConnect, lextelDisconnect, lextelKeepalive, lextelLearn, lextelOpenBluetooth, lextelSave, lextelScan, lextelStatus } from "./lextel";
import { listSerialDevices } from "./list-serials";
import { prepareSerialScopeTap, syncSerialScopeTap } from "./civ-scope-tap";
import { currentSerialHamlib, radiosConnect, radiosDisconnect, radiosMarkBle, radiosRemove, radiosResumeIcomLan, radiosSave, radiosSetPrimary, radiosStatus, radiosUpsert, setBeforeHamlibRestart } from "./radios";
import { hamlibCtl, loadSer2net, probeHamlibNet, saveSer2net } from "./ser2net-store";
import { attachRadioAudio } from "./radio-audio";
import { decodeSlot } from "./digital-decode";
import { digitalRxCommand, digitalRxSnapshot, digitalWaterfallSince } from "./digital-rx";
import { haltDigitalTx, scheduleDigitalTx, txSnapshot } from "./digital-tx";
import { attachScopeWs } from "./icom-scope-ws";
import { readSmeterCache, smeterCacheKey, writeSmeterCache } from "./smeter-cache";
import { attachTerminal } from "./term";
import { createUser, deleteUser, listUsers, sshStatus } from "./users";
import {
  wavelogDatabase,
  wavelogDbDown,
  wavelogDbPassword,
  wavelogDbUp,
  wavelogDbUpdate,
  wavelogDown,
  wavelogStatus,
  wavelogUp,
} from "./wavelog-status";
import { readWlgEnv, writeWlgEnv } from "./wlg-env";
import { wlgDown, wlgStatus, wlgUp } from "./wlg-status";
import { netConnect, netForget, netSave, netScan, netSetAp, netSetHostname, netSetIp, netSetLink, netStatus } from "./net";
import { processesAction, processesList } from "./processes";
import { containersAction, containersList } from "./containers";
import { servicesApplyBoot, servicesPower, servicesSetAutostart, servicesStatus } from "./services";
import { updatesApply, updatesApplyManualFile, updatesRefresh, updatesStatus } from "./updates";
import { otaDropUpload, otaReadUpload, otaValidatePackage } from "./updates-upload";
import { layoutGet, layoutSave } from "./layouts";
import { isLoopback, vfoDisplayExit } from "./vfo-display";
import { ldgCmd, ldgConnect, ldgDisconnect, ldgPeek, ldgSave, ldgStatus } from "./ldg";
import { lp100aCmd, lp100aConnect, lp100aDisconnect, lp100aPeek, lp100aSave, lp100aStatus } from "./lp100a";
import { speCmd, speConnect, speDisconnect, spePeek, spePowerOn, speSave, speStatus } from "./spe";
import {
  backupArchiveFile,
  backupCreateStart,
  backupDelete,
  backupDropUpload,
  backupJobGet,
  backupList,
  backupReadUpload,
  backupRestoreFileStart,
  backupRestoreStart,
  backupValidateUpload,
} from "./backup";
import { hostStatus } from "./host-status";
import {
  mmdvmControl,
  mmdvmLink,
  mmdvmModePause,
  mmdvmModeResumeAll,
  mmdvmNetworkSet,
  mmdvmRemote,
  mmdvmSave,
  mmdvmStatus,
} from "./mmdvm";
import { loadMmdvmCatalog } from "./mmdvm-catalog";
import {
  hubCatalog,
  hubPlanOne,
  hubRemoveBinding,
  hubRigctl,
  hubSaveBindings,
  hubStatus,
  hubUpsertBinding,
  rewriteIc705PowerOn,
} from "./hamlib-hub";
import { icomLanCmd, icomLanStatus } from "./icom-lan";
import { registerLicenseRoutes } from "./license";
import {
  consoleSessionAdmin,
  consoleSessionClearCookie,
  consoleSessionCookie,
  consoleSessionOk,
  consoleSessionToken,
} from "./console-session";
import { supportVpnSet, supportVpnStatus } from "./support-vpn";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const JSON_BODY_LIMIT = "32kb";
  const MULTIPART_UPLOAD_PATHS = new Set(["/api/updates/manual", "/api/backup/restore-file"]);
  app.use((req, res, next) => {
    if (MULTIPART_UPLOAD_PATHS.has(req.path)) return next();
    const ct = String(req.headers["content-type"] || "").toLowerCase();
    if (ct.includes("multipart/form-data")) return next();
    express.json({ limit: JSON_BODY_LIMIT })(req, res, next);
  });
  attachTerminal(server);
  attachRadioAudio(server);
  attachScopeWs(server);
  registerLicenseRoutes(app);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.get("/api/ser2net", async (_req, res) => {
    try {
      res.json(await loadSer2net());
    } catch (err) {
      res.status(500).json({ ok: false, services: [], error: String(err) });
    }
  });
  app.put("/api/ser2net", async (req, res) => {
    try {
      const body = await saveSer2net(req.body ?? {});
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, services: [], error: String(err) });
    }
  });
  app.post("/api/ser2net/hamlib", async (req, res) => {
    try {
      const action = String(req.body?.action || "").trim();
      if (action !== "start" && action !== "stop") {
        res.status(400).json({ ok: false, error: "action start|stop" });
        return;
      }
      const applied = await hamlibCtl(action);
      // Pequena espera para o socket NET subir antes do probe.
      if (action === "start") await new Promise((r) => setTimeout(r, 700));
      const hamlibRunning = action === "stop" ? false : await probeHamlibNet();
      res.json({ ok: applied || hamlibRunning, hamlibRunning, applied });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get("/api/ldg", async (_req, res) => {
    try {
      res.json(await ldgPeek());
    } catch {
      res.json(ldgStatus());
    }
  });
  app.put("/api/ldg", async (req, res) => {
    try {
      res.json(await ldgSave(req.body ?? {}));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/ldg/connect", async (req, res) => {
    try {
      const body = await ldgConnect(req.body ?? {});
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/ldg/disconnect", async (_req, res) => {
    try {
      res.json(await ldgDisconnect());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/ldg/cmd", async (req, res) => {
    try {
      res.json(await ldgCmd(String(req.body?.cmd || "")));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get("/api/lp100a", async (_req, res) => {
    try {
      res.json(await lp100aPeek());
    } catch {
      res.json(lp100aStatus());
    }
  });
  app.put("/api/lp100a", async (req, res) => {
    try {
      res.json(await lp100aSave(req.body ?? {}));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/lp100a/connect", async (_req, res) => {
    try {
      const body = await lp100aConnect();
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/lp100a/disconnect", async (_req, res) => {
    try {
      res.json(await lp100aDisconnect());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/lp100a/cmd", async (req, res) => {
    try {
      res.json(await lp100aCmd(String(req.body?.cmd || "")));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get("/api/spe", async (_req, res) => {
    try {
      res.json(await spePeek());
    } catch {
      res.json(speStatus());
    }
  });
  app.put("/api/spe", async (req, res) => {
    try {
      res.json(await speSave(req.body ?? {}));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/spe/connect", async (_req, res) => {
    try {
      const body = await speConnect();
      res.status(body.ok && body.connected ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/spe/disconnect", async (_req, res) => {
    try {
      res.json(await speDisconnect());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/spe/cmd", async (req, res) => {
    try {
      res.json(await speCmd(String(req.body?.cmd || "")));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/spe/poweron", async (_req, res) => {
    try {
      res.json(await spePowerOn());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get("/api/lextel", (_req, res) => {
    res.json(lextelStatus());
  });
  app.put("/api/lextel", async (req, res) => {
    try {
      res.json(await lextelSave(req.body ?? {}));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/lextel/scan", async (req, res) => {
    try {
      res.json(await lextelScan(Number(req.body?.seconds) || 12));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/lextel/connect", async (req, res) => {
    try {
      const body = await lextelConnect(req.body ?? {});
      res.status(body.ok && body.phase !== "error" ? 200 : 503).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/lextel/disconnect", async (_req, res) => {
    try {
      res.json(await lextelDisconnect());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/lextel/keepalive", async (_req, res) => {
    try {
      res.json(await lextelKeepalive());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/lextel/learn", async (_req, res) => {
    try {
      res.json(await lextelLearn());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/lextel/bluetooth", async (_req, res) => {
    try {
      res.json(await lextelOpenBluetooth());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get("/api/radios", async (_req, res) => {
    try {
      res.json(await radiosStatus());
    } catch (err) {
      res.status(500).json({ ok: false, radios: [], error: String(err) });
    }
  });
  app.put("/api/radios", async (req, res) => {
    try {
      res.json(await radiosSave(req.body ?? {}));
    } catch (err) {
      res.status(500).json({ ok: false, radios: [], error: String(err) });
    }
  });
  app.post("/api/radios", async (req, res) => {
    try {
      res.json(await radiosUpsert(req.body ?? {}));
    } catch (err) {
      res.status(500).json({ ok: false, radios: [], error: String(err) });
    }
  });
  app.post("/api/radios/connect", async (req, res) => {
    try {
      const body = await radiosConnect(req.body ?? {});
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, radios: [], error: String(err) });
    }
  });
  app.post("/api/radios/primary", async (req, res) => {
    try {
      res.json(await radiosSetPrimary(String(req.body?.id ?? "")));
    } catch (err) {
      res.status(500).json({ ok: false, radios: [], error: String(err) });
    }
  });
  app.post("/api/radios/disconnect", async (req, res) => {
    try {
      res.json(await radiosDisconnect(String(req.body?.id ?? "")));
    } catch (err) {
      res.status(500).json({ ok: false, radios: [], error: String(err) });
    }
  });
  app.post("/api/radios/ble", async (req, res) => {
    try {
      res.json(
        await radiosMarkBle(String(req.body?.id ?? ""), Boolean(req.body?.connected), req.body?.name, req.body?.error),
      );
    } catch (err) {
      res.status(500).json({ ok: false, radios: [], error: String(err) });
    }
  });
  app.get("/api/radios/lan", (_req, res) => {
    try {
      res.json(icomLanStatus());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/radios/civ", async (req, res) => {
    try {
      const cmd = String(req.body?.cmd ?? req.body?.command ?? "");
      if (!cmd.trim()) {
        res.status(400).json({ ok: false, error: "cmd obrigatório" });
        return;
      }
      const out = await icomLanCmd(cmd, (req.body ?? {}) as Record<string, unknown>);
      // O S-meter a 60 Hz pula o tick. 502 faria o nginx tratar o console como morto.
      if (cmd === "smeter") {
        res.status(200).json(out);
        return;
      }
      res.status(out.ok ? 200 : 502).json(out);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.delete("/api/radios/:id", async (req, res) => {
    try {
      res.json(await radiosRemove(req.params.id));
    } catch (err) {
      res.status(500).json({ ok: false, radios: [], error: String(err) });
    }
  });

  app.get("/api/equipment", (_req, res) => {
    try {
      const maker = typeof _req.query.maker === "string" ? _req.query.maker : undefined;
      res.json(hubCatalog(maker as never));
    } catch (err) {
      res.status(500).json({ ok: false, equipment: [], error: String(err) });
    }
  });
  app.get("/api/hamlib", (_req, res) => {
    try {
      res.json(hubStatus());
    } catch (err) {
      res.status(500).json({ ok: false, bindings: [], plans: [], error: String(err) });
    }
  });
  app.put("/api/hamlib/bindings", (req, res) => {
    try {
      res.json(hubSaveBindings(req.body ?? {}));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/hamlib/bindings", (req, res) => {
    try {
      const body = hubUpsertBinding(req.body ?? {});
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.delete("/api/hamlib/bindings/:id", (req, res) => {
    try {
      res.json(hubRemoveBinding(req.params.id));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/hamlib/plan", (req, res) => {
    try {
      const body = hubPlanOne(req.body ?? {});
      res.status(body.ok || body.plan ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/hamlib/cmd", async (req, res) => {
    try {
      const port = Number(req.body?.port ?? 4532);
      const host = String(req.body?.host ?? "127.0.0.1");
      let command = String(req.body?.command ?? "");
      if (port === 4532) {
        const row = currentSerialHamlib();
        command = rewriteIc705PowerOn(command, row);
      }
      if (!command.trim()) {
        res.status(400).json({ ok: false, error: "command obrigatório" });
        return;
      }
      const out = await hubRigctl(port, command, host, 900);
      // ocupado/timeout é fila, não queda do Node. 502 faz o nginx e a UI
      // trata o console como morto a cada poll de 450 ms.
      const queued = out.error === "ocupado" || out.error === "timeout" || out.error === "fila cheia";
      res.status(out.ok || queued ? 200 : 502).json(out);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  // Só STRENGTH, na mesma fila do rigctld. Sempre 200: ocupado/timeout não é queda do console.
  app.post(
    "/api/digital/decode",
    express.raw({ type: "application/octet-stream", limit: "1mb" }),
    async (req, res) => {
      if (!consoleSessionOk(req.headers.cookie)) {
        res.status(401).json({ ok: false, ran: false, lines: [] });
        return;
      }
      const mode = req.query.mode === "FT4" ? "FT4" : req.query.mode === "FT8" ? "FT8" : "";
      const pcm = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const expect = mode === "FT4" ? 90_000 * 2 : mode === "FT8" ? 180_000 * 2 : 0;
      if (!mode || pcm.length !== expect) {
        res.status(400).json({ ok: false, ran: false, lines: [] });
        return;
      }
      try {
        const out = await decodeSlot(mode, pcm);
        res.json({ ok: true, ran: out.ran, lines: out.lines });
      } catch (err) {
        res.status(200).json({ ok: true, ran: false, lines: [], error: String(err) });
      }
    },
  );
  app.get("/api/digital/rx", (req, res) => {
    if (!consoleSessionOk(req.headers.cookie)) {
      res.status(401).json({ ok: false, enabled: false, rows: [] });
      return;
    }
    res.json(digitalRxSnapshot());
  });
  app.post("/api/digital/rx", async (req, res) => {
    if (!consoleSessionOk(req.headers.cookie)) {
      res.status(401).json({ ok: false, enabled: false, rows: [] });
      return;
    }
    const out = await digitalRxCommand({
      op: String(req.body?.op ?? ""),
      mode: String(req.body?.mode ?? ""),
      hz: Number(req.body?.hz),
      band: String(req.body?.band ?? ""),
      dialId: String(req.body?.dialId ?? ""),
      n: Number(req.body?.n),
    });
    res.status(out.ok ? 200 : 409).json(out);
  });
  app.get("/api/digital/waterfall", (req, res) => {
    if (!consoleSessionOk(req.headers.cookie)) {
      res.status(401).json({ ok: false, gen: 0, stripes: [] });
      return;
    }
    const after = Number(req.query.after);
    res.json(digitalWaterfallSince(Number.isFinite(after) ? after : 0));
  });
  app.get("/api/digital/clock", (req, res) => {
    if (!consoleSessionOk(req.headers.cookie)) {
      res.status(401).json({ ok: false });
      return;
    }
    res.json({ ok: true, now: Date.now() });
  });
  app.post("/api/digital/tx", async (req, res) => {
    if (!consoleSessionOk(req.headers.cookie)) {
      res.status(401).json({ ok: false, error: "auth" });
      return;
    }
    const mode = req.body?.mode === "FT4" ? "FT4" : req.body?.mode === "FT8" ? "FT8" : "";
    if (!mode) {
      res.status(400).json({ ok: false, error: "modo" });
      return;
    }
    const out = await scheduleDigitalTx({
      mode,
      message: String(req.body?.message ?? ""),
      audioHz: Number(req.body?.audioHz),
      even: Boolean(req.body?.even),
      port: Number(req.body?.port ?? 4532),
      level: Number(req.body?.level ?? 0.5),
    });
    res.status(out.ok ? 200 : 409).json(out);
  });
  app.get("/api/digital/tx", (req, res) => {
    if (!consoleSessionOk(req.headers.cookie)) {
      res.status(401).json({ ok: false, phase: "idle" });
      return;
    }
    res.json({ ok: true, ...txSnapshot() });
  });
  app.post("/api/digital/halt", async (req, res) => {
    if (!consoleSessionOk(req.headers.cookie)) {
      res.status(401).json({ ok: false });
      return;
    }
    await haltDigitalTx();
    res.json({ ok: true, ...txSnapshot() });
  });
  app.post("/api/hamlib/smeter", async (req, res) => {
    try {
      const port = Number(req.body?.port ?? 4532);
      const host = String(req.body?.host ?? "127.0.0.1");
      if (!Number.isFinite(port) || port <= 0) {
        res.status(200).json({ ok: false, reply: "", error: "porta inválida" });
        return;
      }
      const key = smeterCacheKey({ host, port, t: "hamlib" });
      const hit = readSmeterCache<{ ok: boolean; reply: string; error?: string }>(key);
      if (hit) {
        res.status(200).json(hit);
        return;
      }
      const out = await hubRigctl(port, "\\get_level STRENGTH", host, 200);
      writeSmeterCache(key, out);
      res.status(200).json(out);
    } catch (err) {
      res.status(200).json({ ok: false, reply: "", error: String(err) });
    }
  });

  app.get("/api/net", async (_req, res) => {
    try {
      res.json(await netStatus());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.put("/api/net", async (req, res) => {
    try {
      res.json(await netSave(req.body ?? {}));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/net/scan", async (_req, res) => {
    try {
      res.json(await netScan());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/net/connect", async (req, res) => {
    try {
      const body = await netConnect(req.body ?? {});
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/net/forget", async (req, res) => {
    try {
      res.json(await netForget(String(req.body?.ssid ?? "")));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/net/link", async (req, res) => {
    try {
      res.json(await netSetLink(req.body?.link === "ethernet" ? "ethernet" : "wifi"));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/net/ip", async (req, res) => {
    try {
      const body = await netSetIp(req.body ?? {});
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/net/hostname", async (req, res) => {
    try {
      const body = await netSetHostname(String(req.body?.hostname ?? ""));
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/net/ap", async (req, res) => {
    try {
      const body = await netSetAp(req.body ?? {});
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get("/api/services", async (_req, res) => {
    try {
      res.json(await servicesStatus());
    } catch (err) {
      res.status(500).json({ ok: false, items: [], error: String(err) });
    }
  });
  app.post("/api/services", async (req, res) => {
    try {
      const body = await servicesSetAutostart(String(req.body?.id ?? ""), Boolean(req.body?.autostart));
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, items: [], error: String(err) });
    }
  });

  app.post("/api/services/power", async (req, res) => {
    try {
      res.setTimeout(300_000);
      const body = await servicesPower(String(req.body?.id ?? ""), Boolean(req.body?.on));
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, items: [], error: String(err) });
    }
  });

  app.get("/api/processes", async (_req, res) => {
    try {
      const body = await processesList();
      res.status(body.ok ? 200 : 500).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, available: false, items: [], error: String(err) });
    }
  });
  app.post("/api/processes", async (req, res) => {
    try {
      res.setTimeout(60_000);
      const action = String(req.body?.action ?? "");
      const unit = String(req.body?.unit ?? "");
      const body = await processesAction(unit, action);
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, unit: "", action: "", error: String(err) });
    }
  });

  app.get("/api/containers", async (_req, res) => {
    try {
      const body = await containersList();
      res.status(body.ok ? 200 : 500).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, available: false, items: [], error: String(err) });
    }
  });
  app.post("/api/containers", async (req, res) => {
    try {
      res.setTimeout(90_000);
      const action = String(req.body?.action ?? "");
      const name = String(req.body?.name ?? "");
      const body = await containersAction(name, action, {
        memoryMiB: req.body?.memoryMiB,
        cpus: req.body?.cpus,
      });
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, name: "", action: "", error: String(err) });
    }
  });

  app.get("/api/updates", async (_req, res) => {
    try {
      res.json(await updatesStatus());
    } catch (err) {
      res.status(500).json({ ok: false, items: [], pending: 0, error: String(err) });
    }
  });
  app.post("/api/updates/check", async (_req, res) => {
    try {
      res.json(await updatesRefresh());
    } catch (err) {
      res.status(500).json({ ok: false, items: [], pending: 0, error: String(err) });
    }
  });
  app.post("/api/updates", async (req, res) => {
    try {
      const body = await updatesApply(String(req.body?.id ?? ""));
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, items: [], pending: 0, error: String(err) });
    }
  });
  app.post("/api/updates/manual", async (req, res) => {
    if (!consoleSessionOk(req.headers.cookie)) {
      res.status(401).json({ ok: false, error: "Sessão expirada. Entre de novo." });
      return;
    }
    if (!consoleSessionAdmin(req.headers.cookie)) {
      res.status(403).json({ ok: false, error: "Só o usuário admin pode aplicar pacotes OTA manualmente." });
      return;
    }
    let uploaded = "";
    try {
      const upload = await otaReadUpload(req);
      if (!upload.ok) {
        res.status(400).json(upload);
        return;
      }
      uploaded = upload.path;
      const valid = await otaValidatePackage(upload.path);
      if (!valid.ok) {
        otaDropUpload(uploaded);
        uploaded = "";
        res.status(400).json(valid);
        return;
      }
      const body = await updatesApplyManualFile(upload.path, upload.sha256);
      otaDropUpload(upload.path);
      uploaded = "";
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      if (uploaded) otaDropUpload(uploaded);
      if (!res.headersSent) res.status(500).json({ ok: false, items: [], pending: 0, error: String(err) });
    }
  });

  app.get("/api/serials", async (_req, res) => {
    try {
      res.json({ devices: await listSerialDevices() });
    } catch (err) {
      res.status(500).json({ devices: [], error: String(err) });
    }
  });

  app.get("/api/wavelog/status", async (_req, res) => {
    try {
      res.json(await wavelogStatus());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/wavelog/up", async (_req, res) => {
    try {
      const body = await wavelogUp();
      res.status(body.ok ? 200 : 503).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/wavelog/down", async (_req, res) => {
    try {
      res.json(await wavelogDown());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.get("/api/wavelog/database", async (_req, res) => {
    try {
      res.json(await wavelogDatabase());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.get("/api/wavelog/database/password", async (_req, res) => {
    try {
      const out = await wavelogDbPassword();
      res.status(out.password ? 200 : 404).json({ ok: Boolean(out.password), ...out });
    } catch (err) {
      res.status(500).json({ ok: false, password: "", error: String(err) });
    }
  });
  app.post("/api/wavelog/db/up", async (_req, res) => {
    try {
      res.setTimeout(300_000);
      res.json(await wavelogDbUp());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/wavelog/db/down", async (_req, res) => {
    try {
      res.setTimeout(120_000);
      res.json(await wavelogDbDown());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/wavelog/db-update", async (_req, res) => {
    try {
      res.setTimeout(300_000);
      const body = await wavelogDbUpdate();
      res.status(body.updated ? 200 : 503).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get("/api/wlg/status", async (_req, res) => {
    try {
      res.json(await wlgStatus());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/wlg/up", async (_req, res) => {
    try {
      const body = await wlgUp();
      res.status(body.ok ? 200 : 503).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/wlg/down", async (_req, res) => {
    try {
      res.json(await wlgDown());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get("/api/wlg/env", (_req, res) => {
    try {
      res.json({ ok: true, ...readWlgEnv() });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/wlg/env", async (req, res) => {
    try {
      const body = await writeWlgEnv(req.body ?? {});
      res.json({ ok: true, ...body });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get("/api/mmdvm", async (_req, res) => {
    try {
      res.json(await mmdvmStatus());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.get("/api/mmdvm/catalog", (_req, res) => {
    try {
      res.json(loadMmdvmCatalog());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.put("/api/mmdvm", async (req, res) => {
    try {
      res.json(await mmdvmSave(req.body ?? {}));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/mmdvm/up", async (_req, res) => {
    try {
      const body = await mmdvmControl("start");
      res.status(body.hostRunning || body.installed ? 200 : 503).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/mmdvm/down", async (_req, res) => {
    try {
      res.json(await mmdvmControl("stop"));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/mmdvm/restart", async (_req, res) => {
    try {
      res.json(await mmdvmControl("restart"));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/mmdvm/remote", async (req, res) => {
    try {
      const body = await mmdvmRemote(String(req.body?.cmd || ""));
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/mmdvm/mode/:mode/pause", async (req, res) => {
    try {
      res.json(await mmdvmModePause(String(req.params.mode || ""), true));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/mmdvm/mode/:mode/resume", async (req, res) => {
    try {
      res.json(await mmdvmModePause(String(req.params.mode || ""), false));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/mmdvm/modes/resume-all", async (_req, res) => {
    try {
      res.json(await mmdvmModeResumeAll());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/mmdvm/network", async (req, res) => {
    try {
      res.json(await mmdvmNetworkSet(req.body ?? {}));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/mmdvm/link", async (req, res) => {
    try {
      res.json(await mmdvmLink(req.body ?? {}));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get("/api/layout", (req, res) => {
    try {
      res.json(layoutGet(String(req.query.user || "admin"), req.query.scope));
    } catch (err) {
      res.status(500).json({ ok: false, tiles: [], error: String(err) });
    }
  });
  app.put("/api/layout", (req, res) => {
    try {
      res.json(layoutSave(req.body?.user, req.body?.tiles, req.body?.scope));
    } catch (err) {
      res.status(500).json({ ok: false, tiles: [], error: String(err) });
    }
  });

  app.post("/api/console/session", (req, res) => {
    const token = consoleSessionToken(String(req.body?.user ?? ""), String(req.body?.password ?? ""));
    if (!token) {
      res.status(401).json({ ok: false, error: "auth" });
      return;
    }
    res.setHeader("Set-Cookie", consoleSessionCookie(token));
    res.json({ ok: true });
  });
  app.get("/api/console/session", (req, res) => {
    if (!consoleSessionOk(req.headers.cookie)) {
      res.status(401).json({ ok: false });
      return;
    }
    res.json({ ok: true });
  });
  app.delete("/api/console/session", (_req, res) => {
    res.setHeader("Set-Cookie", consoleSessionClearCookie());
    res.json({ ok: true });
  });

  const supportDenied = (req: { headers: { cookie?: string } }, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
    if (consoleSessionOk(req.headers.cookie)) return false;
    res.status(401).json({ ok: false, error: "auth" });
    return true;
  };

  app.get("/api/support/vpn", async (req, res) => {
    if (supportDenied(req, res)) return;
    try {
      res.json(await supportVpnStatus(String(req.headers.host || "")));
    } catch {
      res.status(500).json({ ok: false, state: "error", error: "Falha ao falar com a VPN de suporte." });
    }
  });
  app.post("/api/support/vpn", async (req, res) => {
    if (supportDenied(req, res)) return;
    if (typeof req.body?.enabled !== "boolean") {
      res.status(400).json({ ok: false, state: "error", error: "enabled" });
      return;
    }
    try {
      res.json(await supportVpnSet(req.body.enabled, String(req.headers.host || "")));
    } catch {
      res.status(500).json({ ok: false, state: "error", error: "Falha ao falar com a VPN de suporte." });
    }
  });

  app.get("/api/users", async (_req, res) => {
    try {
      const [users, ssh] = await Promise.all([listUsers(), sshStatus()]);
      res.json({ users, ssh });
    } catch (err) {
      res.status(500).json({ users: [], error: String(err) });
    }
  });
  app.post("/api/users", async (req, res) => {
    try {
      const name = String(req.body?.name ?? "");
      const password = String(req.body?.password ?? "");
      const body = await createUser(name, password);
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.delete("/api/users/:name", async (req, res) => {
    try {
      const body = await deleteUser(req.params.name);
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get("/api/host", async (_req, res) => {
    try {
      res.json(await hostStatus());
    } catch (err) {
      res.status(500).json({
        ok: false,
        cpuTempC: null,
        diskTotalBytes: 0,
        diskFreeBytes: 0,
        diskUsedBytes: 0,
        diskPath: "/",
        error: String(err),
        hardware: "",
        soc: "",
        osPretty: "",
        appVersion: "",
        uptimeSec: 0,
        cpuPct: null,
        ramPct: null,
        ramUsedBytes: 0,
        ramTotalBytes: 0,
        netRxBps: null,
        netTxBps: null,
        sampleMs: 5000,
        windowMs: 300000,
        samples: [],
      });
    }
  });

  app.get("/api/backup", (_req, res) => {
    try {
      res.json(backupList());
    } catch (err) {
      res.status(500).json({ ok: false, items: [], error: String(err) });
    }
  });
  app.get("/api/backup/jobs/:id", (req, res) => {
    const job = backupJobGet(req.params.id);
    if (!job) {
      res.status(404).json({ ok: false, error: "job_not_found" });
      return;
    }
    res.json({ ok: true, job });
  });
  app.get("/api/backup/:id/file", (req, res) => {
    if (!consoleSessionOk(req.headers.cookie)) {
      res.status(401).json({ ok: false, error: "Sessão expirada. Entre de novo." });
      return;
    }
    try {
      const found = backupArchiveFile(req.params.id);
      if (!found.ok) {
        res.status(found.error === "missing" ? 404 : 400).json(found);
        return;
      }
      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Content-Disposition", `attachment; filename="${found.filename}"`);
      res.setHeader("Cache-Control", "no-store");
      createReadStream(found.path).pipe(res);
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/backup/restore-file", async (req, res) => {
    if (!consoleSessionOk(req.headers.cookie)) {
      res.status(401).json({ ok: false, error: "Sessão expirada. Entre de novo." });
      return;
    }
    let uploaded = "";
    try {
      const upload = await backupReadUpload(req);
      if (!upload.ok) {
        res.status(400).json(upload);
        return;
      }
      uploaded = upload.path;
      const valid = await backupValidateUpload(upload.path, upload.filename);
      if (!valid.ok) {
        backupDropUpload(uploaded);
        uploaded = "";
        res.status(400).json(valid);
        return;
      }
      const started = backupRestoreFileStart(upload.path, upload.confirm);
      uploaded = "";
      res.status(started.ok ? 200 : 400).json(started);
    } catch (err) {
      if (uploaded) backupDropUpload(uploaded);
      if (!res.headersSent) res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/backup", (req, res) => {
    try {
      res.json(backupCreateStart(String(req.body?.user ?? "admin")));
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.delete("/api/backup/:id", (req, res) => {
    try {
      const body = backupDelete(req.params.id);
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.post("/api/backup/:id/restore", (req, res) => {
    try {
      const body = backupRestoreStart(req.params.id, Boolean(req.body?.confirm));
      res.status(body.ok ? 200 : 400).json(body);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.post("/api/vfo-display/exit", async (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ ok: false, error: "local" });
      return;
    }
    try {
      res.json(await vfoDisplayExit());
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.use(express.static(staticPath));

  app.use("/api", (_req, res) => {
    res.status(404).json({ ok: false, error: "API não encontrada" });
  });

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  setBeforeHamlibRestart(async () => {
    await prepareSerialScopeTap();
  });
  void radiosResumeIcomLan().catch(() => undefined);

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    void syncSerialScopeTap();
    void servicesApplyBoot();
  });
}

startServer().catch(console.error);
