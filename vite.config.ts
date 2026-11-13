import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import { lextelConnect, lextelDisconnect, lextelKeepalive, lextelLearn, lextelOpenBluetooth, lextelSave, lextelScan, lextelStatus } from "./server/lextel";
import { listSerialDevices } from "./server/list-serials";
import { radiosConnect, radiosDisconnect, radiosMarkBle, radiosRemove, radiosSave, radiosSetPrimary, radiosStatus, radiosUpsert } from "./server/radios";
import { icomLanCmd, icomLanStatus } from "./server/icom-lan";
import { hubRigctl } from "./server/hamlib-hub";
import { loadSer2net, saveSer2net } from "./server/ser2net-store";
import { attachTerminal } from "./server/term";
import { createUser, deleteUser, listUsers, sshStatus } from "./server/users";
import { wavelogDatabase, wavelogDbUpdate, wavelogDown, wavelogStatus, wavelogUp } from "./server/wavelog-status";
import { wlgDown, wlgStatus, wlgUp } from "./server/wlg-status";
import { netConnect, netForget, netSave, netScan, netSetAp, netSetHostname, netSetIp, netSetLink, netStatus } from "./server/net";
import { processesAction, processesList } from "./server/processes";
import { servicesApplyBoot, servicesSetAutostart, servicesStatus } from "./server/services";
import { updatesApply, updatesRefresh, updatesStatus } from "./server/updates";
import { layoutGet, layoutSave } from "./server/layouts";
import { ldgCmd, ldgConnect, ldgDisconnect, ldgPeek, ldgSave } from "./server/ldg";
import { backupCreate, backupDelete, backupList, backupRestore } from "./server/backup";
import { hostStatus } from "./server/host-status";
// mmdvm/lp100a: import dinâmico nos handlers — evita restart do Vite a cada edição.

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map((entry) => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

function vitePluginStorageProxy(): Plugin {
  return {
    name: "manus-storage-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/manus-storage", async (req, res) => {
        const key = req.url?.replace(/^\//, "");
        if (!key) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing storage key");
          return;
        }

        const forgeBaseUrl = (process.env.BUILT_IN_FORGE_API_URL || "").replace(/\/+$/, "");
        const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;

        if (!forgeBaseUrl || !forgeKey) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Storage proxy not configured");
          return;
        }

        try {
          const forgeUrl = new URL("v1/storage/presign/get", forgeBaseUrl + "/");
          forgeUrl.searchParams.set("path", key);

          const forgeResp = await fetch(forgeUrl, {
            headers: { Authorization: `Bearer ${forgeKey}` },
          });

          if (!forgeResp.ok) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Storage backend error");
            return;
          }

          const { url } = (await forgeResp.json()) as { url: string };
          if (!url) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Empty signed URL");
            return;
          }

          res.writeHead(307, { Location: url, "Cache-Control": "no-store" });
          res.end();
        } catch {
          res.writeHead(502, { "Content-Type": "text/plain" });
          res.end("Storage proxy error");
        }
      });
    },
  };
}

function sendJson(res: { writeHead: (code: number, headers: Record<string, string>) => void; end: (body: string) => void }, code: number, body: unknown) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function vitePluginSerials(): Plugin {
  return {
    name: "serials-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/serials", (req, res, next) => {
        if (req.method !== "GET") return next();
        void listSerialDevices()
          .then((devices) => sendJson(res, 200, { devices }))
          .catch((err: unknown) => sendJson(res, 500, { devices: [], error: String(err) }));
      });
    },
  };
}

function readBody(req: { on: (ev: string, fn: (c?: Buffer) => void) => void }, timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => reject(new Error("body timeout")), timeoutMs);
    const done = (fn: () => void) => {
      clearTimeout(timer);
      fn();
    };
    req.on("data", (c) => {
      if (c) chunks.push(c);
    });
    req.on("end", () => done(() => resolve(Buffer.concat(chunks).toString("utf8"))));
    req.on("error", (err) => done(() => reject(err)));
  });
}

