# Portal público (Cloudflare Pages)

Endereço: <https://ham-cockpit.pages.dev>

O portal é o mesmo código React do site do aparelho, com entrada própria (`client/src/portal/main.tsx`).
Ele não tem o console nem a API do Pi. Rotas: `/` (produto), `/download`, `/manual`, `/docs`.

## Como o deploy funciona

O projeto Pages `ham-cockpit` está ligado ao GitHub `fviudes/ham-cockpit`, branch `main`.
Todo push em `main` gera um deploy de produção.

| Item | Valor |
| --- | --- |
| Comando de build | `pnpm install --frozen-lockfile && pnpm exec vite build --config vite.config.portal.ts` |
| Pasta de saída | `dist/portal` |
| Raiz | (vazia, raiz do repositório) |
| Variáveis | `NODE_VERSION=22`, `PNPM_VERSION=10.4.1` (produção e preview) |

Teste local:

```powershell
pnpm exec vite build --config vite.config.portal.ts
pnpm exec vite preview --config vite.config.portal.ts --port 4173
```

## Versão da imagem

- No build, o `vite.config.portal.ts` consulta os releases públicos do GitHub e grava `latest-image.json`
  (versão de 3 partes, arquivo, tamanho, data). Sem rede, usa o arquivo `VERSION` como reserva.
- No navegador, a página também consulta a API pública de releases. Assim, uma imagem nova aparece
  mesmo antes do próximo deploy. Nenhuma chave secreta vai para o front.
- O link de baixar a imagem fica **desativado**, com o selo "Em desenvolvimento".
  Para liberar, edite `client/src/pages/Download.tsx`.

## Atualização após o bake

No fim do `appliance-image.yml`, o passo "Atualizar o portal" chama um deploy hook do Pages.
O workflow `portal-redeploy.yml` faz o mesmo quando um release é publicado à mão ou quando você o dispara.

O secret do GitHub `CF_PAGES_DEPLOY_HOOK` guarda a URL do hook:

```text
https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/<hook_id>
```

Para criar outro hook: Cloudflare → Workers & Pages → `ham-cockpit` → Settings → Builds → Deploy hooks
(ramo `main`). Depois grave a URL com `gh secret set CF_PAGES_DEPLOY_HOOK --repo fviudes/ham-cockpit`.

Sem o secret, nada quebra: o bake segue e o portal ainda se atualiza sozinho no navegador.
