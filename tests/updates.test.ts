import { describe, expect, it } from "vitest";
import { lastJsonObject } from "../server/updates";
import {
  OTA_NGINX_CLIENT_MAX_BODY,
  OTA_UPLOAD_MAX,
  otaPackageFilenameOk,
  otaReadUpload,
  otaSha256Ok,
  otaVersionFromFilename,
} from "../server/updates-upload";

describe("updates", () => {
  it("extrai o último JSON do stdout do station-upd", () => {
    const mixed = [
      "HC_PROGRESS {\"id\":\"app\",\"pct\":97,\"stage\":\"hooks\"}",
      '{"ok":true,"os":"Ubuntu","items":[]}',
      '{"ok":true,"os":"Ubuntu","items":[{"id":"app"}]}',
    ].join("\n");
    expect(JSON.parse(lastJsonObject(mixed)).items).toHaveLength(1);
  });

  it("valida nome e versão do pacote OTA manual", () => {
    expect(otaPackageFilenameOk("ham-cockpit-0.1.14.01.tgz")).toBe(true);
    expect(otaPackageFilenameOk("backup.tgz")).toBe(false);
    expect(otaVersionFromFilename("ham-cockpit-0.1.14.01.tgz")).toBe("0.1.14.01");
    expect(otaSha256Ok("")).toBe(true);
    expect(otaSha256Ok("abc")).toBe(false);
    expect(otaSha256Ok("e".repeat(64))).toBe(true);
  });

  it("expõe teto de upload e valor nginx alinhados", () => {
    expect(OTA_UPLOAD_MAX).toBe(600 * 1024 * 1024);
    expect(OTA_NGINX_CLIENT_MAX_BODY).toBe("650m");
  });

  it("lê multipart pequeno com arquivo OTA e SHA256", async () => {
    const boundary = "----hc-test";
    const payload = "hello-ota";
    const sha = "a".repeat(64);
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="sha256"',
      "",
      sha,
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="ham-cockpit-0.1.14.05.tgz"',
      "Content-Type: application/gzip",
      "",
      payload,
      `--${boundary}--`,
      "",
    ].join("\r\n");
    const raw = Buffer.from(body, "utf8");
    const { Readable } = await import("node:stream");
    const stream = Readable.from([raw]);
    const req = {
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": String(raw.length),
      },
      on: (ev: string, fn: (chunk?: Buffer | Error) => void) => stream.on(ev, fn),
      pause: () => stream.pause(),
      resume: () => stream.resume(),
    };
    const upload = await otaReadUpload(req);
    expect(upload.ok).toBe(true);
    if (!upload.ok) return;
    expect(upload.filename).toBe("ham-cockpit-0.1.14.05.tgz");
    expect(upload.sha256).toBe(sha);
    const { readFileSync, rmSync } = await import("node:fs");
    expect(readFileSync(upload.path, "utf8")).toBe(payload);
    rmSync(upload.path, { force: true });
  });
});