function vitePluginUsers(): Plugin {
  return {
    name: "users-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/api/users")) return next();
        try {
          if (req.method === "GET" && url === "/api/users") {
            const [users, ssh] = await Promise.all([listUsers(), sshStatus()]);
            return sendJson(res, 200, { users, ssh });
          }
          if (req.method === "POST" && url === "/api/users") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { name?: string; password?: string }) : {};
            const result = await createUser(String(body.name ?? ""), String(body.password ?? ""));
            return sendJson(res, result.ok ? 200 : 400, result);
          }
          const del = url.match(/^\/api\/users\/([^/]+)$/);
          if (req.method === "DELETE" && del) {
            const result = await deleteUser(decodeURIComponent(del[1]));
            return sendJson(res, result.ok ? 200 : 400, result);
          }
        } catch (err) {
          return sendJson(res, 500, { ok: false, error: String(err) });
        }
        next();
      });
    },
  };
}

function vitePluginTerm(): Plugin {
  return {
    name: "term-ws",
    configureServer(server: ViteDevServer) {
      const bind = () => {
        if (server.httpServer) attachTerminal(server.httpServer);
      };
      bind();
      server.httpServer?.on("listening", bind);
    },
  };
}

function vitePluginHamlib(): Plugin {
  return {
    name: "hamlib-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url !== "/api/hamlib/cmd") return next();
        try {
          if (req.method !== "POST") return next();
          const raw = await readBody(req);
          const body = raw ? (JSON.parse(raw) as { port?: number; host?: string; command?: string }) : {};
          const command = String(body.command ?? "");
          if (!command.trim()) return sendJson(res, 400, { ok: false, error: "command obrigatório" });
          const out = await hubRigctl(Number(body.port ?? 4532), command, String(body.host ?? "127.0.0.1"));
          return sendJson(res, out.ok ? 200 : 502, out);
        } catch (err) {
          return sendJson(res, 500, { ok: false, error: String(err) });
        }
      });
    },
  };
}

function vitePluginRadios(): Plugin {
  return {
    name: "radios-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/api/radios")) return next();
        try {
          if (req.method === "GET" && url === "/api/radios") {
            return sendJson(res, 200, await radiosStatus());
          }
          if (req.method === "PUT" && url === "/api/radios") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { radios?: unknown }) : {};
            return sendJson(res, 200, await radiosSave(body));
          }
          if (req.method === "POST" && url === "/api/radios") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
            return sendJson(res, 200, await radiosUpsert(body));
          }
          if (req.method === "POST" && url === "/api/radios/connect") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
            const result = await radiosConnect(body);
            return sendJson(res, result.ok ? 200 : 400, result);
          }
          if (req.method === "POST" && url === "/api/radios/disconnect") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { id?: string }) : {};
            return sendJson(res, 200, await radiosDisconnect(String(body.id || "")));
          }
          if (req.method === "POST" && url === "/api/radios/primary") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { id?: string }) : {};
            return sendJson(res, 200, await radiosSetPrimary(String(body.id || "")));
          }
          if (req.method === "POST" && url === "/api/radios/ble") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { id?: string; connected?: boolean; name?: string; error?: string }) : {};
            return sendJson(
              res,
              200,
              await radiosMarkBle(String(body.id || ""), Boolean(body.connected), body.name, body.error),
            );
          }
          if (req.method === "GET" && url === "/api/radios/lan") {
            return sendJson(res, 200, icomLanStatus());
          }
          if (req.method === "POST" && url === "/api/radios/civ") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
            const cmd = String(body.cmd ?? body.command ?? "");
            if (!cmd.trim()) return sendJson(res, 400, { ok: false, error: "cmd obrigatório" });
            const out = await icomLanCmd(cmd, body);
            return sendJson(res, out.ok ? 200 : 502, out);
          }
          const del = url.match(/^\/api\/radios\/([^/]+)$/);
          if (req.method === "DELETE" && del) {
            return sendJson(res, 200, await radiosRemove(decodeURIComponent(del[1])));
          }
        } catch (err) {
          return sendJson(res, 500, { ok: false, radios: [], error: String(err) });
        }
        next();
      });
    },
  };
}

