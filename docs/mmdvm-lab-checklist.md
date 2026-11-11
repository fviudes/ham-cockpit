# Checklist MMDVM — bake, primeiro boot e Pi 3 + HS Dual

Aprendizados do lab (Pi 3 + MMDVM_HS_Dual HAT GPIO, `192.168.20.109`) capturados para que **imagem limpa / OTA** não exija as mesmas correções manuais. Operação do dia a dia continua no console (`/console` → MMDVM); este doc é para bake, install e diagnóstico.

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

Estado após o Nextion patched no lab (11/Nov/2026):

| Serviço / item | Estado |
| --- | --- |
| `mosquitto` | active; MQTT connect OK |
| `mmdvmhost` | active após **um** `systemctl restart mmdvmhost` (13:17); Dual Hat `ttyAMA0`; FW `MMDVM_HS_Dual_Hat-v1.6.1`; Id `7242679`; Display `Port=/dev/ttyNextionDriver` **sem** `Cannot open` (PTY já existia). Boot 13:09 ainda tinha o erro — Host não reabre o PTY |
| `ircddbgateway` unit | inactive se ciclo/PartOf; lab usou `ircddbgateway-manual` via `systemd-run` (PartOf por ciclo) |
| Hosts REF018 | presentes em `/usr/share/ircddbgateway` (e cópia home) |
| DPlus UDP | ainda `127.0.0.1:20001` com `localAddress=127.0.0.1` — corrigir bake/template |
| `Links.log` | 0 bytes — link REF018 **não** comprovado |
| NextionDriver | **v1.26 ON7LDS** patched; `MainPID=2503` `NRestarts=0` (sem restart do driver). PTY `/dev/pts/0` **`660 root:dialout`**. Host (13:20, 1 restart) Dual Hat + Nextion em `/dev/ttyNextionDriver` **sem** *Cannot open device*. Console: tile `nextionRunning` ← `sudo -n mmdvm-ctl is-active nextiondriver` (`server/mmdvm.ts`); se o helper tiver CRLF, `sudo` falha e o fallback `systemctl is-active` mascara o problema. |

### Receita WPSD (cartão que funcionava) vs Dual Hat no lab

