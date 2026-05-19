# Brainstorm de Design — ESP32 CI-V Configurator

## Contexto
Site técnico voltado para radioamadores e desenvolvedores de hardware que trabalham com ESP32, protocolo CI-V da Icom, Bluetooth e WiFi. O público é técnico, experiente e valoriza clareza, precisão e densidade de informação.

---

<response>
<probability>0.07</probability>
<text>

## Opção A — "Terminal Industrial" (Cyberpunk Técnico)

**Design Movement:** Brutalist Tech / Cyberpunk Terminal

**Core Principles:**
- Fundo escuro quase preto com acentos em verde-lima elétrico (#00FF41 estilo matrix)
- Tipografia monospace dominante para reforçar identidade de firmware/código
- Bordas retas, sem arredondamentos — estética de hardware industrial
- Densidade de informação máxima, sem espaço desperdiçado

**Color Philosophy:**
- Background: #0A0A0A (quase preto)
- Primary: #00FF41 (verde terminal)
- Secondary: #1A1A1A (cinza escuro)
- Accent: #FF6B00 (laranja alerta/warning)
- Emocional: transmite poder, precisão, controle técnico

**Layout Paradigm:**
- Layout assimétrico com sidebar fixa à esquerda (navegação)
- Conteúdo principal em duas colunas irregulares
- Blocos de código com destaque visual proeminente
- Seções separadas por linhas horizontais finas em verde

**Signature Elements:**
- Cursor piscante animado no título principal
- Bordas com efeito "scan line" sutil
- Badges de status estilo LED (verde = ativo, vermelho = inativo)

**Interaction Philosophy:**
- Hover com glow verde nos botões
- Transições rápidas (150ms) estilo terminal
- Scroll reveal com fade-in horizontal

**Animation:**
- Texto do hero com efeito typewriter
- Cards com border glow ao hover
- Seções entram com slide-in da esquerda

**Typography System:**
- Display: JetBrains Mono Bold (títulos)
- Body: JetBrains Mono Regular (corpo)
- Mono puro — reforça identidade de código/firmware

</text>
</response>

<response>
<probability>0.06</probability>
<text>

## Opção B — "Blueprint Técnico" (Engenharia Industrial)

**Design Movement:** Technical Blueprint / Engineering Drafting

**Core Principles:**
- Estética de planta técnica/blueprint com fundo azul-escuro profundo
- Linhas de grade sutis no fundo (como papel milimetrado técnico)
- Tipografia sans-serif condensada e precisa
- Hierarquia visual clara com numeração de seções estilo documentação técnica

**Color Philosophy:**
- Background: #0D1B2A (azul-marinho profundo)
- Primary: #4FC3F7 (azul ciano claro — linhas de blueprint)
- Secondary: #1A2744 (azul médio)
- Accent: #FFB300 (âmbar — destaques e alertas)
- Emocional: transmite engenharia, precisão, confiabilidade

**Layout Paradigm:**
- Layout de três colunas no desktop com coluna central dominante
- Sidebar direita com índice de navegação fixo
- Seções com numeração técnica (01, 02, 03...)
- Linhas de grade finas como elemento decorativo de fundo

**Signature Elements:**
- Ícones estilo esquemático/circuit board
- Linhas de conexão animadas entre seções
- Tags técnicas com bordas pontilhadas (estilo anotação de planta)

**Interaction Philosophy:**
- Hover com sublinhado animado estilo régua técnica
- Botões com bordas duplas (inner/outer border)
- Tooltips com informações técnicas detalhadas

**Animation:**
- Linhas de grade se revelam ao scroll
- Cards entram com scale(0.98) → scale(1)
- Números das seções contam de 0 ao valor final

**Typography System:**
- Display: Space Grotesk Bold (títulos técnicos)
- Body: IBM Plex Sans Regular (corpo legível)
- Code: IBM Plex Mono (blocos de código)

</text>
</response>

<response>
<probability>0.08</probability>
<text>

## Opção C — "Cockpit de Rádio" (Aviônica/Ham Radio)

**Design Movement:** Avionics HUD / Ham Radio Operator Interface

**Core Principles:**
- Inspirado em painéis de controle de rádio e cockpits de aeronave
- Fundo escuro com acentos em laranja-âmbar (cor de displays VFD antigos)
- Mistura de elementos analógicos (gauges, dials) com UI digital moderna
- Organização em "painéis" como um transceptor real

**Color Philosophy:**
- Background: #111318 (cinza-carvão escuro)
- Primary: #F59E0B (âmbar VFD — cor de display de rádio vintage)
- Secondary: #1C2128 (cinza azulado escuro)
- Accent: #10B981 (verde-esmeralda — indicadores ativos)
- Emocional: nostalgia técnica, autoridade de operador, precisão

**Layout Paradigm:**
- Layout em "painéis" horizontais como face de transceptor
- Hero com visualização de frequência/sinal animada
- Seções organizadas como módulos de equipamento
- Cards com cantos levemente chanfrados (estilo rack de equipamento)

**Signature Elements:**
- Visualizador de sinal animado (barras de S-meter)
- Indicadores LED com animação de pulso
- Bordas com efeito de painel metálico sutil

**Interaction Philosophy:**
- Botões com feedback tátil visual (press effect)
- Switches animados para opções on/off
- Indicadores de status em tempo real

**Animation:**
- S-meter animado no hero
- Fade-in sequencial dos painéis
- Glow pulse nos indicadores ativos

**Typography System:**
- Display: Orbitron Bold (títulos — estilo display digital)
- Body: Rajdhani Medium (corpo técnico legível)
- Code: Source Code Pro (blocos de código)

</text>
</response>

---

## Decisão Final: **Opção B — "Blueprint Técnico"**

Escolhida por ser a mais adequada para documentação técnica densa, com excelente legibilidade, hierarquia clara e identidade visual que remete à engenharia de hardware sem sacrificar a usabilidade.