function vitePluginSer2net(): Plugin {
  return {
    name: "ser2net-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url !== "/api/ser2net") return next();
        try {
          if (req.method === "GET") {
            return sendJson(res, 200, await loadSer2net());
          }
          if (req.method === "PUT") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { bind?: string; services?: unknown }) : {};
            const result = await saveSer2net(body);
            return sendJson(res, result.ok ? 200 : 400, result);
          }
        } catch (err) {
          return sendJson(res, 500, { ok: false, services: [], error: String(err) });
        }
        next();
      });
    },
  };
}

function vitePluginLextel(): Plugin {
  return {
    name: "lextel-api",
    configureServer(server: ViteDevServer) {
      void servicesApplyBoot();
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/api/lextel")) return next();
        try {
          if (req.method === "GET" && url === "/api/lextel") {
            return sendJson(res, 200, lextelStatus());
          }
          if (req.method === "PUT" && url === "/api/lextel") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
            return sendJson(
              res,
              200,
              await lextelSave(body as { addr?: string; name?: string; pin?: string; channel?: number; autoConnect?: boolean }),
            );
          }
          if (req.method === "POST" && url === "/api/lextel/scan") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { seconds?: number }) : {};
            return sendJson(res, 200, await lextelScan(Number(body.seconds) || 12));
          }
          if (req.method === "POST" && url === "/api/lextel/connect") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { addr?: string; pin?: string; name?: string; channel?: number }) : {};
            const result = await lextelConnect(body);
            return sendJson(res, result.ok && result.phase !== "error" ? 200 : 503, result);
          }
          if (req.method === "POST" && url === "/api/lextel/disconnect") {
            return sendJson(res, 200, await lextelDisconnect());
          }
          if (req.method === "POST" && url === "/api/lextel/keepalive") {
            return sendJson(res, 200, await lextelKeepalive());
          }
          if (req.method === "POST" && url === "/api/lextel/learn") {
            return sendJson(res, 200, await lextelLearn());
          }
          if (req.method === "POST" && url === "/api/lextel/bluetooth") {
            return sendJson(res, 200, await lextelOpenBluetooth());
          }
        } catch (err) {
          return sendJson(res, 500, { ok: false, error: String(err) });
        }
        next();
      });
    },
  };
}

function vitePluginNet(): Plugin {
  return {
    name: "net-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/api/net")) return next();
        try {
          if (req.method === "GET" && url === "/api/net") {
            return sendJson(res, 200, await netStatus());
          }
          if (req.method === "PUT" && url === "/api/net") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
            return sendJson(res, 200, await netSave(body));
          }
          if (req.method === "POST" && url === "/api/net/scan") {
            return sendJson(res, 200, await netScan());
          }
          if (req.method === "POST" && url === "/api/net/connect") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { ssid?: string; pass?: string }) : {};
            const result = await netConnect(body);
            return sendJson(res, result.ok ? 200 : 400, result);
          }
          if (req.method === "POST" && url === "/api/net/forget") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { ssid?: string }) : {};
            return sendJson(res, 200, await netForget(String(body.ssid || "")));
          }
          if (req.method === "POST" && url === "/api/net/link") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { link?: string }) : {};
            return sendJson(res, 200, await netSetLink(body.link === "ethernet" ? "ethernet" : "wifi"));
          }
          if (req.method === "POST" && url === "/api/net/ip") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
            const result = await netSetIp(body);
            return sendJson(res, result.ok ? 200 : 400, result);
          }
          if (req.method === "POST" && url === "/api/net/hostname") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { hostname?: string }) : {};
            const result = await netSetHostname(String(body.hostname || ""));
            return sendJson(res, result.ok ? 200 : 400, result);
          }
          if (req.method === "POST" && url === "/api/net/ap") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { ssid?: string; pass?: string }) : {};
            const result = await netSetAp(body);
            return sendJson(res, result.ok ? 200 : 400, result);
          }
        } catch (err) {
          return sendJson(res, 500, { ok: false, error: String(err) });
        }
        next();
      });
    },
  };
}

