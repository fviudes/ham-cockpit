# Arquitetura — Ham Cockpit v0.1.00

Visão interna da estação. Operadores usam o [README](../README.md) e o Manual do console.

## Mapa

```
Operador (Chrome/Edge)
        │ HTTP :80 (nginx → Node :3000)
        ▼
 Ham Cockpit (/opt/ham-cockpit)
        │
        ├── ser2net  USB-serial ↔ TCP 127.0.0.1:400x
        ├── Hamlib   rigctld :4532  ampctld SPE
        ├── WaveLogGate  UDP 2333 → Wavelog :8086
        ├── BLE GATT     IC-705 CI-V
        └── SPP Classic  Lextel MS-2000
```

Acessórios (SPE, Hamplus, Palstar, LDG, ACOM) **não** abrem a TTY: o console fala TCP com o ser2net. Cat-USB do rádio também. Só Bluetooth (GATT/SPP) é direto.

## Pastas no Ubuntu Server

| Caminho | Função |
| --- | --- |
| `/opt/ham-cockpit` | Console Node + `VERSION` |
| `/opt/ser2net` | `services.json` / yaml gerado |
| `/opt/wavelog` | Compose MariaDB + PHP :8086 |
| `/opt/wavelog-gate` | Gate headless |
| `/opt/lextel` | Captura SPP |
| `/backup` | Arquivos `.tgz` do Admin → Backup |

Usuário de serviço: `hamcockpit`. Target systemd: `ham-cockpit.target`.

## Código neste repositório

| Árvore | Papel |
| --- | --- |
| `client/` | Console React (Vite, wouter, Tailwind) |
| `server/` | API Express / plugins Vite (rádio, ser2net, backup, updates) |
| `shared/` | IDs de serviço, ser2net, marca (`APP_VERSION`) |
| `deploy/` | systemd, install-station, helpers |
| `image/` | pi-gen / flash da imagem OS |
| `update/` | Canal público de versão |
| `instaladores/` | ISO de distribuição |

## Atualização do console

`server/updates.ts` lê `update/version.json` em `github.com/fviudes/ham-cockpit` (branch `main`). `deploy/station/station-upd apply app` baixa o artefato ou o snapshot de `main` e reinicia `ham-cockpit.service`.

## Backup

`server/backup.ts` empacota configs de estação, WaveLogGate e dump/volumes do Wavelog em `/backup`. Restore exige `{ confirm: true }`.
