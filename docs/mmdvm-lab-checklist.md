# Checklist MMDVM — bake, primeiro boot e Pi 3 + HS Dual

Aprendizados do lab (Pi 3 + MMDVM_HS_Dual HAT GPIO, `192.168.20.109`) capturados para que **imagem limpa / OTA** não exija as mesmas correções manuais. **Instalação limpa (bake → `install-station.sh` → `first-boot.sh`) não precisa re-fixar** Nextion/UART/ircDDB/PTY/LF/`HC_FD2_GUARD` — isso já está no módulo de instalação. Operação do dia a dia continua no console (`/console` → MMDVM); este doc é para bake, install e diagnóstico.

Wavelog / MariaDB: ver **`docs/lab-checklist.md`**. Lab 11/Nov: container MariaDB **11.8.9 healthy**; schema/user `wavelog` **ausentes**; app em `:8086/install/` — **não** inventar schema neste turno.

## Checklist — bake / install limpo

No chroot do bake (`image/appliance/chroot-setup.sh` → `deploy/station/install-station.sh`) ou em install vivo na Pi:

1. **Pacotes runtime** em `deploy/station/packages.list`: `libwxbase3.2-1t64` / `libwxgtk3.2-1t64`, `libmosquitto1`, `mosquitto`, `libdlt2` (e `-dev` só para compilar). Inclui `build-essential` (fornece `make`).
2. **`build-binaries.sh`** com `MMDVM_PURGE_BUILD=1` no bake: remove fontes/`-dev`, depois `ensure_ircddb_runtime` reinsere wx + mosquitto + libdlt2. Aplica `deploy/mmdvm/patches/nextiondriver-fd2-modem.patch` (fallback `sed` se hunks falharem por drift do upstream ON7LDS).
3. **UART GPIO** (`configure_mmdvm_uart` em `install-station.sh`):
   - `/boot/firmware/config.txt`: `enable_uart=1` + `dtoverlay=disable-bt` (Pi 3: PL011 livre em `/dev/ttyAMA0`)
   - `/boot/firmware/cmdline.txt`: sem `console=serial0` / `ttyS0` / `ttyAMA0`
   - `serial-getty@ttyS0` e `@ttyAMA0` desabilitados e **masked**
4. Units em `deploy/mmdvm/*.service` instaladas e habilitadas no `ham-cockpit.target`:
   - Helper `/opt/ham-cockpit/bin/mmdvm-ctl` **só LF** (`.gitattributes` `eol=lf` + `sed` no `install-station.sh`). CRLF no shebang → `sudo: unable to execute mmdvm-ctl`; o console cai no fallback `systemctl is-active` e o tile Nextion pode ficar “running” mesmo com o helper quebrado.
   - `nextiondriver` **unit real** (nunca stub “lab: disabled” / `ConditionPathExists=/nonexistent` / `ExecStart=/bin/true`)
   - Nextion: `Before=docker.service`, `LimitNOFILE=1024`, **sem** `Before=mmdvmhost` / `BindsTo`; `ExecStartPost` espera `/dev/ttyNextionDriver` e faz `chgrp dialout` + `chmod 660` (fallback **`chmod 666`**) no PTY
   - Ordem no boot: **Nextion sobe → PTY recebe perms → Host abre o display**. Host (`User=hamcockpit`): **não** `After=nextiondriver` (ciclo systemd); `ExecStartPre` espera o PTY **legível/gravável** — sem restart em loop do Host
   - `ircddbgateway`: **sem** `BindsTo`/`PartOf` no Host (ciclo Host↔Nextion↔gateways)
   - DMR/YSF podem ter `PartOf=mmdvmhost` (filhos do Host); ircDDB preferir unit limpa ou start manual (`systemd-run`) se o ciclo voltar
   - `mosquitto` habilitado no boot
