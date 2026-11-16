# Canal de atualização — Ham Cockpit

Pasta **pública** lida pelo card **Ham Cockpit** em Admin → Atualização.

Versão atual neste canal: **0.1.12.07** (`version.json`).

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
  "version": "0.1.12.07",
  "channel": "main",
  "file": "ham-cockpit-0.1.12.07.tgz",
  "sha256": "3f678776440286258f45d908c75417b28fa8259a086e858ebc61986010040e7e",
  "bytes": 5124978,
  "notes": "Corrige cascata FT8 após layout digital: FitTile com altura do card e canvas em fill."
}
```

- `"file"` preenchido: baixa `update/<file>` desta pasta.
- `"file"` vazio: inválido para apply — publique o `.tgz` com `node scripts/pack-update.mjs`.
- Notas de release: passe `--notes "…"` no pack (convenção: `Ham Cockpit vX.Y.ZZ[.NN] — …`).

O pacote traz o console compilado (`index.js` + `public/`), `package.json` de runtime, helpers em `bin/` e units em `systemd/`. **Não** inclui configs da estação (rádios, Wi‑Fi, bindings, layouts, ser2net…).

Instalação e operação: [README na raiz](../README.md). Imagem do cartão: [`instaladores/`](../instaladores/).
