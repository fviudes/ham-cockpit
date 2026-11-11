# Checklist lab — Wavelog / MariaDB

Aprendizados do lab (Pi 3, `192.168.20.109`) para **imagem limpa / OTA**. O card do console (`/console/wavelog`) lê as mesmas fontes. **Não** rotacionar `WAVELOG_DB_PASSWORD` se o volume Docker já existir.

## O que o lab usa (snapshot 11/Nov/2026)

Leitura SSH (`admin`, sudo para o `.env`). Dual/Host **não** foram reiniciados.

| Campo | Valor no Pi | Fonte |
| --- | --- | --- |
| Implantação | Docker Compose (`wavelog.service` → `wavelog-ctl.sh start`) | `/opt/wavelog/docker-compose.yml` |
| Host (instalador web) | `wavelog-db` | compose, rede Docker `wavelog` |
| Porta | 3306 **não publicada** no host (`3306/tcp` só no container) | compose; `docker ps` |
| Nome do banco | `wavelog` | `MARIADB_DATABASE` |
| Usuário | `wavelog` | `MARIADB_USER` |
| Senha | a de `WAVELOG_DB_PASSWORD` em `/opt/wavelog/.env` (20 chars, gerada no install, **igual** ao `MARIADB_PASSWORD` do container) | `.env` chmod 640 `hamcockpit:hamcockpit` |
| Status MariaDB | container `wavelog-db` **healthy** (`mariadb:11.8`) | `docker inspect` |
| PHP | `wavelog-main` `:8086` (`ghcr.io/wavelog/wavelog:latest`) | `docker ps` |
| Versão servidor | **11.8.9-MariaDB-ubu2404** | `mariadb -uroot` / label `MARIADB_VERSION=1:11.8.9+maria~ubu2404` |
| Charset / collation (servidor) | `utf8mb4` / `utf8mb4_uca1400_ai_ci` | `@@character_set_server` / `@@collation_server` |
| Schema app | database/user `wavelog` **existem** (`SHOW DATABASES` lista `wavelog`; user `%` e `localhost`) após `ensure-db` — senha a do `.env`, sem rotação | `SHOW DATABASES`; `mysql.user` via `docker exec` |
| Tabelas / tamanho do logbook | `0` / `0 B` | `information_schema.TABLES` com `TABLE_SCHEMA='wavelog'` (não usar `du` do datadir) |
| Engine | — (sem tabela de aplicação) | idem |
| Imagem DB | `mariadb:11.8` | `docker inspect` |
| Config PHP docker | volume `wavelog-config` **vazio** (instalador web ainda não gravou `database.php`) | `docker exec wavelog-main ls …/config/docker` |
| URL | `http://IP:8086` · install `http://IP:8086/install` | porta mapeada 8086:80 |
| Host :3306 | **não escuta** no Pi | `ss -lnt` (8086 e 80 sim) |

## Gap bake → correção no repo

**Era:** primeiro `compose up` com volume já inicializado sem `MARIADB_USER` deixa MariaDB saudável mas **sem** DB/usuário `wavelog`. O instalador web falha; a senha do `.env` existe e **não** deve ser regenerada.

**Feito no lab:** leitura confirmou o gap (DB/user ausentes; senha do `.env` intacta). Cópia do `wavelog-ctl.sh` pelo Windows entrou com **CRLF** e o `wavelog.service` (oneshot) ficou `failed`; os containers `wavelog-db`/`wavelog-main` **continuaram Up**. Dual/Host permaneceram `active`. Correção: `sed -i 's/\r$//' /opt/wavelog/wavelog-ctl.sh` + `ensure-db` (repo já faz `eol=lf` e `sed` no install/OTA). **Não** rotacionar senha.

**11/Nov/2026 (ensure-db no Pi):** `wavelog-ctl.sh` sem CRLF; `ensure-db` criou schema/user `wavelog` (SHOW DATABASES lista `wavelog`; user `%` e `localhost`; 0 tabelas de app); containers Up; `reset-failed` no oneshot; Dual/Host intocados.

**Bake / install / OTA — instalação limpa não precisa re-fixar o Wavelog do lab:**

1. `deploy/wavelog/wavelog-ctl.sh` — `ensure_env` (só gera `.env` se faltar) + `ensure-db` após `up`; alvo `ensure-db`; script **só LF** (`.gitattributes` + `sed` no install/first-boot/OTA).
2. `deploy/station/install-station.sh` — cria `.env` **antes** de copiar compose (não sobrescreve / **não rotaciona** senha).
3. `deploy/wavelog/docker-compose.yml` — `MARIADB_USER`/`MARIADB_DATABASE` no primeiro init + `env_file: .env`.
4. `first-boot.sh` chama `ensure-db`; `station-upd apply wavelog` também.
5. `ota-hooks.sh` + `scripts/pack-update.mjs` — instala `wavelog-ctl.sh` + compose em `/opt/wavelog` e chama `ensure-db` (publicado no OTA **0.1.05.02**).
6. Card DB: `GET /api/wavelog/database` via **docker exec** no container (nunca socket `mysql` do host). Console: senha revelar/ocultar; **não** loga senha no journal.

## Card do console — de onde lê

| UI | API / arquivo |
| --- | --- |
| Nome, usuário, host, porta | constantes do compose (`wavelog` / `wavelog-db` / 3306) em `server/wavelog-status.ts` |
| Senha | `/opt/wavelog/.env` → `WAVELOG_DB_PASSWORD` |
| Status up/down | `docker inspect` health do `wavelog-db` + login do usuário `wavelog` |
| Versão / charset / engine / tabelas / tamanho | `docker exec wavelog-db mariadb` — **nunca** `mysql` no socket `localhost` do host (`Access denied` / socket errado). 1º usuário `MARIADB_PASSWORD`; se o volume não tiver esse user, fallback **root TCP 127.0.0.1 no container** (`queryVia: root-socket`). `TABLE_SCHEMA='wavelog'` (não `DATABASE()`). |
| Atualizar banco | `wavelog-ctl.sh pull` (oficial: `docker compose pull && up`) + migrate da imagem |
| Status (Admin) | `GET /api/wavelog/database` — tiles MariaDB (health, versão, tabelas) |

SSH no lab: usuário **admin** (sudo) ou **hamcockpit** / `1234`. O `.env` 640 só o `hamcockpit` lê sem sudo — o serviço do console roda como `hamcockpit`.
