# Rádios suportados

Catálogo vivo em `shared/equipment/` (tipos, modelos, portas, planos Hamlib).

## Onde ler na UI

- Documentação do site: `/docs#equipamentos`
- Manual do operador: Sistema → Manual → **Rádios suportados**

Ambos renderizam `EquipmentGuide` a partir do mesmo catálogo (diagramas SVG, wordmarks tipográficos, tabelas de protocolo/porta/Hamlib).

## Fabricantes

| Maker | Protocolo principal | Caminho Hamlib hoje |
| --- | --- | --- |
| Icom | CI-V · GATT · LAN UDP 50001–3 | USB→ser2net; GATT no Chrome; LAN = driver futuro |
| Kenwood | CAT serial | ser2net → `rigctld` |
| Yaesu | CAT serial | ser2net → `rigctld` |
| FlexRadio | SmartSDR TCP/UDP 4992 · VITA 4991 | proxy CAT → Hamlib |
| Ten-Tec | CAT serial | ser2net → `rigctld` |
| Xiegu | CI-V USB 19200 | ser2net → `rigctld` |
| Hermes Lite 2 | OpenHPSDR P1 UDP 1024/1025 | Thetis `:13013` / piHPSDR `:19090` |
| Anan | OpenHPSDR P2 UDP 1024+ | idem (proxy CAT) |

## Arquitetura

```
Rádio ──► transporte (USB/GATT/Ethernet/proxy)
              │
              ▼
         Hamlib Hub (rigctld :4532)
              │
     ┌────────┼────────┐
     ▼        ▼        ▼
  Painel   WSJT-X   WaveLogGate
```

Wordmarks nos manuais são tipográficos (não logotipos oficiais dos fabricantes).
