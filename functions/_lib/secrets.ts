import { b64Decode, b64Encode } from "../../shared/license";
import type { Ctx } from "./env";
import { HttpError } from "./util";

const enc = new TextEncoder();
const dec = new TextDecoder();

async function masterKey(ctx: Ctx): Promise<CryptoKey> {
  const raw = ctx.env.SECRETS_MASTER_KEY;
  if (!raw) throw new HttpError(500, "master_key_missing", "SECRETS_MASTER_KEY não configurada");
  const bytes = b64Decode(raw);
  if (bytes.length !== 32) throw new HttpError(500, "master_key_invalid", "SECRETS_MASTER_KEY precisa ter 32 bytes (base64)");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** AES-GCM; o contexto (provedor|modo|nome) entra como dado autenticado, então o texto cifrado não é transplantável. */
export async function encryptSecret(ctx: Ctx, aad: string, plain: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, await masterKey(ctx), enc.encode(plain));
  return { ciphertext: b64Encode(new Uint8Array(ct)), iv: b64Encode(iv) };
}

export async function decryptSecret(ctx: Ctx, aad: string, ciphertext: string, iv: string): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64Decode(iv), additionalData: enc.encode(aad) },
    await masterKey(ctx),
    b64Decode(ciphertext),
  );
  return dec.decode(pt);
}