function vitePluginUpdates(): Plugin {
  return {
    name: "updates-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/api/updates")) return next();
        try {
          if (req.method === "GET" && url === "/api/updates") {
            return sendJson(res, 200, await updatesStatus());
          }
          if (req.method === "POST" && url === "/api/updates/check") {
            return sendJson(res, 200, await updatesRefresh());
          }
          if (req.method === "POST" && url === "/api/updates") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { id?: string }) : {};
            const result = await updatesApply(String(body.id || ""));
            return sendJson(res, result.ok ? 200 : 400, result);
          }
        } catch (err) {
          return sendJson(res, 500, { ok: false, items: [], pending: 0, error: String(err) });
        }
        next();
      });
    },
  };
}

function vitePluginLayout(): Plugin {
  return {
    name: "layout-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split("?")[0] ?? "";
        if (path !== "/api/layout") return next();
        try {
          if (req.method === "GET") {
            const user = new URL(req.url || "/", "http://local").searchParams.get("user") || "admin";
            return sendJson(res, 200, layoutGet(user));
          }
          if (req.method === "PUT") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { user?: string; tiles?: unknown }) : {};
            return sendJson(res, 200, layoutSave(body.user || "admin", body.tiles));
          }
        } catch (err) {
          return sendJson(res, 500, { ok: false, tiles: [], error: String(err) });
        }
        next();
      });
    },
  };
}

function vitePluginLdg(): Plugin {
  return {
    name: "ldg-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/api/ldg")) return next();
        try {
          if (req.method === "GET" && url === "/api/ldg") {
            return sendJson(res, 200, await ldgPeek());
          }
          if (req.method === "PUT" && url === "/api/ldg") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
            return sendJson(res, 200, await ldgSave(body));
          }
          if (req.method === "POST" && url === "/api/ldg/connect") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
            const result = await ldgConnect(body);
            return sendJson(res, result.ok ? 200 : 400, result);
          }
          if (req.method === "POST" && url === "/api/ldg/disconnect") {
            return sendJson(res, 200, await ldgDisconnect());
          }
          if (req.method === "POST" && url === "/api/ldg/cmd") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { cmd?: string }) : {};
            return sendJson(res, 200, await ldgCmd(String(body.cmd || "")));
          }
        } catch (err) {
          return sendJson(res, 500, { ok: false, error: String(err) });
        }
        next();
      });
    },
  };
}

function vitePluginServices(): Plugin {
  return {
    name: "services-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/api/services")) return next();
        try {
          if (req.method === "GET" && url === "/api/services") {
            return sendJson(res, 200, await servicesStatus());
          }
          if (req.method === "POST" && url === "/api/services") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { id?: string; autostart?: boolean }) : {};
            const result = await servicesSetAutostart(String(body.id || ""), Boolean(body.autostart));
            return sendJson(res, result.ok ? 200 : 400, result);
          }
        } catch (err) {
          return sendJson(res, 500, { ok: false, items: [], error: String(err) });
        }
        next();
      });
    },
  };
}

function vitePluginProcesses(): Plugin {
  return {
    name: "processes-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url !== "/api/processes") return next();
        try {
          if (req.method === "GET") {
            const body = await processesList();
            return sendJson(res, body.ok ? 200 : 500, body);
          }
          if (req.method === "POST") {
            const raw = await readBody(req);
            let body: { unit?: string; action?: string } = {};
            try {
              body = raw ? (JSON.parse(raw) as { unit?: string; action?: string }) : {};
            } catch {
              return sendJson(res, 400, { ok: false, unit: "", action: "", error: "JSON inválido" });
            }
            const result = await processesAction(String(body.unit ?? ""), String(body.action ?? ""));
            return sendJson(res, result.ok ? 200 : 400, result);
          }
        } catch (err) {
          return sendJson(res, 500, { ok: false, available: false, items: [], error: String(err) });
        }
        next();
      });
    },
  };
}