5. Hosts D-Star (`DPlus` / `DExtra` / `DCS` / `CCS`) em `/usr/share/ircddbgateway/` (0644, legíveis por `hamcockpit`) — REF018 e demais REF* vêm daí.
6. Templates INI/conf em `/opt/ham-cockpit/mmdvm/` (só se ainda não existirem — não sobrescreve config do operador):
   - `ircddbgateway.conf` **e** o nome sem extensão `ircddbgateway` (symlink ou cópia): o daemon g4klx lê `<confdir>/ircddbgateway`, não só `.conf`
   - `localAddress=0.0.0.0`, `gatewayAddress=0.0.0.0`, `dplusEnabled=1` (DPlus **não** pode ficar só em `127.0.0.1:20001`)
7. **apt/dpkg saudável** antes de builds locais ou update Hamlib: `station-upd` chama `apt_prepare` (`dpkg --configure -a` + `apt-get -f install`). Rebuild manual do Nextion no lab precisa disso + `build-essential`/`make`, senão exit 127 e dpkg interrompido.

## Checklist — primeiro boot / operador

1. Console → MMDVM: callsign real + **Id DMR > 1000** (nunca `0` / `0000000` em produção). Lab estável: Id `7242679`.
2. Placa: preset **`mmdvmhsdualhatgpio`** (HS Dual GPIO) — **não** copiar cartão WPSD `dvmpis` / `ttyACM0`.
3. Esperado no modem: `Port`/`UARTPort=/dev/ttyAMA0`, `UARTSpeed=115200`, `Duplex=1`, `TXInvert=1`; FW típico lab `MMDVM_HS_Dual_Hat-v1.6.1`.
4. D-Star: letra do módulo no Host (`[D-Star] Module=B|C|…`). No **rádio**: `RPT1=call+módulo`, `RPT2=call+G` — **não** há campos `/C` ou `/G` na estação.
5. Nextion (HAT): `Display=Nextion`, `[Nextion] Port=/dev/ttyNextionDriver` + `ScreenLayout=4`, `[NextionDriver] Port=modem` + Enable=1 + `WaitForLan=0`, `[Transparent Data] Enable=1` + `SendFrameType=1` (caminho WPSD). Unit real + binário com patch `fd2 < 0` (ver tabela / Lacunas).
6. Confirmar: `systemctl is-active mosquitto mmdvmhost ircddbgateway nextiondriver` e **sem** ABRT/`FD_SETSIZE` no journal por >30s.
7. D-Star link: hosts REF* OK + `ss -ulnp | grep 20001` **não** só `127.0.0.1`; `/var/log/mmdvm/Links.log` deve listar o REF após connect (0 bytes = link ainda não comprovado).

## Pi 3 + MMDVM HS Dual (HAT)

| Item | Valor |
| --- | --- |
| UART físico | PL011 em `/dev/ttyAMA0` (Bluetooth off via `disable-bt`) |
| Console serial | Removido do cmdline + getty masked |
| Modem | Duplex, 115200, TXInvert=1 |
| Preset UI | `mmdvmhsdualhatgpio` |
| Evitar | Hardware WPSD `dvmpis` + `/dev/ttyACM0` (outro perfil USB) |

Reboot após alterar `config.txt` / `cmdline.txt`.

## Snapshot lab (referência — Nov/2026)

Pós-reboot 11/Nov/2026 ~19:03 (SSH 19:08, **sem** restart Dual/Host, **sem** dpkg). Tarde: Host 13:17 com PTY; OTA 0.1.05.01 ~18:56 apagou a unit Nextion.