O cartão WPSD PY2MED (análise anterior: boot FAT32 + rootfs ext4 label `WPSD`) **não** estava montado neste turno — o leitor tinha um disco Allwinner (`sun8i-r16-x6100` / `rootfs.tar`), sem Nextion. Receita abaixo veio da extração anterior + unit Pi-Star/ON7LDS.

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
| Host no boot: `Cannot open device - /dev/ttyNextionDriver` | Ordem **Nextion → perms PTY (`ExecStartPost` 660/666) → Host**. Host **não** retenta o display e **não** usa `After=nextiondriver` (ciclo). Bake: `ExecStartPre` wait no PTY (evitar `Requires`/`BindsTo`). Restart **único** do Host depois que o driver está up reabre o LCD — nunca loop | `mmdvmhost.service`; `nextiondriver.service`; este checklist |
| REF* não resolve (ex.: REF018) | Instalar `*_Hosts.txt` em `/usr/share/ircddbgateway` (0644) | `build-binaries.sh`; tarball `mmdvm-arm64.tgz` (`etc/`); `ota-hooks.sh` |
| Id=0 / inválido no Host | Exigir Id numérico **> 1000** ao salvar | `server/mmdvm.ts` (`mmdvmSave`); placeholder no INI de fábrica |
| Módulo D-Star errado | `[D-Star] Module` + UI módulo RPT1 | `mmdvmhost.ini`; `server/mmdvm.ts`; UI `client/src/console/mmdvm.tsx` |
| Rádio com /C /G “da estação” | Só programação do rádio: RPT1=call+mod, RPT2=call+G | i18n `mmdvmDstarRadio` / hint; este checklist |
| Nextion sem dados do stack | Transparent Data on; Host→`ttyNextionDriver`; Driver `Port=modem`; ambos no `ham-cockpit.target` | `mmdvmhost.ini`; `nextiondriver.service`; `server/mmdvm.ts` `applyConfig` |
| Host `Cannot open /dev/ttyNextionDriver` com driver ativo | PTY `openpty()` = `0620 root:tty` (grupo `tty` só escreve). WPSD: Host root. Lab: `chgrp dialout`+`chmod 660` (fallback **`chmod 666`**) no `ExecStartPost`; Host espera PTY rw no `ExecStartPre`. Ordem: Nextion → perms PTY → Host. Sem `After=nextiondriver` (ciclo). Sem loop de restart no Host. | `nextiondriver.service`; `mmdvmhost.service` |
| `sudo: unable to execute …/mmdvm-ctl` | Shebang com **CRLF** (`/bin/bash\r`). Kernel recusa o helper; console usa fallback `systemctl is-active`. Correção: arquivo só **LF**; `.gitattributes` `**/mmdvm-ctl text eol=lf`; `sed -i 's/\r$//'` no install e no Pi vivo. Validar: `sudo -n /opt/ham-cockpit/bin/mmdvm-ctl is-active nextiondriver` | `deploy/mmdvm/mmdvm-ctl`; `.gitattributes`; `install-station.sh` |
| OTA sem binários MMDVM | `mmdvm-arm64.tgz` no pacote / `update/` (+ hosts); fallback build em segundo plano | `ota-hooks.sh`; `ham-cockpit-mmdvm-build.service`; workflows bake + MMDVM ARM64 |
| NextionDriver ABRT (`FD_SETSIZE`) | **Causa real (lab Ubuntu 24):** com `Port=modem`, `fd2=-1` e `checkSerial()` faz `FD_SET(-1)` → glibc fortify aborta (`bit out of range 0 - FD_SETSIZE`). O log lista eth0/docker0/br-*/veth* logo antes, mas `prlimit`/`LimitNOFILE=1024` **sozinho não evita** o ABRT. Mitigações: patch + `Before=docker` + `WaitForLan=0` (+ LimitNOFILE). | `deploy/mmdvm/patches/nextiondriver-fd2-modem.patch`; `build-binaries.sh` (patch\|\|sed); `nextiondriver.service`; INI `WaitForLan=0` |
| Unit Nextion stub “lab: disabled” | **Nunca** deixar stub no bake/OTA. Restaurar unit real; `systemctl unmask`; apagar symlink `/dev/null` / `ConditionPathExists=/nonexistent` | `deploy/mmdvm/nextiondriver.service`; OTA `ota-hooks.sh` (instala units de `systemd/`); no Pi: `/etc/systemd/system/nextiondriver.service` |
| Rebuild Nextion no Pi: `make: command not found` / dpkg interrompido | `dpkg --configure -a` (+ `apt-get -f install`); `apt-get install -y build-essential`; só então `make`. Patch hunks podem falhar → usar `sed` guards (`fd2 < 0`, `display_RXsock < 0`) | `station-upd` `apt_prepare`; `packages.list` (`build-essential`); `build-binaries.sh` |
| Hamlib / apt preso (dpkg a meio) | Sempre `apt_prepare` antes de `apply hamlib` / OS / pacotes | `deploy/station/station-upd` (`apt_prepare`) |
| DPlus só em localhost (`127.0.0.1:20001`) | Template + `applyConfig`: `localAddress=0.0.0.0`, `gatewayAddress=0.0.0.0`, `dplusEnabled=1`. Host↔gateway continua em `[D-Star Network] GatewayAddress=127.0.0.1` + `hbAddress`/`hbPort`. Validar `Links.log` após start. | `deploy/mmdvm/ircddbgateway.conf`; `server/mmdvm.ts` |
| ircddbgatewayd ignora `ircddbgateway.conf` | Instalar **ambos** ou symlink `ircddbgateway` → `.conf` no confdir (`/opt/ham-cockpit/mmdvm` ou `/etc`) | `install-station.sh`; `ota-hooks.sh`; `server/mmdvm.ts` (`dstarIniPath` / `writeDstarConf`) |

## OTA

- Pacote / canal: `mmdvm-arm64.tgz` (bins + `etc/` com groups/users/hosts).
- `deploy/station/ota-hooks.sh`: instala bins se faltarem; copia hosts para `/usr/share/ircddbgateway`; tenta garantir wx/mosquitto/libdlt2 se `apt-get` existir; habilita `mosquitto` + units MMDVM; reinstala units de `$ROOT/systemd` (deve ser a unit **real** do Nextion, nunca stub).
- Sem tarball: `ham-cockpit-mmdvm-build.service` (oneshot em segundo plano) — exige `build-essential` + dpkg íntegro.
- OTA **não** sobrescreve INI/conf do operador (estações antigas com `localAddress=127.0.0.1` precisam salvar de novo no console ou editar o conf).

