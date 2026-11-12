# Capturas de tela do manual

As imagens do manual do operador (`/console/manual` no dispositivo e `/manual` no portal) e da documentação do portal (`/docs`) são **capturas reais do console**, geradas automaticamente a partir de um servidor de demonstração com dados fictícios.

- Imagens: `client/public/telas/*.webp` (servidas como `/telas/<nome>.webp` no portal e no aparelho).
- Componente: `client/src/console/manual-screens.tsx` (`<Screen name="console-status" />`: `loading="lazy"`, largura responsiva, legenda pt-BR/EN e clique para ampliar). Textos `alt` e legendas ficam no mapa `SCREENS`.
- Tamanhos: `client/src/console/manual-screens.sizes.ts` (gerado pelo script; define `width`/`height` e evita salto de layout).

## Simulação (`HC_DEMO=1`)

`scripts/demo-server.mjs` é um servidor **independente** (Express + WebSocket) que responde às APIs `/api/*` do console com dados de exemplo: IC-705 pela rede (Icom LAN), ser2net, SPE, LDG, LP-100A, Lextel, Hamplus, Palstar, ACOM, Wavelog/WaveLogGate, MMDVM com Nextion, Status do SoC, Atualizações (OTA), Serviços, Rede, Backup e terminal.

Segurança:

- Só inicia com `HC_DEMO=1` explícito; sem a variável o script sai com erro.
- Escuta apenas em `127.0.0.1` (porta padrão 3100, `HC_DEMO_PORT`).
- Não faz parte de `server/` nem da OTA (`pack-update.mjs` não empacota `scripts/`): o dispositivo em produção nunca roda a simulação.
- Não toca em rádio, serial, rede, serviços nem arquivos do sistema; o terminal é falso (comandos prontos).
- Dados fictícios: indicativo `PY2XYZ`, ID DMR `7249999`, IPs de exemplo (`192.168.1.x`, `192.168.4.1`).

Para explorar a simulação à mão:

```powershell
pnpm exec vite build --config vite.config.prod.ts
$env:HC_DEMO = "1"; $env:HC_DEMO_DIST = "dist/public"
node scripts/demo-server.mjs   # http://127.0.0.1:3100/console (login padrão do console: admin / 1234)
```

## Gerar as capturas de novo

Requisitos: Edge ou Chrome instalado (use `HC_BROWSER` para indicar outro executável) e `pnpm install` feito. Nenhuma dependência extra.

```powershell
node scripts/capture-manual.mjs                 # build do console + demo + todas as telas
node scripts/capture-manual.mjs --no-build      # reaproveita tmp/demo-public
node scripts/capture-manual.mjs --only status   # só as capturas cujo nome contém "status"
node scripts/capture-manual.mjs --list          # lista as capturas
```

O script sobe o `demo-server`, abre o navegador em modo headless pelo DevTools Protocol, ajusta a cena (por exemplo, atualização disponível ou em andamento, TX ligado), captura em WebP (qualidade 82) e atualiza `manual-screens.sizes.ts`. As capturas ficam em torno de 2 MB no total.

Para incluir uma tela nova: adicione uma entrada em `SHOTS` (`scripts/capture-manual.mjs`), rode `--only <nome>`, cadastre `alt` e legenda em `SCREENS` e use `<Screen name="…" />` em `client/src/console/manual.tsx` e/ou `client/src/pages/Docs.tsx`.

## Telas incluídas

| Arquivo | O que mostra |
| --- | --- |
| `console-login` | Entrada do console |
| `console-painel`, `console-painel-tx` | Painel (VFO, bandas, modo, ganhos) em RX e em TX |
| `console-menu-celular` | Menu no celular |
| `console-status`, `console-status-celular` | Status do Pi (SoC, temperatura, memória, disco) e dos serviços |
| `console-servicos` | Serviços (iniciar, parar, reiniciar) |
| `console-atualizacoes`, `console-atualizacoes-progresso` | Atualização OTA disponível e em andamento |
| `console-admin`, `console-backup`, `console-terminal`, `console-logs` | Administração, backup, terminal e diário |
| `console-rede-wifi`, `console-bluetooth` | Rede, AP e Bluetooth |
| `console-radio-ic705-lan` | IC-705 pela rede (Icom LAN), rádio principal |
| `console-ser2net` | Conexões ser2net |
| `console-wavelog` | Wavelog, banco e WaveLogGate |
| `console-mmdvm`, `console-mmdvm-redes`, `console-mmdvm-ouvidos` | MMDVM, Nextion, redes DMR e últimos ouvidos |
| `console-spe`, `console-hamplus`, `console-palstar`, `console-acom` | Painéis de amplificador, chave de antena e sintonizador |
| `console-ldg`, `console-lp100a`, `console-lextel` | Sintonizador LDG e wattímetros LP-100A e Lextel (em TX) |
| `console-assistente` | Config Device Wizard |

## Limitações

- O Bluetooth LE real do IC-705 (Web Bluetooth) não é simulável: a tela de IC-705 usa o modo Rede (Icom LAN).
- SPE, Hamplus, Palstar e ACOM mostram a interface local sem telemetria real do equipamento.
- Antes de commitar, confira cada imagem: nada de senhas, tokens, IPs reais, seriais ou indicativos reais.
- No dispositivo, as imagens só chegam ao aparelho na próxima OTA (elas entram em `dist/public`); no portal, no próximo push em `main`.
