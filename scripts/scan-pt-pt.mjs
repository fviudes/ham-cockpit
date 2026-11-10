import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, sep } from "node:path";

const ROOT = process.cwd();
const SKIP_DIR = new Set(["node_modules", "dist", ".git", "protocolos"]);
const EXT = new Set([".ts", ".tsx", ".md", ".txt", ".sh", ".ps1", ".mjs", ".yml", ".yaml", ".json", ".conf", ".service", ".html"]);

const PATTERNS = [
  [/\bficheiro(s)?\b/gi, "arquivo"],
  [/\becrãs?\b/gi, "tela"],
  [/\bécrãs?\b/gi, "tela"],
  [/\bsecç(ão|ões)\b/gi, "seção"],
  [/\bactual(izar|ização|izações|mente)?\b/gi, "atual…"],
  [/\butilizador(es)?\b/gi, "usuário"],
  [/\bdescarreg(ar|a|amento)\b/gi, "baixar"],
  [/\bpalavra-passe\b/gi, "senha"],
  [/\bcontacto(s)?\b/gi, "contato"],
  [/\bóptimo\b/gi, "ótimo"],
  [/\bobjecto(s)?\b/gi, "objeto"],
  [/\bacç(ão|ões)\b/gi, "ação"],
  [/\bdirecç(ão|ões)\b/gi, "direção"],
  [/\bexcepç(ão|ões)\b/gi, "exceção"],
  [/\bseleccion\w*/gi, "selecion…"],
  [/\bintroduza\b/gi, "digite/informe"],
  [/\befectu\w*/gi, "efetu…"],
  [/\btelemóvel\b/gi, "celular"],
  [/\bconsola\b/gi, "console"],
  [/\barranque\b/gi, "inicialização/boot"],
  [/\bcorre no\b/gi, "roda no"],
  [/\bsó corre\b/gi, "só roda"],
  [/\bmeio de ligação\b/gi, "tipo de conexão"],
  [/\bomissão\b/gi, "padrão"],
  [/\bguardar\b/gi, "salvar"],
  [/\bguarde\b/gi, "salve"],
  [/\bactivo\b/gi, "ativo"],
  [/\bactiva\b/gi, "ativa"],
  [/\baced(a|er)\b/gi, "acesse/acessar"],
  [/\biniciar sessão\b/gi, "entrar"],
  [/\bterminar sessão\b/gi, "sair"],
  [/\bexcepto\b/gi, "exceto"],
  [/\bjá não\b/gi, "não … mais"],
  [/\bé favor\b/gi, "por favor"],
  [/\bautocarro\b/gi, "ônibus"],
  [/\bcomboio\b/gi, "trem"],
  [/\beléctrico\b/gi, "elétrico"],
  [/\bhúmido\b/gi, "úmido"],
  [/\bfrigorífico\b/gi, "geladeira"],
  [/\bprotecç\w*/gi, "proteção"],
  [/\bprojecto(s)?\b/gi, "projeto"],
  [/\bcolecç\w*/gi, "coleção"],
  [/\bcorrecç\w*/gi, "correção"],
  [/\bde forma a\b/gi, "para"],
  [/\bde modo a\b/gi, "para"],
  [/\bsistema operativo\b/gi, "sistema operacional"],
  [/\bA atualizar\b/g, "Atualizando"],
  [/\ba medir\b/gi, "medindo"],
  [/\b a (atualizar|medir|ligar|desligar|iniciar|parar|gravar|salvar|correr|fazer|abrir|fechar|verificar|aplicar|processar)\b/gi, "gerúndio BR"],
  [/\bGama\b/g, "Faixa"],
  [/\bvectorial\b/gi, "vetorial"],
  [/\barquitectura\b/gi, "arquitetura"],
  [/\bassar\b/gi, "gerar/montar"],
  [/\bassados?\b/gi, "pronto(s) no bake"],
  [/\bassando\b/gi, "gerando/montando"],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name) || name.startsWith("ESP32")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "protocolos") continue;
      walk(p, out);
    } else if (EXT.has(extname(name))) out.push(p);
  }
  return out;
}

const falsePos = /(Aguarde|aguarde|activate|actually|activated|Authentication|pt-br\.mdc|scan-pt-pt)/i;
const hits = [];
for (const file of walk(ROOT)) {
  const rel = file.slice(ROOT.length + 1);
  if (rel.includes(`docs${sep}protocolos`) || rel.includes("docs/protocolos")) continue;
  const lines = readFileSync(file, "utf8").split(/\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (falsePos.test(line) && !/ecrã|ficheiro|utilizador|corre no|sistema operativo|A atualizar|a medir|\bGama\b/i.test(line)) continue;
    for (const [re, tip] of PATTERNS) {
      re.lastIndex = 0;
      const m = line.match(re);
      if (!m) continue;
      if (/\bportátil\b/i.test(m[0]) && /\brádio|QRP/i.test(line)) continue;
      hits.push({ file: rel, line: i + 1, match: m[0], tip, text: line.trim().slice(0, 160) });
      break;
    }
  }
}

console.log(`hits=${hits.length}`);
for (const h of hits) console.log(`${h.file}:${h.line} [${h.match} → ${h.tip}] ${h.text}`);
