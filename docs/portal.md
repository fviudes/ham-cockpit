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
Chave pública Ed25519: `shared/license-keys.ts` (no repositório). Chave privada de assinatura e
chave mestra AES: **só** secrets do Pages (nunca no Git). Login do admin = **conta no D1**.

| Secret / infra | Uso |
| --- | --- |
| `LICENSE_SIGNING_KEY_K1` / `K2` | PKCS8 Ed25519 em base64 (assinatura HCL1) |
| `SECRETS_MASTER_KEY` | AES-GCM para credenciais PayPal/PicPay no D1 |
| `IP_HASH_KEY` | Hash de IP / CSRF |
| `MOCK_WEBHOOK_SECRET` | Opcional; provedor simulado |
| `ENABLE_MOCK_PROVIDER` | Variável `1` liga o checkout simulado (útil até haver PayPal/PicPay) |

### Admin (usuário no D1)

- Tabela `admin_users` (migration `0002_admin_credentials.sql`): `username`, `password_hash` (PBKDF2-SHA256,
  10 mil iterações — tradeoff do Workers Free; rate limit forte no login), `role`, `status`.
- `GET /api/health` → `adminConfigured: true` só se existir pelo menos um usuário **ativo** com senha.
- Login: `POST /api/admin/login` com `{ username, password }` → cookie `__Host-hc_admin` + CSRF.
- Criar/listar/desativar: `GET|POST /api/admin/users`, `PATCH /api/admin/users/:id` (papel `owner`).
- Seed do primeiro usuário (production e preview):

```powershell
pnpm exec wrangler d1 migrations apply ham-cockpit-licenses --remote
pnpm exec wrangler d1 migrations apply ham-cockpit-licenses --preview
node scripts/seed-admin.mjs --env remote --username admin
node scripts/seed-admin.mjs --env preview --username admin
```

Credenciais iniciais ficam **fora do Git**, em `hamcockpit-secrets/admin-portal.env` na máquina do
proprietário (`ADMIN_USERNAME` / `ADMIN_PASSWORD`). Produção **não** lê esse arquivo — só o D1.
Entrada: <https://ham-cockpit.pages.dev/admin> com usuário e senha.

PayPal (Orders v2) e PicPay: configure as credenciais na aba **Provedores** do admin
(cifradas no D1). Sem credenciais, o checkout usa o provedor simulado se `ENABLE_MOCK_PROVIDER=1`.