## Diagnóstico rápido (lab)

```bash
systemctl is-active mosquitto mmdvmhost ircddbgateway nextiondriver
journalctl -u nextiondriver --since '2 min ago' --no-pager | grep -E 'FD_SETSIZE|ABRT|Starting with'
ss -ulnp | grep -E '20001|20010|20011|1883'
grep -E '^(localAddress|gatewayAddress|gatewayCallsign|dplusLogin|reflector1)=' /opt/ham-cockpit/mmdvm/ircddbgateway.conf
wc -c /var/log/mmdvm/Links.log; cat /var/log/mmdvm/Links.log
grep '^REF018' /usr/share/ircddbgateway/DPlus_Hosts.txt
# Unit Nextion não pode ser stub:
! grep -qE 'lab: disabled|/nonexistent|ExecStart=/bin/true' /etc/systemd/system/nextiondriver.service
# Helper LF (CRLF quebra sudo):
file /opt/ham-cockpit/bin/mmdvm-ctl
! grep -q $'\r' /opt/ham-cockpit/bin/mmdvm-ctl && echo MMDVM_CTL_LF
sudo -n /opt/ham-cockpit/bin/mmdvm-ctl is-active nextiondriver
ls -l /dev/ttyNextionDriver /dev/pts/0
sudo -u hamcockpit test -r /dev/ttyNextionDriver && sudo -u hamcockpit test -w /dev/ttyNextionDriver && echo PTY_OK
journalctl -u mmdvmhost --since '2 min ago' --no-pager | grep -iE 'Cannot open|Type: Nextion|Port: /dev/ttyNextion|MMDVM_HS_Dual'
strings /usr/local/bin/NextionDriver | grep -q 'Port=modem' || true  # bin patched tem guard no .c no bake
```

## Lacunas conhecidas

- **NextionDriver ABRT (`bit out of range 0 - FD_SETSIZE`)** — causa confirmada: `Port=modem` → `fd2=-1` → `FD_SET(fd2)` em `checkSerial()` (ON7LDS) no Ubuntu 24 + glibc fortify. Bridges Docker no log são coincidência temporal; `LimitNOFILE=1024` sozinho **ainda abortava**. Correção obrigatória: binário com `if (fd2 < 0) return;` (+ guard `display_RXsock`). Mitigações extras: `Before=docker.service`, `WaitForLan=0`, `LimitNOFILE=1024`. **Não** mascarar / stubar o serviço se a tela deve funcionar. **Lab 11/Nov:** gcc/make disponíveis; hunks do `.patch` falharam; `sed` + `make` instalou binário patched; serviço **>30 s** sem ABRT.
- **Bake limpo ainda depende** de publicar `mmdvm-arm64.tgz` / imagem com Nextion **já patched** (`build-binaries.sh` usa patch\|\|sed). Sem o tarball patched, Ubuntu 24 aborta no bin stock.
- **Link D-Star REF018** — hosts e MQTT OK; com `localAddress=127.0.0.1` o DPlus fica em loopback; mesmo após bind `0.0.0.0`, `Links.log` precisa confirmar o link (ainda não comprovado no lab).
- **Ordem `Before=mmdvmhost` / `BindsTo` / `PartOf` no ircDDB**: geraram *Transaction order is cyclic* — bake usa Nextion `Before=docker` apenas + ircDDB sem PartOf/BindsTo. **Ainda assim** o Host precisa esperar o PTY: **não** `After=nextiondriver` no Host. Ordem Nextion→Host: `ExecStartPost` (perms 660/666 no PTY) + `ExecStartPre` de espera no Host. Dual/Nextion estáveis: **não** reiniciar Host em loop.
- **`mmdvm-ctl` CRLF**: `sudo` falha com `unable to execute`; tile Nextion no console pode parecer OK via `systemctl is-active`. Corrigir LF no repo e no arquivo vivo `/opt/ham-cockpit/bin/mmdvm-ctl`.
- Id de fábrica `0000000` no template: válido só até o operador salvar um Id real (>1000); o console rejeita salvar Id ≤1000.
- Cartões WPSD USB (`dvmpis` / `ttyACM0`) não são o preset Dual HAT — usar preset **custom** + porta correta se for esse hardware.

Ver também: [imagem-os.md](imagem-os.md) (bake ARM64) e [arquitetura.md](arquitetura.md) (mapa de serviços).
