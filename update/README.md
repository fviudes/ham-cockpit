# Canal de atualização — Ham Cockpit

Pasta **pública** lida pelo card **Ham Cockpit** em Admin → Atualização.

Versão atual neste canal: **0.1.10** (`version.json`).

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
  "version": "0.1.10",
  "channel": "main",
  "file": "ham-cockpit-0.1.10.tgz",
  "sha256": "0cc3e4653848816bd198d95916e40edff43bada287a8118418e18b0718344f93",
  "bytes": 5054935,
  "notes": "Ham Cockpit v0.1.10 — imagem e OTA com o laboratório.\n\n- Lextel: o MAC salvo não é reescrito. Bind clean ou connected do mesmo aparelho permanece, inclusive no rebind. O prazo do open não marca o bind como velho. Rebind só depois de ENODEV, e ENODEV não encerra o processo. A instalação e a OTA religam agora e de novo cerca de 20 s depois do reinício do console, sem rfkill, power off ou hciconfig.\n- S-meter do menu a cerca de 6 Hz, só o nível, com agulha interpolada. O restante do poll fica em 450 ms, sem STRENGTH. Leitura ainda no ar: o tick é pulado e a resposta é HTTP 200 ocupado.\n- Power off do IC-705 grava standby e envia 0x18 0x00.\n- A imagem nasce com o mesmo console: Bluetooth na mini-UART e MMDVM em ttyAMA0, IC-705 no Hamlib 4.6.5 pela porta 4002, SPE na 4001 RFC2217 com ampctld desligado, trava CI-V em /run/lock, VPN de suporte só no túnel, DHCP com client-id MAC e hostname ham-cockpit. A OTA não sobrescreve rádios, INI, services.json, Lextel, SPE nem a escolha da VPN."
}
```

- `"file"` preenchido: baixa `update/<file>` desta pasta.
- `"file"` vazio: inválido para apply — publique o `.tgz` com `node scripts/pack-update.mjs`.
- Notas de release: passe `--notes "…"` no pack (convenção: `Ham Cockpit vX.Y.ZZ[.NN] — …`).

O pacote traz o console compilado (`index.js` + `public/`), `package.json` de runtime, helpers em `bin/` e units em `systemd/`. **Não** inclui configs da estação (rádios, Wi‑Fi, bindings, layouts, ser2net…).

Instalação e operação: [README na raiz](../README.md). Imagem do cartão: [`instaladores/`](../instaladores/).
