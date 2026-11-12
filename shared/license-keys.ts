/**
 * Chaveiro PÚBLICO das licenças do Ham Cockpit (Ed25519).
 *
 * Só chaves públicas entram aqui. As privadas são secrets do portal (Pages) e backup offline do dono.
 * Rotação: ver docs/licenciamento.md (seção "Chaves"). O `kid` são os 8 primeiros caracteres da pública
 * em base64url. Uma chave `standby` já viaja no código para permitir rotação sem esperar OTA.
 */
export interface KeyringEntry {
  kid: string;
  /** Rótulo usado no nome do secret do portal: LICENSE_SIGNING_KEY_<LABEL em maiúsculas>. */
  label: string;
  env: "prod" | "dev";
  /** 32 bytes brutos da chave pública, em base64url. */
  pub: string;
  status: "active" | "standby" | "revoked";
}

export const LICENSE_KEYRING: KeyringEntry[] = [
  { kid: "d8GApVW5", label: "k1", env: "prod", pub: "d8GApVW51biDApMLOm-IkMmJJDvNJXZBCrBeaZy7-o4", status: "active" },
  { kid: "yZZtM_MM", label: "k2", env: "prod", pub: "yZZtM_MMa0KhA-ePm9Sa2pe4GqnzNdST-qMEALsiQyo", status: "standby" },
];

/** Chave com a qual o portal assina por padrão (secret LICENSE_SIGNING_KEY_K1). */
export const ACTIVE_KID = "d8GApVW5";