| Serviço / item | Estado |
| --- | --- |
| `ham-cockpit` / VERSION | **0.1.05.01** (`/opt/ham-cockpit/VERSION`). Unit `ham-cockpit.service` **active** desde 19:03:32, PID node `994`, `NRestarts=0`, nginx active. `ham-cockpit.target` **inactive** (serviços filhos já enabled). |
| OTA Admin | `GET /api/updates`: app `current=available=0.1.05.01` **`updatable=false`** — Admin **não** oferece update do Ham Cockpit. `ok=false` só por `station-upd check` (apt). Outros ids (ser2net/hamlib/wavelog/wlg) updatable — **não** aplicar neste turno. |
| `mosquitto` | active, `NRestarts=0`, PID 946 |
| `mmdvmhost` | **active** 19:03:46, PID 1409, `NRestarts=0`. Dual `UART Port=/dev/ttyAMA0`, FW `MMDVM_HS_Dual_Hat-v1.6.1`, Callsign `PY2MED`, Id `7242679`, board `mmdvmhsdualhatgpio`. Display Nextion `Port=/dev/ttyNextionDriver` → **`Cannot open device`** (sem PTY). |
| `ircddbgateway` | **active** (unit oficial; `ircddbgateway-manual` inactive) |
| Hosts REF018 | presentes em `/usr/share/ircddbgateway` (e cópia home) |
| DPlus UDP | ainda `127.0.0.1:20001` com `localAddress=127.0.0.1` — corrigir bake/template |
| `Links.log` | 0 bytes — link REF018 **não** comprovado |
| NextionDriver | Restaurado 19:31: unit em `/etc/systemd/system` **enabled**, `MainPID=1024` `NRestarts=0`, PTY `660` `pts/0`, binário **com** `HC_FD2_GUARD`. Dual `ttyAMA0` intacto. `ota-hooks` no Pi **sem** `rm` da unit. Host: **não** usar `systemctl restart` (ciclo); se display fechado: `stop` + 2s + `start` uma vez (`ignore-dependencies`). |

### Receita WPSD (cartão que funcionava) vs Dual Hat no lab

Leitor Windows 19:26: **D:** e **E:** são o disco Allwinner (`sun8i-r16-x6100` / `zImage` / `rootfs.tar`), **não** o WPSD PY2MED (não há `mmdvmhost.ini` nessas FATs). Receita LCD = extração anterior PY2MED + ON7LDS: `Display=Nextion`, `[Nextion] Port=/dev/ttyNextionDriver` `ScreenLayout=4`, `[NextionDriver] Port=modem`. Dual Hat **não** copiar `dvmpis`/`ttyACM0`.

| Item | Cartão WPSD (LCD viva) | Lab Dual Hat (aplicar) | **Não** copiar |
| --- | --- | --- | --- |
| Hardware | `dvmpis` | `mmdvmhsdualhatgpio` | `ttyACM0` / Duplex=0 |
| Modem | `Port=/dev/ttyACM0` | `Port=/dev/ttyAMA0` + `UARTSpeed=115200` | USB simplex |
| Display | `Display=Nextion` | igual | — |
| `[Nextion] Port` | `/dev/ttyNextionDriver` | igual | — |
| `ScreenLayout` | **4** (ON7LDS L3 HS / DB) | **4** | lab chegou a ter `3` (ciclo 4 s) |
| `[NextionDriver]` | `Enable=1` `Port=modem` | igual (`WaitForLan=0` no Ubuntu 24) | `WaitForLan=1` (atrasa e ainda abortava no bin antigo) |
| Transparent Data | `Enable=1` `SendFrameType=1` | igual | — |
| Dados | `DataFilesPath=/usr/local/etc/` `groups.txt` `users.csv` | igual | — |
| Binário | `/usr/local/bin/NextionDriver` ON7LDS | **mesmo path**, v1.26 **com guard fd2** | bin stock Ubuntu 24 |
| Unit | Pi-Star: Host **root**; `RequiredBy=mmdvmhost` | Ham Cockpit: Host `hamcockpit`; `ExecStartPost` PTY `660` dialout; Host espera PTY; **sem** `RequiredBy` | stub `lab: disabled` |

Ciclo ~4 s no lab: **ABRT `FD_SETSIZE`** (~4 s de CPU ao ler `users.csv` + `checkSerial` com `fd2=-1`) + `Restart=on-failure`. Não era Host em loop. Mitigação: binário patched (obrigatório); `WaitForLan=0`; `Before=docker`. Sem `Restart=always`.

