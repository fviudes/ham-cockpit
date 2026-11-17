import { createWriteStream, existsSync, rmSync, type WriteStream } from "node:fs";
import { execFile } from "node:child_process";
import { basename, join } from "node:path";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Teto do .tgz enviado na atualização manual (pacote OTA completo). */
export const OTA_UPLOAD_MAX = 600 * 1024 * 1024;

/** Folga no Content-Length declarado (overhead multipart). */
export const OTA_UPLOAD_SLACK = 2 * 1024 * 1024;

/** Valor para `client_max_body_size` no nginx (OTA_UPLOAD_MAX + folga). */
export const OTA_NGINX_CLIENT_MAX_BODY = "650m";
const PKG_RE = /^ham-cockpit-\d+\.\d+\.\d+(?:\.\d+)?\.tgz$/i;
const SHA_RE = /^[a-f0-9]{64}$/i;

export function otaPackageFilenameOk(filename: string): boolean {
  const base = basename(filename.replace(/\\/g, "/"));
  return PKG_RE.test(base);
}

export function otaVersionFromFilename(filename: string): string | null {
  const base = basename(filename.replace(/\\/g, "/"));
  const m = /^ham-cockpit-(.+)\.tgz$/i.exec(base);
  return m?.[1]?.trim() || null;
}

export function otaSha256Ok(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return !v || SHA_RE.test(v);
}

export function otaDropUpload(path: string) {
  try {
    rmSync(path, { force: true });
  } catch {
    /* */
  }
}

type UploadReq = {
  headers: { "content-type"?: string | string[]; "content-length"?: string | string[] };
  on: (ev: string, fn: (chunk?: Buffer | Error) => void) => void;
  pause?: () => void;
  resume?: () => void;
};

export type OtaUpload =
  | { ok: true; path: string; filename: string; sha256: string }
  | { ok: false; error: string };

function headerOne(req: UploadReq, name: "content-type" | "content-length"): string {
  const v = req.headers[name];
  return (Array.isArray(v) ? v.join(";") : v || "").trim();
}

function multipartBoundary(contentType: string): string | null {
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const b = (m?.[1] || m?.[2] || "").trim();
  return b || null;
}

function dispositionOf(headerBlock: string): { name: string; filename: string } {
  const disp = headerBlock.split(/\r?\n/).find((l) => l.toLowerCase().startsWith("content-disposition"));
  if (!disp) return { name: "", filename: "" };
  const name = /(?:^|;)\s*name="([^"]*)"/i.exec(disp)?.[1] || "";
  const star = /filename\*=UTF-8''([^;\r\n]+)/i.exec(disp)?.[1];
  const quoted = /filename="([^"]*)"/i.exec(disp)?.[1];
  let filename = "";
  if (star) {
    try {
      filename = decodeURIComponent(star.trim());
    } catch {
      filename = star.trim();
    }
  } else if (quoted) filename = quoted;
  filename = basename(filename.replace(/\\/g, "/"));
  return { name, filename };
}

