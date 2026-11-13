# Catálogo de equipamentos + Hamlib Hub

O console e o gateway usam este módulo como **fonte de verdade** dos rádios suportados.
A comunicação CAT da estação passa pelo **Hamlib** (`rigctld`), não por drivers nativos (ainda).

## Documentação do operador

- UI: `/docs#equipamentos` e Manual → **Rádios suportados** (`EquipmentGuide`)
- Markdown: [`docs/equipamentos.md`](../../docs/equipamentos.md)

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `types.ts` | Schema (makers, conexões, capabilities, binding, plano Hamlib) |
| `catalog.ts` | Lista estática de modelos (Icom…Xiegu, HL2, Anan) |
| `hamlib.ts` | Monta `rigctld` argv a partir do catálogo + binding |
| `labels.ts` | Rótulos pt-BR/en (maker, protocolo, conexão) |
| `index.ts` | Reexport |

## Fluxo

```
Catálogo (modelo + conexões)
        │
        ▼
 Binding da estação  (data/equipment/bindings.json)
        │
        ▼
 planHamlib() → argv  (-m -r -t; -c só se o CI-V não for o padrão do modelo)
        │
        ▼
 rigctld  ←── console / WSJT-X / WaveLogGate (NET :4532)
```

## API HTTP

- `GET /api/equipment` — catálogo (`?maker=icom`)
- `GET /api/hamlib` — bindings + planos
- `POST /api/hamlib/bindings` — cria/atualiza binding
- `POST /api/hamlib/plan` — simula plano sem gravar
- `POST /api/hamlib/cmd` — envia comando Hamlib NET (`f`, `F 14074000`, …)

## Backends Hamlib

| Backend | `-r` | Exemplos |
| --- | --- | --- |
| `ser2net` | `127.0.0.1:<porta ser2net>` | Icom USB, Yaesu, Kenwood, Xiegu, Ten-Tec |
| `cat-proxy` | `<host>:<CAT do app>` | HL2/Anan via Thetis `:13013` ou piHPSDR `:19090` |
| `icom-lan` | `127.0.0.1:45002` | Icom Network Control (UDP 50001–3) via gateway Node |
| `none` | — | GATT, Flex TCP, Metis P1/P2, TCI (drivers futuros) |

## Icom LAN

O console grava host + Network User/senha; `radiosConnect` sobe `server/icom-lan.ts` (pacote `icom-wlan-node`), espelha CI-V em TCP `127.0.0.1:45002` e aponta um `rigctld` temporário em `:4532`. Painel VFO usa `POST /api/radios/civ`.

## Sem drivers nativos (ainda)

Flex SmartSDR (TCP 4992), OpenHPSDR P1/P2 e TCI estão no catálogo com `hamlibReady: false`. O hub devolve `ready: false` + `deferReason` até existir o transporte.