## Tabela problema → correção → onde no repo

| Problema | Correção | Onde no repo |
| --- | --- | --- |
| Modem sem UART / getty na serial | `enable_uart=1`, `dtoverlay=disable-bt`; tirar `console=serial*`; mask getty | `deploy/station/install-station.sh` (`configure_mmdvm_uart`); bake monta `/boot/firmware` |
| HS Dual tratado como simplex USB | Preset Dual GPIO: Duplex=1, ttyAMA0, 115200, TXInvert=1 | `server/mmdvm.ts` (`MMDVM_BOARD_PRESETS`); `deploy/mmdvm/mmdvmhost.ini` |
| `ircddbgatewayd` sem wx após purge `-dev` | Runtime `libwxbase3.2*` / `libwxgtk3.2*` no apt + pós-PURGE | `deploy/station/packages.list`; `deploy/mmdvm/build-binaries.sh` (`ensure_ircddb_runtime`); OTA `ota-hooks.sh` |
| MQTT Connection refused / mosquitto exit 127 | Pacotes `mosquitto` + `libdlt2`; unit habilitada | `packages.list`; `install-station.sh`; `image/appliance/user-data`; `ota-hooks.sh` |
| Flags quebradas `-n -c` no gateway | `-foreground -nolog -confdir:` | `deploy/mmdvm/ircddbgateway.service` |
| Ciclo systemd Host↔Nextion↔gateways | Sem `BindsTo`/`Before=mmdvmhost`/`PartOf` no ircDDB; `After=` + `WantedBy=ham-cockpit.target`; se ciclo persistir: gateway manual (`systemd-run --unit=ircddbgateway-manual`) | `ircddbgateway.service`, `nextiondriver.service`, `mmdvmhost.service` |
| Host no boot: `Cannot open device - /dev/ttyNextionDriver` | Ordem **Nextion → perms PTY (`ExecStartPost` 660/666) → Host**. Host **não** retenta o display e **não** usa `After=nextiondriver` (ciclo). Bake: `ExecStartPre` wait no PTY (evitar `Requires`/`BindsTo`). Restart **único** do Host depois que o driver está up reabre o LCD — nunca loop. Se `Transaction order is cyclic` (PartOf DMR/YSF): `systemctl restart --job-mode=ignore-dependencies mmdvmhost.service` | `mmdvmhost.service`; `ota-hooks.sh`; este checklist |
| REF* não resolve (ex.: REF018) | Instalar `*_Hosts.txt` em `/usr/share/ircddbgateway` (0644) | `build-binaries.sh`; tarball `mmdvm-arm64.tgz` (`etc/`); `ota-hooks.sh` |
| Id=0 / inválido no Host | Exigir Id numérico **> 1000** ao salvar | `server/mmdvm.ts` (`mmdvmSave`); placeholder no INI de fábrica |
| Módulo D-Star errado | `[D-Star] Module` + UI módulo RPT1 | `mmdvmhost.ini`; `server/mmdvm.ts`; UI `client/src/console/mmdvm.tsx` |
| Rádio com /C /G “da estação” | Só programação do rádio: RPT1=call+mod, RPT2=call+G | i18n `mmdvmDstarRadio` / hint; este checklist |
| Nextion sem dados do stack | Transparent Data on; Host→`ttyNextionDriver`; Driver `Port=modem`; ambos no `ham-cockpit.target` | `mmdvmhost.ini`; `nextiondriver.service`; `server/mmdvm.ts` `applyConfig` |
| Host `Cannot open /dev/ttyNextionDriver` com driver ativo | PTY `openpty()` = `0620 root:tty` (grupo `tty` só escreve). WPSD: Host root. Lab: `chgrp dialout`+`chmod 660` (fallback **`chmod 666`**) no `ExecStartPost`; Host espera PTY rw no `ExecStartPre`. Ordem: Nextion → perms PTY → Host. Sem `After=nextiondriver` (ciclo). Sem loop de restart no Host. | `nextiondriver.service`; `mmdvmhost.service` |
| `sudo: unable to execute …/mmdvm-ctl` | Shebang com **CRLF** (`/bin/bash\r`). Kernel recusa o helper; console usa fallback `systemctl is-active`. Correção: arquivo só **LF**; `.gitattributes` `**/mmdvm-ctl text eol=lf`; `sed -i 's/\r$//'` no install e no Pi vivo. Validar: `sudo -n /opt/ham-cockpit/bin/mmdvm-ctl is-active nextiondriver` | `deploy/mmdvm/mmdvm-ctl`; `.gitattributes`; `install-station.sh` |
| OTA sem binários MMDVM | `mmdvm-arm64.tgz` no pacote / `update/` (+ hosts); fallback build em segundo plano | `ota-hooks.sh`; `ham-cockpit-mmdvm-build.service`; workflows bake + MMDVM ARM64 |
| NextionDriver ABRT (`FD_SETSIZE`) | **Causa real (lab Ubuntu 24):** com `Port=modem`, `fd2=-1` e `checkSerial()` faz `FD_SET(-1)` → glibc fortify aborta (`bit out of range 0 - FD_SETSIZE`). O log lista eth0/docker0/br-*/veth* logo antes, mas `prlimit`/`LimitNOFILE=1024` **sozinho não evita** o ABRT. Mitigações: patch + `Before=docker` + `WaitForLan=0` (+ LimitNOFILE). | `deploy/mmdvm/patches/nextiondriver-fd2-modem.patch`; `build-binaries.sh` (patch\|\|sed); `nextiondriver.service`; INI `WaitForLan=0` |
| Unit Nextion stub “lab: disabled” | **Nunca** deixar stub no bake/OTA. Restaurar unit real; `systemctl unmask`; apagar symlink `/dev/null` / `ConditionPathExists=/nonexistent`. **Detectar stub só em diretivas ativas** (grep sem linhas `#`) | `deploy/mmdvm/nextiondriver.service`; OTA `ota-hooks.sh` (`nextion_unit_is_stub`); no Pi: `/etc/systemd/system/nextiondriver.service` |
| OTA 0.1.05.01 apaga `nextiondriver.service` | Comentário da unit real citava “lab: disabled” / `/nonexistent` / `ExecStart=/bin/true`. `ota-hooks` recusava o arquivo do pacote **e** apagava a unit viva. LCD morta, `FragmentPath=` vazio, sem PTY. Correção: grep só em linhas não-comentário + comentário da unit sem esses literais | `ota-hooks.sh`; `nextiondriver.service`; **precisa OTA ≥ 0.1.05.02** para não repetir |
| OTA zera indicativo/ID no Nextion (3× lab) | 0.1.05.02 **não** copiou template no INI (`PY2MED`/`7242679` intactos). `stop` Host no hook derruba `PartOf` (DMR failed, ciclo systemd) e a tela apaga call/ID. Merge só LCD se faltar; backup `.ota-bak`; Host já up = não parar; `enable --now` dos filhos se inativos | `ota-hooks.sh`; `station-upd apply app`; `install-station.sh` (template só se ausente) |
| OTA não troca NextionDriver já presente | `mmdvm_missing` retornava 0 se o bin existia — stock/sed-sem-marca ficava. Lab 0.1.05.01: `/usr/local/bin/NextionDriver` **sem** `HC_FD2_GUARD` (145736 B, 13:12) enquanto `mmdvm-arm64.tgz` **tinha** a marca. Agora atualiza **só** o NextionDriver se faltar `HC_FD2_GUARD` (não troca MMDVMHost/Dual) | `ota-hooks.sh` `nextion_needs_patch` |
| Rebuild Nextion no Pi: `make: command not found` / dpkg interrompido | `dpkg --configure -a` (+ `apt-get -f install`); `apt-get install -y build-essential`; só então `make`. Patch hunks podem falhar → usar `sed` guards (`fd2 < 0`, `display_RXsock < 0`) | `station-upd` `apt_prepare`; `packages.list` (`build-essential`); `build-binaries.sh` |
| Hamlib / apt preso (dpkg a meio) | Sempre `apt_prepare` antes de `apply hamlib` / OS / pacotes | `deploy/station/station-upd` (`apt_prepare`) |
| DPlus só em localhost (`127.0.0.1:20001`) | Template + `applyConfig`: `localAddress=0.0.0.0`, `gatewayAddress=0.0.0.0`, `dplusEnabled=1`. Host↔gateway continua em `[D-Star Network] GatewayAddress=127.0.0.1` + `hbAddress`/`hbPort`. Validar `Links.log` após start. | `deploy/mmdvm/ircddbgateway.conf`; `server/mmdvm.ts` |
| ircddbgatewayd ignora `ircddbgateway.conf` | Instalar **ambos** ou symlink `ircddbgateway` → `.conf` no confdir (`/opt/ham-cockpit/mmdvm` ou `/etc`) | `install-station.sh`; `ota-hooks.sh`; `server/mmdvm.ts` (`dstarIniPath` / `writeDstarConf`) |

