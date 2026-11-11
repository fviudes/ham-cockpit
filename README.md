# Ham Cockpit v0.1.05

Appliance da estação de rádio amador: um Raspberry Pi com console no navegador. Fala com o rádio (Bluetooth ou CAT/USB via ser2net), wattímetro Lextel, amplificadores, chave de antenas, acoplador LDG e o logbook Wavelog.

Este repositório **não é código aberto**. O que está publicado para quem opera a estação:

| Pasta | Conteúdo |
| --- | --- |
| [Esta página](#instalação) | Instalação, configuração e operação |
| [`update/`](update/) | Canal de atualização (versão atual × versão nova no console) |
| [`instaladores/`](instaladores/) | Imagem Ubuntu Server 24.04 LTS para gravar no cartão / SSD |

---

## O que sobe no Pi

A imagem já é o **Ubuntu Server 24.04 LTS ARM64** com tudo instalado e habilitado no boot:

- Console HTTP na porta **80** (`http://IP/console`)
- Docker + Wavelog (logbook) na **8086**
- WaveLogGate UDP **2333** → cadastra QSO no Wavelog
- ser2net + Hamlib (`127.0.0.1:4532`)
- Access Point `Ham-Cockpit-XXXX` em **192.168.4.1** (2,4 GHz; sobe mesmo com cabo Ethernet)
- SSH na porta **22** (usuários `hamcockpit` e `admin`)
- HDMI: VFO em tela cheia; `CTRL+X` volta ao console; 10 min parado no CLI reabre o VFO

Não grave o Ubuntu vanilla e não rode `install-station.sh` nesta imagem — o sistema e os pacotes já vêm prontos no bake.

---

## Instalação

### Material

- Raspberry Pi 3, 4 ou 5 (fonte oficial; no Pi 5 use a fonte de 27 W / 5 A)
- Cartão microSD (16 GB ou mais) **ou** SSD USB
- PC Windows ou Linux
- [Raspberry Pi Imager](https://www.raspberrypi.com/software/)

### 1. Baixe a imagem

Arquivo: **`ham-cockpit-0.1.05-raspi.img.xz`** (Ubuntu Server 24.04 LTS + Ham Cockpit).

Na [Release v0.1.05](https://github.com/fviudes/ham-cockpit/releases/tag/v0.1.05) ou:

```bash
gh release download --repo fviudes/ham-cockpit --pattern "ham-cockpit-*-raspi.img.xz" --dir instaladores
```

Scripts de gravação: [`instaladores/flash.ps1`](instaladores/flash.ps1) (Windows) e [`instaladores/flash.sh`](instaladores/flash.sh) (Linux).

### 2. Grave no cartão ou SSD

Abra o Raspberry Pi Imager → **Use custom** → escolha `ham-cockpit-0.1.05-raspi.img.xz` → selecione o microSD ou o SSD USB → grave.

Windows (PowerShell **como Administrador**), com o Imager instalado:

```powershell
cd instaladores
.\flash.ps1 -DiskNumber N
```

Linux:

```bash
sudo bash instaladores/flash.sh /dev/sdX
```

No primeiro boot o Ubuntu expande o disco (pode levar alguns minutos) e sobe o console.

- **AP Wi‑Fi:** `Ham-Cockpit-XXXX` em 2,4 GHz (senha `hamcockpit`) → http://192.168.4.1/console — sobe **com ou sem** cabo Ethernet. Celulares em “só 5 GHz” não veem.
- O AP usa `nmcli device wifi hotspot` (no Ubuntu 24.04 o perfil AP “manual” às vezes ativa sem propagar o SSID). Se o NM falhar, cai para `hostapd`.
- **Com cabo Ethernet:** também na LAN → http://ham-cockpit.local/console ou o IP no roteador.
- No primeiro boot aguarde 2–5 min (expansão do disco + firmware do Wi‑Fi) antes de procurar o SSID.

### 3. Primeiro acesso

1. No celular ou notebook (Wi‑Fi **2,4 GHz**), entre em **Ham-Cockpit-XXXX** (os quatro caracteres mudam por aparelho). Senha: **hamcockpit**. Celulares em “só 5 GHz” não veem o AP.
2. Abra **http://192.168.4.1/console**. Com cabo na LAN: **http://ham-cockpit.local/console** ou o IP no roteador.
3. Login: **admin** / **1234**. Troque a senha em Admin.

Se nada responder: aguarde 3–5 min no primeiro boot, confira HDMI (login no console) e SSH `hamcockpit` / `1234`.

Logbook: **http://IP:8086/install** — no instalador do Wavelog o host do banco é `wavelog-db`.

SSH: `hamcockpit` / `1234` ou `admin` / `1234`, porta 22. Root por senha está desligado.

---

## Configuração

Ordem sugerida na primeira vez (menu à esquerda do console):

1. **Config Device Wizard** — serial → IP:porta ser2net, escolhe o dispositivo, liga o autostart.
2. **Rádio** — Icom Bluetooth CI-V (`0xA4`) ou Cat-USB via uma conexão ser2net já criada. Só Bluetooth é direto; USB/CAT é sempre IP. Marque **Principal** no rádio que o Painel deve operar.
3. **ser2net** — uma serial, um dono. Acessórios (SPE, Hamplus, Palstar, LDG, ACOM) usam TCP `127.0.0.1:400x`.
4. **WiFi** — nome na rede (`ham-cockpit.local`), cabo ou Wi‑Fi da casa, DHCP ou IP fixo, Access Point para o campo.
5. **Wavelog** — chave API e Station ID no Gate (`/opt/wavelog-gate/wavelog-gate.env`). WSJT-X / JTDX: UDP secundário na porta 2333; Hamlib em `127.0.0.1:4532`.
6. **Painel** — **+ dispositivo** inclui cards; **X** remove. **Salvar o layout** grava para o usuário logado.
7. **Admin → Serviços** — o que sobe no boot.
8. **Admin → Backup** — arquivo em `/backup` (configs, WaveLogGate, Wavelog). Restore pede checkbox de confirmação.

### Rádio IC-705 (Bluetooth)

1. IC-705 ligado, Bluetooth ON.
2. Menu → Set → Bluetooth Set → **Pairing Reception** (deixe a tela aberta).
3. No console: Dispositivos → Rádio → Conectar. No Chrome escolha `ICOM BT(IC-705)`.
4. No rádio aceite **Ham-Cockpit-Web01**. PIN Windows, se pedir: `0000`.

O Lextel MS-2000 (SPP Classic) pode ficar no mesmo adaptador. Não é BLE: o Chrome não abre o wattímetro; o Pi usa o helper `lextel-bt`.

### Níveis elétricos

USB e Bluetooth não precisam de conversor. RS232 de PC (±12 V) precisa de MAX3232. GPIO do Pi é 3,3 V — cabo SPE/Palstar/Hamplus/ACOM direto no header danifica o SoC.

---

## Operação

- **Painel** — VFO A/B, PTT, modo, bandas, cards dos acessórios ligados. Maximizar é da página, não do card.
- **Wavelog** — logbook em :8086. Pacote UDP no Gate vira contato.
- **Logs / Terminal** — diário filtrável e shell root no Pi.
- **Admin → Atualização** — card **Ham Cockpit** compara a versão instalada com [`update/version.json`](update/version.json) na branch `main`. Os outros cards são Ubuntu, ser2net, Hamlib, Wavelog e WaveLogGate.
- **Admin → Backup** — restore devolve a estação à data/hora do arquivo; o que veio depois se perde.

Idioma PT/EN no canto do console. O **Manual** completo (com diagramas) está em Sistema → Manual. Catálogo de rádios (Icom, Kenwood, Yaesu, Flex, Ten-Tec, Xiegu, Hermes Lite 2, Anan — protocolos, portas, Hamlib): documentação do site em `/docs#equipamentos` e Manual → **Rádios suportados**; resumo em [`docs/equipamentos.md`](docs/equipamentos.md).

---

## Atualizações

O card Ham Cockpit lê:

`https://github.com/fviudes/ham-cockpit/tree/main/update`

Quando `version.json` na `main` tiver um número maior que o instalado, o botão **Atualizar** aplica o pacote na estação.

- Imagem bake: `x.y.zz` → `ham-cockpit-x.y.zz-raspi.img.xz`
- OTA-only: `x.y.zz.NN` (ex.: `0.1.04.01`) → `ham-cockpit-x.y.zz.NN.tgz`

Guia: [`docs/versionamento.md`](docs/versionamento.md).

---

## Contas padrão (troque depois do primeiro login)

| Onde | Usuário | Senha |
| --- | --- | --- |
| Console web | admin | 1234 |
| SSH | hamcockpit / admin | 1234 |
| Wi‑Fi AP | — | hamcockpit |

---

Ham Cockpit v0.1.05 · Raspberry Pi 3 / 4 / 5 · Ubuntu Server 24.04 LTS
