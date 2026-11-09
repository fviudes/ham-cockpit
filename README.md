# Ham Cockpit v0.1.00

Appliance da estação de rádio amador: um Raspberry Pi com console no navegador. Fala com o rádio (Bluetooth ou CAT/USB via ser2net), wattímetro Lextel, amplificadores, chave de antenas, acoplador LDG e o logbook Wavelog.

Este repositório **não é código aberto**. O que está publicado para quem opera a estação:

| Pasta | Conteúdo |
| --- | --- |
| [Esta página](#instalação) | Instalação, configuração e operação |
| [`update/`](update/) | Canal de atualização (versão atual × versão nova no console) |
| [`instaladores/`](instaladores/) | ISO v0.1.00 para gravar / instalar no Raspberry Pi |

---

## O que sobe no Pi

- Console HTTP na porta **80** (`http://IP/console`)
- Wavelog (logbook) na **8086**
- WaveLogGate UDP **2333** → cadastra QSO no Wavelog
- ser2net + Hamlib (`127.0.0.1:4532`)
- Access Point `Ham-Cockpit-XXXX` em **192.168.4.1** se não houver cabo de rede
- SSH na porta **22** (usuários `hamcockpit` e `admin`)
- HDMI: VFO em tela cheia; `CTRL+X` volta ao console; 10 min parado no CLI reabre o VFO

---

## Instalação

### Material

- Raspberry Pi 3 ou Pi 4, fonte oficial, cartão microSD (16 GB ou mais)
- PC Windows ou Linux para gravar o cartão
- [Raspberry Pi Imager](https://www.raspberrypi.com/software/)

### 1. Baixe a ISO

Arquivo: [`instaladores/ham-cockpit-0.1.00.iso`](instaladores/ham-cockpit-0.1.00.iso)

Abra a ISO (Explorador de arquivos no Windows, ou monte no Linux). Dentro estão o instalador da aplicação, o `LEIA-ME` e os scripts de gravação.

### 2. Sistema operacional no cartão

Grave **Ubuntu Server 24.04 LTS** (ARM64) no microSD com o Raspberry Pi Imager.

No primeiro boot do Ubuntu, ligue o Pi na rede (Ethernet) ou use um monitor/teclado.

### 3. Instale o Ham Cockpit

Copie o conteúdo da ISO para o Pi (pendrive, SCP ou pasta montada) e, como root:

```bash
sudo bash deploy/station/install-station.sh
```

O script instala Node, Docker, nginx, cria o usuário `hamcockpit`, copia o console para `/opt/ham-cockpit` e habilita os serviços no boot.

### 4. Primeiro acesso

1. Sem Ethernet: no telefone ou notebook, entre no Wi‑Fi **Ham-Cockpit-XXXX** (os quatro caracteres mudam por aparelho). Senha: **hamcockpit**.
2. Abra **http://192.168.4.1/console** (ou `http://IP-do-Pi/console` / `http://ham-cockpit.local/console` na LAN).
3. Login: **admin** / **1234**. Troque a senha em Admin.

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

Idioma PT/EN no canto do console. O **Manual** completo (com diagramas) está em Sistema → Manual.

---

## Atualizações

O card Ham Cockpit lê:

`https://github.com/fviudes/ham-cockpit/tree/main/update`

Quando `version.json` na `main` tiver um número maior que o instalado, o botão **Atualizar** aplica o pacote na estação.

---

## Contas padrão (troque depois do primeiro login)

| Onde | Usuário | Senha |
| --- | --- | --- |
| Console web | admin | 1234 |
| SSH | hamcockpit / admin | 1234 |
| Wi‑Fi AP | — | hamcockpit |

---

Ham Cockpit v0.1.00 · Raspberry Pi 3 / 4 · Ubuntu Server 24.04 LTS