## OTA

- Pacote / canal: `mmdvm-arm64.tgz` (bins + `etc/` com groups/users/hosts). `station-upd apply app` **não** extrai INI vivo; só `index.js`/`public`/`bin`/`systemd`/hooks.
- `deploy/station/ota-hooks.sh`: instala bins se faltarem **ou** se `NextionDriver` não tiver `HC_FD2_GUARD`; copia hosts para `/usr/share/ircddbgateway`; tenta garantir wx/mosquitto/libdlt2 se `apt-get` existir; habilita `mosquitto` + units MMDVM; reinstala units de `$ROOT/systemd` (unit **real** do Nextion). Stub só se diretivas ativas baterem (`nextion_unit_is_stub`); **não** apagar unit por texto em comentário.
- Sem tarball: `ham-cockpit-mmdvm-build.service` (oneshot em segundo plano) — exige `build-essential` + dpkg íntegro.
- **INI do operador — nunca apagar no upgrade:**
  - Template `deploy/mmdvm/*.ini` só se o arquivo vivo **não existir** (`install-station.sh`). OTA **não** faz `cp` do template em `/opt/ham-cockpit/mmdvm/mmdvmhost.ini`.
  - Antes de qualquer escrita: backup `mmdvmhost.ini.ota-bak` (`station-upd apply app` + merge no hook).
  - Merge conservador: só chaves de display/LCD/PTY **se faltarem** (`Display=None` / `ScreenLayout` vazio). **Nunca** resetar `[General] Callsign`, `Id`, `[DMR] Id`, frequências, senhas, redes, `[Modem]` se já houver valor de operador.
  - Dual Hat = `/dev/ttyAMA0` + `dtoverlay=disable-bt`. **Não** `ttyACM0`. **Não** `systemctl restart mmdvmhost` (ciclo PartOf). Host já ativo: não parar. Host inativo: `start` **uma** vez (`ignore-dependencies`). Depois `start` dos gateways se inativos (filhos `PartOf` não voltam sozinhos).
