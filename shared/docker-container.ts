/** Contêineres Docker que o console pode listar e controlar. */
const ALLOW = new Set(["wavelog-db", "wavelog-main"]);

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

export function allowedDockerContainer(name: string): boolean {
  return typeof name === "string" && NAME_RE.test(name) && ALLOW.has(name);
}

export const DOCKER_CONTAINER_ALLOWLIST = [...ALLOW] as const;