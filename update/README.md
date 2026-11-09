# Ham Cockpit — canal de atualização

Esta pasta é o canal de update do console. O card **Ham Cockpit** em Admin → Atualização lê `version.json` na branch `main` de [fviudes/ham-cockpit](https://github.com/fviudes/ham-cockpit).

## Como publicar uma versão

1. Suba o número em `version.json` (e no `VERSION` da raiz, se esta árvore for a instalada).
2. Opcional: coloque o pacote `ham-cockpit-<versão>.tgz` nesta pasta e preencha `"file"`.
3. Faça merge em `main`. As estações passam a mostrar a nova versão no card.

```json
{
  "version": "2.0.1",
  "channel": "main",
  "file": "ham-cockpit-2.0.1.tgz",
  "notes": "correções do painel"
}
```

Sem `"file"`, a estação baixa o snapshot de `main` e instala o `dist/` publicado no repositório.