function vitePluginHost(): Plugin {
  return {
    name: "host-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url !== "/api/host") return next();
        try {
          if (req.method === "GET") {
            return sendJson(res, 200, await hostStatus());
          }
        } catch (err) {
          return sendJson(res, 500, {
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
            sampleMs: 5000,
            windowMs: 300000,
            samples: [],
          });
        }
        next();
      });
    },
  };
}

function vitePluginBackup(): Plugin {
  return {
    name: "backup-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/api/backup")) return next();
        try {
          if (req.method === "GET" && url === "/api/backup") {
            return sendJson(res, 200, backupList());
          }
          if (req.method === "POST" && url === "/api/backup") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { user?: string }) : {};
            const result = await backupCreate(String(body.user ?? "admin"));
            return sendJson(res, result.ok ? 200 : 500, result);
          }
          const del = url.match(/^\/api\/backup\/([^/]+)$/);
          if (req.method === "DELETE" && del) {
            const result = backupDelete(decodeURIComponent(del[1]));
            return sendJson(res, result.ok ? 200 : 400, result);
          }
          const rest = url.match(/^\/api\/backup\/([^/]+)\/restore$/);
          if (req.method === "POST" && rest) {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { confirm?: boolean }) : {};
            const result = await backupRestore(decodeURIComponent(rest[1]), Boolean(body.confirm));
            return sendJson(res, result.ok ? 200 : 400, result);
          }
        } catch (err) {
          return sendJson(res, 500, { ok: false, error: String(err) });
        }
        next();
      });
    },
  };
}

function vitePluginMmdvm(): Plugin {
  return {
    name: "mmdvm-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/api/mmdvm")) return next();
        void (async () => {
          const {
            mmdvmControl,
            mmdvmLink,
            mmdvmModePause,
            mmdvmModeResumeAll,
            mmdvmNetworkSet,
            mmdvmRemote,
            mmdvmSave,
            mmdvmStatus,
          } = await import("./server/mmdvm");
          if (req.method === "GET" && url === "/api/mmdvm") {
            return sendJson(res, 200, await mmdvmStatus());
          }
          if (req.method === "PUT" && url === "/api/mmdvm") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
            return sendJson(res, 200, await mmdvmSave(body));
          }
          if (req.method === "POST" && url === "/api/mmdvm/up") {
            const body = await mmdvmControl("start");
            return sendJson(res, body.hostRunning || body.installed ? 200 : 503, body);
          }
          if (req.method === "POST" && url === "/api/mmdvm/down") {
            return sendJson(res, 200, await mmdvmControl("stop"));
          }
          if (req.method === "POST" && url === "/api/mmdvm/restart") {
            return sendJson(res, 200, await mmdvmControl("restart"));
          }
          if (req.method === "POST" && url === "/api/mmdvm/remote") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { cmd?: string }) : {};
            const result = await mmdvmRemote(String(body.cmd || ""));
            return sendJson(res, result.ok ? 200 : 400, result);
          }
          if (req.method === "POST" && url === "/api/mmdvm/modes/resume-all") {
            return sendJson(res, 200, await mmdvmModeResumeAll());
          }
          const modeHit = url.match(/^\/api\/mmdvm\/mode\/([^/]+)\/(pause|resume)$/);
          if (req.method === "POST" && modeHit) {
            return sendJson(res, 200, await mmdvmModePause(decodeURIComponent(modeHit[1]!), modeHit[2] === "pause"));
          }
          if (req.method === "POST" && url === "/api/mmdvm/network") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { id?: string; section?: string; enabled?: boolean }) : {};
            return sendJson(res, 200, await mmdvmNetworkSet(body));
          }
          if (req.method === "POST" && url === "/api/mmdvm/link") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { mode?: string; target?: string; module?: string }) : {};
            return sendJson(res, 200, await mmdvmLink(body));
          }
          return sendJson(res, 404, { ok: false, error: "not found" });
        })().catch((err: unknown) => sendJson(res, 500, { ok: false, error: String(err) }));
      });
    },
  };
}

