# Portal público (Cloudflare Pages)

Endereço: <https://ham-cockpit.pages.dev>

O portal é o mesmo código React do site do aparelho, com entrada própria (`client/src/portal/main.tsx`).
Ele não tem o console nem a API do Pi.

Rotas públicas: `/` (produto), `/download`, `/manual`, `/docs`, `/licenca`, `/comprar`, `/comprar/retorno`, `/admin`.
API (Pages Functions): `/api/*` (licenças, checkout, webhooks, admin). Esquema D1 em `migrations/`.

## Como o deploy funciona

O projeto Pages `ham-cockpit` está ligado ao GitHub `fviudes/ham-cockpit`, branch `main`.
Todo push em `main` gera um deploy de produção.

| Item | Valor |
| --- | --- |
| Comando de build | `pnpm install --frozen-lockfile && pnpm exec vite build --config vite.config.portal.ts` |
| Pasta de saída | `dist/portal` (`wrangler.jsonc` → `pages_build_output_dir`) |
| Raiz | (vazia, raiz do repositório; pasta `functions/` sobe com o Pages) |
| Variáveis | `NODE_VERSION=22`, `PNPM_VERSION=10.4.1`, `PORTAL_ORIGIN`, `LICENSE_ACTIVE_KID` |
| D1 | binding `DB` → `ham-cockpit-licenses` (prod) / `ham-cockpit-licenses-preview` (preview) |
| Migrações | aplicadas com `wrangler d1 migrations apply` (o build do Pages **não** aplica sozinho) |

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

## Licenciamento (Functions + D1)

Configuração versionada: `wrangler.jsonc` (binding `DB`, `PORTAL_ORIGIN`, `LICENSE_ACTIVE_KID`).
Chave pública Ed25519: `shared/license-keys.ts` (no repositório). Chave privada e auth do admin:
**só** como secrets do Pages (nunca no Git).

| Secret | Uso |
| --- | --- |
| `LICENSE_SIGNING_KEY_K1` / `K2` | PKCS8 Ed25519 em base64 (assinatura HCL1) |
| `SECRETS_MASTER_KEY` | AES-GCM para credenciais PayPal/PicPay no D1 |
| `ADMIN_BOOTSTRAP_TOKEN` | Auth de contingência do `/admin` (sem domínio próprio) |
| `ADMIN_TOTP_SECRET` | TOTP (base32) do admin |
| `IP_HASH_KEY` | Hash de IP / CSRF |
| `MOCK_WEBHOOK_SECRET` | Opcional; provedor simulado |
| `ENABLE_MOCK_PROVIDER` | Variável `1` liga o checkout simulado (útil até haver PayPal/PicPay) |

Credenciais iniciais do admin ficam **fora do Git**, no arquivo local do proprietário
(`hamcockpit-secrets/admin-portal.env` na máquina dele). Entrada: `/admin` com a chave + TOTP.

PayPal (Orders v2) e PicPay: configure as credenciais na aba **Provedores** do admin
(cifradas no D1). Sem credenciais, o checkout usa o provedor simulado se `ENABLE_MOCK_PROVIDER=1`.
