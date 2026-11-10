# Canal de atualização — Ham Cockpit

Pasta **pública** lida pelo card **Ham Cockpit** em Admin → Atualização.

Versão atual neste canal: **0.1.03** (`version.json`).

## Como o console usa esta pasta

1. Lê `version.json` na branch `main`.
2. Compara com `/opt/ham-cockpit/VERSION` (ou o `VERSION` da árvore instalada).
3. Se o número daqui for maior, o botão Atualizar aplica o pacote.

```json
{
  "version": "0.1.03",
  "channel": "main",
  "file": "ham-cockpit-0.1.03.tgz",
  "notes": "…"
}
```

- `"file"` preenchido: baixa `update/<file>` desta pasta.
- `"file"` vazio: a estação usa o snapshot publicado de `main`.

Instalação e operação: [README na raiz](../README.md). Imagem do cartão: [`instaladores/`](../instaladores/).
