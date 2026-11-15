# Canal de atualização — Ham Cockpit

Pasta **pública** lida pelo card **Ham Cockpit** em Admin → Atualização.

Versão atual neste canal: **0.1.10.07** (`version.json`).

## Versionamento

- **Imagem (bake):** base `x.y.zz` → `ham-cockpit-x.y.zz-raspi.img.xz` (sem sufixo OTA).
- **OTA-only:** mesma base + `.01` … `.99` → `ham-cockpit-x.y.zz.NN.tgz`.
- Comparação: `0.1.04` < `0.1.04.01` < `0.1.04.02` < `0.1.05`.

Guia completo: [docs/versionamento.md](../docs/versionamento.md).

## Como o console usa esta pasta

1. Lê `version.json` na branch `main`.
2. Compara com `/opt/ham-cockpit/VERSION` (ou o `VERSION` da árvore instalada).
3. Se o número daqui for maior, o botão Atualizar aplica o pacote.

```json
{
  "version": "0.1.10.07",
  "channel": "main",
  "file": "ham-cockpit-0.1.10.07.tgz",
  "sha256": "7f801c9cf71bfecbf556bf8abf4bb1b33ebe8a4aaed68d008807d001ae729e5a",
  "bytes": 5116067,
  "notes": "Ham Cockpit v0.1.10.07 — Habilitar FT8 guarda a frequência e o modo, põe o IC-705 em DATA (PKTUSB), sintoniza o dial e decodifica. A escuta continua em outro menu. Desabilitar devolve os dois e para a captura. A cascata fica acima das listas e o TX manda o tom inteiro depois de 0,5 s de silêncio.\n\nA OTA não sobrescreve rádios, INI, services.json, Lextel, SPE nem a escolha da VPN."
}
```

- `"file"` preenchido: baixa `update/<file>` desta pasta.
- `"file"` vazio: inválido para apply — publique o `.tgz` com `node scripts/pack-update.mjs`.
- Notas de release: passe `--notes "…"` no pack (convenção: `Ham Cockpit vX.Y.ZZ[.NN] — …`).

O pacote traz o console compilado (`index.js` + `public/`), `package.json` de runtime, helpers em `bin/` e units em `systemd/`. **Não** inclui configs da estação (rádios, Wi‑Fi, bindings, layouts, ser2net…).

Instalação e operação: [README na raiz](../README.md). Imagem do cartão: [`instaladores/`](../instaladores/).