/** Lê multipart (campo `file` + `sha256` opcional) e grava o .tgz em arquivo temporário. */
export function otaReadUpload(req: UploadReq): Promise<OtaUpload> {
  const boundary = multipartBoundary(headerOne(req, "content-type"));
  if (!boundary) return Promise.resolve({ ok: false, error: "Envie o pacote OTA como arquivo .tgz." });
  const declared = Number(headerOne(req, "content-length") || "0");
  if (Number.isFinite(declared) && declared > OTA_UPLOAD_MAX + OTA_UPLOAD_SLACK) {
    req.resume?.();
    req.on("data", () => undefined);
    return Promise.resolve({ ok: false, error: "Arquivo grande demais (limite de 600 MB)." });
  }

  const openDelim = Buffer.from(`--${boundary}`);
  const nextDelim = Buffer.from(`\r\n--${boundary}`);
  const headerSep = Buffer.from("\r\n\r\n");
  const keep = nextDelim.length + 4;

  return new Promise((resolve) => {
    let buf = Buffer.alloc(0);
    let mode: "start" | "headers" | "body" = "start";
    let fileOut: WriteStream | null = null;
    let tmpPath = "";
    let filename = "";
    let sha256 = "";
    let currentName = "";
    let fileBytes = 0;
    let done = false;
    let closing = false;
    let fieldChunks: Buffer[] = [];
    let closed: Promise<void> = Promise.resolve();

    const finish = (result: OtaUpload) => {
      if (done) return;
      done = true;
      resolve(result);
    };

    const fail = (error: string) => {
      if (done) return;
      try {
        fileOut?.destroy();
      } catch {
        /* */
      }
      fileOut = null;
      if (tmpPath) otaDropUpload(tmpPath);
      tmpPath = "";
      finish({ ok: false, error });
    };

    const writeBody = (chunk: Buffer) => {
      if (!chunk.length || done) return;
      if (fileOut) {
        fileBytes += chunk.length;
        if (fileBytes > OTA_UPLOAD_MAX) {
          fail("Arquivo grande demais (limite de 600 MB).");
          return;
        }
        const stream = fileOut;
        const ok = stream.write(chunk);
        if (!ok) {
          req.pause?.();
          stream.once("drain", () => req.resume?.());
        }
        return;
      }
      fieldChunks.push(chunk);
      if (fieldChunks.reduce((n, c) => n + c.length, 0) > 128) fail("Campo de formulário inválido.");
    };

    const closePart = () => {
      if (fileOut) {
        const stream = fileOut;
        fileOut = null;
        closed = new Promise((res, rej) => {
          stream.on("error", rej);
          stream.end(() => res());
        });
      } else if (currentName === "sha256") {
        sha256 = Buffer.concat(fieldChunks).toString("utf8").trim().toLowerCase();
      }
      currentName = "";
      fieldChunks = [];
    };

    const openPart = (headerText: string) => {
      const d = dispositionOf(headerText);
      currentName = d.name;
      fieldChunks = [];
      if (!d.filename) return;
      if (filename) {
        fail("Envie apenas um arquivo.");
        return;
      }
      if (!otaPackageFilenameOk(d.filename)) {
        fail("Use um arquivo ham-cockpit-VERSÃO.tgz.");
        return;
      }
      filename = basename(d.filename);
      tmpPath = join(tmpdir(), `hc-ota-manual-${randomBytes(8).toString("hex")}.tgz`);
      fileOut = createWriteStream(tmpPath);
      fileOut.on("error", () => fail("Não foi possível gravar o arquivo enviado."));
    };

    const pump = () => {
      for (;;) {
        if (done) return;
        if (mode === "start") {
          const at = buf.indexOf(openDelim);
          if (at < 0) {
            if (buf.length > openDelim.length + 64) buf = buf.subarray(buf.length - (openDelim.length + 64));
            return;
          }
          const after = at + openDelim.length;
          if (buf.length < after + 2) return;
          const mark = buf.subarray(after, after + 2).toString("utf8");
          if (mark === "--") {
            closing = true;
            buf = Buffer.alloc(0);
            closePart();
            void closed
              .then(() => {
                if (!filename || !tmpPath) {
                  finish({ ok: false, error: "Nenhum arquivo enviado." });
                  return;
                }
                if (sha256 && !otaSha256Ok(sha256)) {
                  otaDropUpload(tmpPath);
                  finish({ ok: false, error: "SHA256 inválido (use 64 caracteres hexadecimais)." });
                  return;
                }
                finish({ ok: true, path: tmpPath, filename, sha256 });
              })
              .catch(() => fail("Não foi possível gravar o arquivo enviado."));
            return;
          }
          if (mark !== "\r\n" && mark !== "\n") {
            fail("Multipart inválido.");
            return;
          }
          buf = buf.subarray(after + (mark === "\r\n" ? 2 : 1));
          mode = "headers";
          continue;
        }
        if (mode === "headers") {
          const sep = buf.indexOf(headerSep);
          if (sep < 0) {
            if (buf.length > 32_768) fail("Cabeçalho multipart grande demais.");
            return;
          }
          const headerText = buf.subarray(0, sep).toString("utf8");
          buf = buf.subarray(sep + headerSep.length);
          openPart(headerText);
          mode = "body";
          continue;
        }
        const end = buf.indexOf(nextDelim);
        if (end < 0) {
          if (buf.length > keep) {
            writeBody(buf.subarray(0, buf.length - keep));
            buf = buf.subarray(buf.length - keep);
          }
          return;
        }
        writeBody(buf.subarray(0, end));
        buf = buf.subarray(end + 2);
        closePart();
        mode = "start";
      }
    };

    req.on("data", (chunk) => {
      if (done) return;
      buf = Buffer.concat([buf, chunk as Buffer]);
      pump();
    });
    req.on("end", () => {
      if (done || closing) return;
      if (mode !== "start" || filename) pump();
      if (!done && !closing) fail("Envio incompleto.");
    });
    req.on("error", () => fail("Falha na leitura do envio."));
  });
}

/** Confere se o tarball parece um pacote OTA (index.js + public/). Só no Linux. */
export async function otaValidatePackage(path: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!existsSync(path)) return { ok: false, error: "Pacote ausente." };
  if (process.platform !== "linux") return { ok: true };
  try {
    const { stdout } = await execFileAsync("tar", ["-tzf", path], { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
    const names = String(stdout).split(/\r?\n/).filter(Boolean);
    const hasIndex = names.some((n) => n.endsWith("/index.js") || n === "index.js" || n.endsWith("index.js"));
    const hasPublic = names.some((n) => n.includes("/public/") || n.startsWith("public/"));
    if (!hasIndex || !hasPublic) {
      return { ok: false, error: "O arquivo não é um pacote ham-cockpit válido (faltam index.js ou public/)." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível ler o arquivo .tgz." };
  }
}