# Instaladores — Ham Cockpit OS

Imagem **Ubuntu Server 24.04 LTS ARM64** para gravar no microSD ou SSD do Raspberry Pi **3, 4 ou 5**. Já vem com Docker, Wavelog, WaveLogGate, ser2net, Hamlib, nginx e o console Ham Cockpit.

O arquivo `.img.xz` tem ~1–2 GB e **não cabe no Git**. Está na [Release v0.1.03](https://github.com/fviudes/ham-cockpit/releases/tag/v0.1.03).

| Artefato | Versão | Uso |
| --- | --- | --- |
| `ham-cockpit-0.1.03-raspi.img.xz` | v0.1.03 | Grave com o Raspberry Pi Imager (Use custom) |

```bash
gh release download --repo fviudes/ham-cockpit --pattern "ham-cockpit-*-raspi.img.xz" --dir instaladores
```

Windows (Administrador): `.\flash.ps1 -DiskNumber N`  
Linux: `sudo bash flash.sh /dev/sdX`

Não grave o Ubuntu vanilla. Esta imagem já é o sistema + a estação.

Passo a passo: [README do projeto](../README.md#instalação).