- Lab **0.1.05.02 (11/Nov ~20:45):** OTA **não** sobrescreveu o INI (`Callsign=PY2MED` `Id=7242679` mtime 19:09). `stop`+`start` do Host no hook (reabrir PTY) derrubou `dmrgateway` (`PartOf=mmdvmhost`) e o Nextion ficou sem indicativo/ID — terceira vez que o operador viu a config “apagada”. Correção: não parar Host se já estiver up; reabrir Host só se o Nextion **foi iniciado neste OTA**; subir DMR/YSF/ircDDB se inativos. `Restart=on-failure` do DMR após crash também falha com *Transaction order is cyclic* — start com `--job-mode=ignore-dependencies`.
- DPlus `localAddress=127.0.0.1` ainda precisa salvar de novo no console.

## Diagnóstico rápido (lab)

```bash
systemctl is-active mosquitto mmdvmhost ircddbgateway nextiondriver
journalctl -u nextiondriver --since '2 min ago' --no-pager | grep -E 'FD_SETSIZE|ABRT|Starting with'
ss -ulnp | grep -E '20001|20010|20011|1883'
grep -E '^(localAddress|gatewayAddress|gatewayCallsign|dplusLogin|reflector1)=' /opt/ham-cockpit/mmdvm/ircddbgateway.conf
wc -c /var/log/mmdvm/Links.log; cat /var/log/mmdvm/Links.log
grep '^REF018' /usr/share/ircddbgateway/DPlus_Hosts.txt
# Unit Nextion existe e não é stub (comentários da unit real não contam):
test -f /etc/systemd/system/nextiondriver.service && echo UNIT_OK
! grep -vE '^[[:space:]]*(#|$)' /etc/systemd/system/nextiondriver.service | grep -qE 'lab: disabled|ConditionPathExists=/nonexistent|^ExecStart=/bin/true'
# Helper LF (CRLF quebra sudo):
file /opt/ham-cockpit/bin/mmdvm-ctl
! grep -q $'\r' /opt/ham-cockpit/bin/mmdvm-ctl && echo MMDVM_CTL_LF
sudo -n /opt/ham-cockpit/bin/mmdvm-ctl is-active nextiondriver
ls -l /dev/ttyNextionDriver /dev/pts/0
sudo -u hamcockpit test -r /dev/ttyNextionDriver && sudo -u hamcockpit test -w /dev/ttyNextionDriver && echo PTY_OK
journalctl -u mmdvmhost --since '2 min ago' --no-pager | grep -iE 'Cannot open|Type: Nextion|Port: /dev/ttyNextion|MMDVM_HS_Dual'
strings /usr/local/bin/NextionDriver | grep HC_FD2_GUARD && echo NEXTION_PATCHED
```