function vitePluginLp100a(): Plugin {
  return {
    name: "lp100a-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/api/lp100a")) return next();
        void (async () => {
          const { lp100aCmd, lp100aConnect, lp100aDisconnect, lp100aPeek, lp100aSave, lp100aStatus } = await import("./server/lp100a");
          if (req.method === "GET" && url === "/api/lp100a") {
            try {
              return sendJson(res, 200, await lp100aPeek());
            } catch {
              return sendJson(res, 200, lp100aStatus());
            }
          }
          if (req.method === "PUT" && url === "/api/lp100a") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
            return sendJson(res, 200, await lp100aSave(body));
          }
          if (req.method === "POST" && url === "/api/lp100a/connect") {
            const body = await lp100aConnect();
            return sendJson(res, body.ok ? 200 : 503, body);
          }
          if (req.method === "POST" && url === "/api/lp100a/disconnect") {
            return sendJson(res, 200, await lp100aDisconnect());
          }
          if (req.method === "POST" && url === "/api/lp100a/cmd") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { cmd?: string }) : {};
            return sendJson(res, 200, await lp100aCmd(String(body.cmd || "")));
          }
          return sendJson(res, 404, { ok: false, error: "not found" });
        })().catch((err: unknown) => sendJson(res, 500, { ok: false, error: String(err) }));
      });
    },
  };
}

function vitePluginWavelog(): Plugin {
  return {
    name: "wavelog-api",
    configureServer(server: ViteDevServer) {
      const handle = (
        path: string,
        method: string,
        run: () => Promise<unknown>,
        failCode = 500,
      ) => {
        server.middlewares.use(path, (req, res, next) => {
          if (req.method !== method) return next();
          void run()
            .then((body) => {
              const rec = typeof body === "object" && body !== null ? (body as { ok?: boolean; updated?: boolean }) : null;
              const ok = rec && "updated" in rec ? Boolean(rec.updated) : rec && "ok" in rec ? Boolean(rec.ok) : true;
              sendJson(res, method === "POST" && !ok ? 503 : 200, body);
            })
            .catch((err: unknown) => sendJson(res, failCode, { ok: false, error: String(err) }));
        });
      };
      handle("/api/wavelog/status", "GET", () => wavelogStatus());
      handle("/api/wavelog/up", "POST", () => wavelogUp());
      handle("/api/wavelog/down", "POST", () => wavelogDown());
      handle("/api/wavelog/database", "GET", () => wavelogDatabase());
      handle("/api/wavelog/db-update", "POST", () => wavelogDbUpdate());
      handle("/api/wlg/status", "GET", () => wlgStatus());
      handle("/api/wlg/up", "POST", () => wlgUp());
      handle("/api/wlg/down", "POST", () => wlgDown());
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(command === "build"
      ? []
      : [
          jsxLocPlugin(),
          vitePluginManusRuntime(),
          vitePluginManusDebugCollector(),
          vitePluginStorageProxy(),
          vitePluginSerials(),
          vitePluginRadios(),
          vitePluginHamlib(),
          vitePluginSer2net(),
          vitePluginLextel(),
          vitePluginLdg(),
          vitePluginNet(),
          vitePluginServices(),
          vitePluginProcesses(),
          vitePluginLayout(),
          vitePluginUpdates(),
          vitePluginWavelog(),
          vitePluginMmdvm(),
          vitePluginLp100a(),
          vitePluginBackup(),
          vitePluginHost(),
          vitePluginUsers(),
          vitePluginTerm(),
        ]),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: true,
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
}));
