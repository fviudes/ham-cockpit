# Rotors e controladores

Ver registros completos em [`equipamentos.json`](equipamentos.json) (`category`: `rotor_controller`, `yagi_controller`, `software_gateway`).

Hamlib `rotctld` default TCP **4533**. No Cockpit: espelhar o hub CAT (`ser2net` → daemon).

## Yaesu GS-232B (rank 1) — P0

Controlador de computador para G-800/1000/2800 DXC e Az/El G-5500. Display está no **controlador do rotor** (medidor 0–450°), não no GS-232B.

- Protocolo ASCII GS-232B (`C` → `AZ=aaa`; `C2` → `AZ=aaa EL=eee`). GS-232A responde `+0aaa`.
- RS-232 1200–9600 8N1, default prático **4800**. DB-9: 2 TX, 3 RX, 5 GND, 7 RTS, 8 CTS. Autobaud com Enter nos 15 s após ligar.
- Hamlib **603** `ROT_MODEL_GS232B` (também 601 A, 602 generic, 609–612 Az/El split).

## Hy-Gain DCU / YRC-1 (rank 2) — P0

HAM-IV/T2X: base instalada enorme. Protocolo DCU-1: `AP1nnn;` + `AM1;` a **4800 8N1**. DCU-1 **não devolve** heading; DCU-3/YRC-1 sim (Hamlib **406**). USB xor RS-232 (jumper).

## Green Heron RT-21 (rank 3) — P0

LCD 0,1°, PWM, USB+RS-232. Superset DCU-1 a 4800 (9600 opcional). Hamlib **405**. Az/El = **dois** USB / dois `rotctld`. GH Everyware = TCP.

## SPID Rot2Prog / MD-01 (rank 20) — P0

EME/sat. Rot2Prog **600 8N1** pacotes binários 0x57…0x20. Hamlib **901–903**. MD-01 Ethernet modo ROT2 (TCP, frequentemente :23).

## Easycomm (rank 24) e PstRotator (rank 25) — P1

Easycomm II Hamlib **202**, baud típico 9600. PstRotator Hamlib **3**: ponte Windows para SteppIR e rotors sem backend.

## M2 RC2800, Prosistel, EA4TX (ranks 28–29, 34) — P2

Hamlib **1001**, **1701**, **1101**. Baud 9600 citado por terceiros — confirmar `-L` no hardware.

## SteppIR SDA-100/2000 (rank 9) — P2 (não é rotor)

Data Out: null-modem **3 fios**. Data In: CAT do rádio. Bytes de comando **não públicos** (SteppIR support). Integração segura: PstRotator.

## Fontes

Hamlib wiki rotators 4.7.1; manuais GS-232B, DCU-1/3, RT-21; OscarWatch rotators; PstRotator; SteppIR Serial Interface 2021.