## O que o install já faz (não repetir no próximo Pi)

| Item do lab | Onde entra na instalação limpa |
| --- | --- |
| Unit Nextion real + enable | `install-station.sh` → `/etc/systemd/system` **e** `/opt/ham-cockpit/systemd`; `ham-cockpit.target` `Wants=`; bake aborta se faltar |
| Stub só em diretivas ativas | `nextion_unit_is_stub` / grep com `grep -vE` comentários; unit **sem** palavras-gatilho no comentário |
| `HC_FD2_GUARD` | `build-binaries.sh`; install reinstala do `mmdvm-arm64.tgz` se o bin existir sem a marca; bake aborta sem a marca |
| PTY 660 dialout + Host espera PTY | `nextiondriver.service` `ExecStartPost`; `mmdvmhost.service` `ExecStartPre` — **sem** `systemctl restart mmdvmhost` |
| Dual `ttyAMA0` + `disable-bt` | `configure_mmdvm_uart` no install **e** no first-boot; INI de fábrica `Port=/dev/ttyAMA0` (nunca `ttyACM0`/`dvmpis` neste preset) |
| Display Nextion layout 4 / `Port=modem` / `WaitForLan=0` / `SendFrameType=1` | `deploy/mmdvm/mmdvmhost.ini` (install limpo); OTA `merge_nextion_ini` **só se a chave faltar** + backup `.ota-bak` |
| ircDDB sem `.conf` + `localAddress=0.0.0.0` | symlink `ircddbgateway`; template + `applyConfig` + `sed` no OTA se ainda for `127.0.0.1` |
| `mmdvm-ctl` LF | `.gitattributes` + `sed` no install, first-boot e ota-hooks |
| Units MMDVM no target sem `RequiredBy` | `WantedBy=ham-cockpit.target`; ircDDB sem `PartOf`; DMR/YSF `PartOf` filho do Host |
| mosquitto / nginx / ser2net / Hamlib / `apt_prepare` | `packages.list`; `enable_units`; `station-upd apt_prepare` |
| Console (branding, Status, MMDVM Painel, Admin OTA) | `install-station` copia `dist/` → `/opt/ham-cockpit` |

