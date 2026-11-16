# Limites Docker — Wavelog

Os contêineres do logbook ficam em `/opt/wavelog/docker-compose.yml`. O Ham Cockpit **não** publica a porta 3306 no host.

## Cotas atuais (compose)

| Serviço | RAM (teto) | CPUs (teto) | Notas |
| --- | --- | --- | --- |
| `wavelog-db` (`mariadb:11.8`) | 384 MiB | 1,0 | `innodb-buffer-pool-size=128M` (dobro do ajuste anterior de 64 M) |
| `wavelog-main` (PHP) | 512 MiB | 1,5 | Porta **8086** → 80 no contêiner |

Os valores são **limites** do cgroup Docker, não reserva fixa. Em Pis com 8 GB o `hc-tune.sh` reduz pressão de swap e deixa mais RAM livre para os contêineres respirarem dentro do teto.

## Onde isso entra

| Caminho | Efeito |
| --- | --- |
| Imagem bake / `install-station.sh` | Copia o compose para `/opt/wavelog` |
| OTA (`ota-hooks.sh`) | Se o YAML mudou, instala e `wavelog-ctl.sh start` em background |
| `hc-tune.sh` | Não copia o compose (swap/journald/sysctl); só documenta o contexto |

**Não** altera `WAVELOG_DB_PASSWORD`, volume `wavelog-dbdata` nem configs da estação.

## Conferir no Pi

```bash
docker inspect wavelog-db --format 'mem={{.HostConfig.Memory}} nano_cpus={{.HostConfig.NanoCpus}}'
docker inspect wavelog-main --format 'mem={{.HostConfig.Memory}} nano_cpus={{.HostConfig.NanoCpus}}'
```

Fonte no repositório: [`deploy/wavelog/docker-compose.yml`](../deploy/wavelog/docker-compose.yml).