Ainda só no **lab / operador** (não vai para a imagem de fábrica): callsign `PY2MED`, Id `7242679`, link REF018 comprovado em `Links.log`, volume Docker já inicializado.

## Lacunas conhecidas

- **NextionDriver ABRT (`bit out of range 0 - FD_SETSIZE`)** — causa confirmada: `Port=modem` → `fd2=-1` → `FD_SET(fd2)` em `checkSerial()` (ON7LDS) no Ubuntu 24 + glibc fortify. Bridges Docker no log são coincidência temporal; `LimitNOFILE=1024` sozinho **ainda abortava**. Correção obrigatória: binário com `if (fd2 < 0) return;` (+ guard `display_RXsock`). Mitigações extras: `Before=docker.service`, `WaitForLan=0`, `LimitNOFILE=1024`. **Não** mascarar / stubar o serviço se a tela deve funcionar. **Lab 11/Nov:** gcc/make disponíveis; hunks do `.patch` falharam; `sed` + `make` instalou binário patched; serviço **>30 s** sem ABRT.
- **OTA 0.1.05.01 (lab 11/Nov 19h):** após o OTA a unit Nextion **desapareceu** (`UNIT_MISSING`, `FragmentPath=` vazio) e o binário vivo **não** tinha `HC_FD2_GUARD` — o tarball em `/opt/ham-cockpit/mmdvm-arm64.tgz` tinha. Causa no repo: grep de stub em comentário + `mmdvm_missing` não atualiza bin existente. Pacote 0.1.05.01 **ainda** contém esse `ota-hooks`; bake/OTA limpo precisa do hooks corrigido (0.1.05.02+). Reaplicar 0.1.05.01 pode apagar de novo a unit se o comentário antigo estiver no arquivo.
- **Bake limpo ainda depende** de publicar `mmdvm-arm64.tgz` / imagem com Nextion **já patched** (`build-binaries.sh` usa patch\|\|sed). Sem o tarball patched, Ubuntu 24 aborta no bin stock.
- **Link D-Star REF018** — hosts e MQTT OK; com `localAddress=127.0.0.1` o DPlus fica em loopback; mesmo após bind `0.0.0.0`, `Links.log` precisa confirmar o link (ainda não comprovado no lab).
- **Ordem `Before=mmdvmhost` / `BindsTo` / `PartOf` no ircDDB**: geraram *Transaction order is cyclic* — bake usa Nextion `Before=docker` apenas + ircDDB sem PartOf/BindsTo. **Ainda assim** o Host precisa esperar o PTY: **não** `After=nextiondriver` no Host. Ordem Nextion→Host: `ExecStartPost` (perms 660/666 no PTY) + `ExecStartPre` de espera no Host. Dual/Nextion estáveis: **não** reiniciar Host em loop.
- **`mmdvm-ctl` CRLF**: `sudo` falha com `unable to execute`; tile Nextion no console pode parecer OK via `systemctl is-active`. Corrigir LF no repo e no arquivo vivo `/opt/ham-cockpit/bin/mmdvm-ctl`.
- Id de fábrica `0000000` no template: válido só até o operador salvar um Id real (>1000); o console rejeita salvar Id ≤1000.
- Cartões WPSD USB (`dvmpis` / `ttyACM0`) não são o preset Dual HAT — usar preset **custom** + porta correta se for esse hardware.

Ver também: [imagem-os.md](imagem-os.md) (bake ARM64), [arquitetura.md](arquitetura.md) (mapa de serviços) e [lab-checklist.md](lab-checklist.md) (Wavelog/MariaDB).
