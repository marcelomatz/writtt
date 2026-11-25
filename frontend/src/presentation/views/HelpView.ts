import { matzIcon } from "@matz/ui";
import { HelpTopicId, t } from "../../domain";
import { bindHorizontalResizer } from "../dom/domUtils";

export interface HelpViewCallbacks {
  onSelectTopic: (topic: HelpTopicId) => void;
  onAction: (actionId: string) => void;
}

interface HelpTopicMeta {
  id: HelpTopicId;
  icon: string;
  label: string;
  desc: string;
}

let helpRailCollapsed = false;

export function renderHelpView(
  container: HTMLElement,
  activeTopic: HelpTopicId,
  cb: HelpViewCallbacks
): void {
  const topics: HelpTopicMeta[] = [
    {
      id: "overview",
      icon: "home",
      label: t("1. Por que o Writtt Existe", "1. Why Writtt Exists", "1. Por que Existe Writtt"),
      desc: t("Escrita privada, 100% local e sem nuvem", "Private, 100% local writing with zero cloud", "Escritura privada y 100% local"),
    },
    {
      id: "editor",
      icon: "feather",
      label: t("2. Editor, Barra / & Desenhos", "2. Editor, Slash / & Drawings", "2. Editor, Barra / y Dibujos"),
      desc: t("Formatacao limpa, tabelas, SVG e foco", "Clean formatting, tables, SVG & focus", "Formato limpio, tablas y dibujos"),
    },
    {
      id: "chapters",
      icon: "columns",
      label: t("3. Capitulos, Rascunhos & Versoes", "3. Chapters, Drafts & Versions", "3. Capitulos y Versiones"),
      desc: t("Sumario automatico, edicao lado a lado e historico", "Auto-outline, side-by-side drafts & history", "Indice, vista doble e historial"),
    },
    {
      id: "vault",
      icon: "shield-check",
      label: t("4. Cofre, Senha, PIN & Provas", "4. Vault, Password, PIN & Proofs", "4. Boveda, PIN y Autoria"),
      desc: t("Como blindamos seus textos e provamos autoria", "How we armor your texts & prove authorship", "Como blindamos tus textos y autoria"),
    },
    {
      id: "ai",
      icon: "brain",
      label: t("5. IA Local Privada & Memoria", "5. Private Local AI & Memory", "5. IA Local Privada y Memoria"),
      desc: t("Assistente no seu proprio computador sem vazamentos", "Assistant on your own hardware with zero leaks", "IA en tu propio equipo sin fugas"),
    },
    {
      id: "publish",
      icon: "archive",
      label: t("6. E-books, Arquivos & Backups", "6. E-books, Files & Backups", "6. E-books, Archivos y Respaldos"),
      desc: t("Exportar para Kindle/PDF, guardar PDFs e backups", "Export for Kindle/PDF, lock files & backups", "Exportar EPUB y respaldos cifrados"),
    },
    {
      id: "shortcuts",
      icon: "keyboard",
      label: t("7. Atalhos Rapidos de Teclado", "7. Keyboard Shortcuts", "7. Atajos de Teclado"),
      desc: t("Comandos para escrever sem tirar as maos do teclado", "Write faster without leaving the keyboard", "Escribe sin soltar el teclado"),
    },
  ];

  const currentIdx = topics.findIndex((tp) => tp.id === activeTopic);
  const prevTopic = currentIdx > 0 ? topics[currentIdx - 1] : null;
  const nextTopic = currentIdx >= 0 && currentIdx < topics.length - 1 ? topics[currentIdx + 1] : null;

  container.innerHTML = `
    <div class="writtt-settings-layout">
      <aside class="writtt-settings-rail ${helpRailCollapsed ? "is-collapsed" : ""}" id="hlp-rail">
        <div class="writtt-rail-head">
          <span class="writtt-rail-text writtt-rail-heading">${t("Guia do Autor", "Author Guide", "Guia del Autor")}</span>
          <button class="writtt-btn writtt-btn-ghost writtt-icon-btn-sm" id="hlp-rail-collapse" title="${t("Recolher / Expandir menu", "Collapse / Expand menu", "Colapsar")}">
            ${matzIcon("sidebar", 13)}
          </button>
        </div>
        <div class="writtt-rail-list">
          ${topics
            .map(
              (tp) => `
              <button class="writtt-settings-nav-item ${activeTopic === tp.id ? "is-active" : ""}" data-htopic="${tp.id}" title="${tp.label}">
                <span class="${activeTopic === tp.id ? "writtt-accent-icon" : "writtt-muted-icon"}">${matzIcon(tp.icon as any, 14)}</span>
                <div class="writtt-rail-text writtt-min-w0">
                  <div class="writtt-nav-label">${tp.label}</div>
                  <div class="writtt-tree-snippet">${tp.desc}</div>
                </div>
              </button>`
            )
            .join("")}
        </div>
      </aside>
      <div class="writtt-resizer ${helpRailCollapsed ? "is-hidden" : ""}" id="hlp-rail-resizer"></div>

      <section class="writtt-help-scroll">
        <div class="writtt-help-stage">
          ${renderTopicContent(activeTopic)}

          <footer class="writtt-help-pager">
            <div>
              ${
                prevTopic
                  ? `<button class="writtt-btn" data-htopic="${prevTopic.id}">
                      ${matzIcon("arrow-left", 12)}
                      <span>${prevTopic.label}</span>
                    </button>`
                  : `<button class="writtt-btn" data-hgo="go-home">
                      ${matzIcon("home", 12)}
                      <span>${t("Voltar ao Inicio", "Back to Home", "Volver al Inicio")}</span>
                    </button>`
              }
            </div>
            <div>
              ${
                nextTopic
                  ? `<button class="matz-btn matz-btn-primary writtt-btn-sm" data-htopic="${nextTopic.id}">
                      <span>${nextTopic.label}</span>
                      ${matzIcon("arrow-right", 12)}
                    </button>`
                  : `<button class="matz-btn matz-btn-primary writtt-btn-sm" data-hgo="new-doc">
                      ${matzIcon("feather", 12)}
                      <span>${t("Comecar a Escrever", "Start Writing", "Empezar a Escribir")}</span>
                    </button>`
              }
            </div>
          </footer>
        </div>
      </section>
    </div>
  `;

  container.querySelector("#hlp-rail-collapse")?.addEventListener("click", () => {
    helpRailCollapsed = !helpRailCollapsed;
    renderHelpView(container, activeTopic, cb);
  });

  bindHorizontalResizer({
    resizerEl: container.querySelector("#hlp-rail-resizer") as HTMLElement | null,
    targetEl: container.querySelector("#hlp-rail") as HTMLElement | null,
    cssVarName: "--writtt-rail-width",
    minPx: 195,
    maxPx: 360,
    side: "left",
  });

  container.querySelectorAll("[data-htopic]").forEach((btn) => {
    btn.addEventListener("click", () =>
      cb.onSelectTopic(((btn as HTMLElement).dataset.htopic as HelpTopicId) || "overview")
    );
  });
  container.querySelectorAll("[data-hgo]").forEach((btn) => {
    btn.addEventListener("click", () => cb.onAction((btn as HTMLElement).dataset.hgo || ""));
  });
}

function guideHero(
  kicker: string,
  title: string,
  lead: string,
  actionHtml = ""
): string {
  return `
    <header class="writtt-home-hero-surface writtt-help-hero">
      <div class="writtt-home-manifesto-badge writtt-mb-xs">
        ${matzIcon("bookmark", 11)}
        <span>${kicker}</span>
      </div>
      <h1 class="writtt-home-display-title">${title}</h1>
      <p class="writtt-home-display-lead">${lead}</p>
      ${actionHtml ? `<div class="writtt-row-gap-sm writtt-mt-xs">${actionHtml}</div>` : ""}
    </header>
  `;
}

function guideFeatureCard(params: {
  icon: string;
  title: string;
  techBadge: string;
  whatItDoes: string;
  howToUse: string;
  techPlainExplanation: string;
}): string {
  return `
    <article class="writtt-guide-card">
      <div class="writtt-guide-card-head">
        <div class="writtt-guide-card-title-wrap">
          <span class="writtt-home-icon-box is-accent">${matzIcon(params.icon as any, 15)}</span>
          <h3 class="writtt-guide-card-title">${params.title}</h3>
        </div>
        <span class="matz-badge writtt-mono writtt-badge-xs">${params.techBadge}</span>
      </div>

      <p class="writtt-guide-copy">${params.whatItDoes}</p>

      <div class="writtt-guide-howto">
        <b>${t("Como usar no Writtt:", "How to use it in Writtt:", "Como usarlo en Writtt:")}</b>
        <span>${params.howToUse}</span>
      </div>

      <div class="writtt-tech-explainer">
        <div class="writtt-tech-explainer-head">
          ${matzIcon("info", 11)}
          <span>${t("Como nossa tecnologia protege voce nos bastidores", "How our technology works behind the scenes", "Como funciona nuestra tecnologia por dentro")}</span>
        </div>
        <p class="writtt-tech-explainer-body">${params.techPlainExplanation}</p>
      </div>
    </article>
  `;
}

function renderTopicContent(activeTopic: HelpTopicId): string {
  switch (activeTopic) {
    case "overview":
      return `
        ${guideHero(
          t("WRITTT · FILOSOFIA & VISAO GERAL", "WRITTT · PHILOSOPHY & OVERVIEW", "WRITTT · FILOSOFIA Y VISION GENERAL"),
          t(
            "Suas palavras sao suas. Completamente.",
            "Your words are yours. Completely.",
            "Tus palabras son tuyas. Completamente."
          ),
          t(
            "Nao existe escrita honesta sob vigilancia. Quando voce usa editores online comuns, cada frase digitada viaja para servidores de outras empresas, exige login e fica exposta a vazamentos. O Writtt faz exatamente o oposto: ele vive inteiramente dentro do seu computador, gratuito, de codigo aberto e sem nenhuma conta.",
            "Honest writing requires privacy. Cloud editors send every sentence you type to remote company servers and require accounts. Writtt does the exact opposite: it runs 100% on your own computer, free, open-source, with no login and no tracking.",
            "La escritura honesta exige privacidad. Writtt vive 100% dentro de tu computadora, gratuito, de codigo abierto, sin cuentas ni servidores externos."
          ),
          `<button class="matz-btn matz-btn-primary writtt-btn-sm" data-hgo="new-doc">${matzIcon("feather", 12)} <span>${t("Abrir Pagina em Branco", "Open Blank Page", "Abrir Pagina en Blanco")}</span></button>
           <button class="writtt-btn writtt-btn-sm" data-hgo="settings-security">${matzIcon("lock", 12)} <span>${t("Conhecer o Cofre Pessoal", "Explore Personal Vault", "Explorar Boveda")}</span></button>`
        )}

        <div class="writtt-guide-grid">
          ${guideFeatureCard({
            icon: "hard-drive",
            title: t("Arquivos 100% no Seu Computador", "100% Stored on Your Computer", "100% Guardado en Tu Computadora"),
            techBadge: t("LOCAL-FIRST · MARKDOWN", "LOCAL-FIRST · MARKDOWN", "LOCAL-FIRST · MARKDOWN"),
            whatItDoes: t(
              "Tudo o que voce escreve fica guardado diretamente numa pasta pessoal dentro do seu proprio computador (~/.writtt/data). Voce nunca depende de internet para abrir, editar ou salvar seus textos — seja num aviao, num sitio ou com o Wi-Fi desligado.",
              "Everything you write is saved directly inside a personal folder on your own computer (~/.writtt/data). You never depend on an internet connection to open, edit, or save your manuscripts.",
              "Todo lo que escribes se guarda directamente en tu propia computadora (~/.writtt/data), siempre disponible sin conexion a internet."
            ),
            howToUse: t(
              "Na Tela Inicial, clique em 'Escrever Novo Manuscrito' ou 'Importar Texto'. Enquanto voce escreve, o Writtt salva automaticamente no seu disco.",
              "On the Home screen, click 'Write New Manuscript' or 'Import Local Draft'. As you type, Writtt automatically saves your work to disk.",
              "En la pantalla de Inicio haz clic en 'Escribir Nuevo Manuscrito'. Writtt guarda automaticamente mientras escribes."
            ),
            techPlainExplanation: t(
              "Usamos o formato universal Markdown (.md) para obras abertas: isso significa que seus textos nao ficam presos em formatos proprietarios secretos. Mesmo daqui a 30 anos, qualquer programa de texto conseguira ler seus arquivos.",
              "Open manuscripts are stored in universal Markdown (.md), meaning you are never locked into a proprietary file format — your files remain readable for decades.",
              "Usamos el formato universal Markdown (.md) para que tus obras nunca queden atrapadas en formatos propietarios."
            ),
          })}

          ${guideFeatureCard({
            icon: "search",
            title: t("Busca Instantanea em Toda a Biblioteca", "Instant Library-Wide Search", "Busqueda Instantanea en Tu Biblioteca"),
            techBadge: t("CATALOGO LOCAL SQLITE FTS5", "LOCAL SQLITE FTS5 ENGINE", "MOTOR LOCAL SQLITE FTS5"),
            whatItDoes: t(
              "Esqueceu em qual capitulo ou rascunho anotou o nome de um personagem, clausula ou ideia? Digite uma palavra e o Writtt encontra o trecho exato em milissegundos no meio de centenas de textos.",
              "Forgot which chapter or note mentions a character, clause, or idea? Type a word and Writtt finds the exact passage in milliseconds across hundreds of documents.",
              "Encuentra cualquier palabra, personaje o idea en milisegundos entre cientos de documentos."
            ),
            howToUse: t(
              "Use a barra de busca na Tela Inicial ou na barra lateral esquerda dentro do editor para filtrar por titulo, frase do texto ou #etiquetas.",
              "Use the search bar on the Home screen or in the left editor sidebar to filter by title, body phrase, or #tags.",
              "Usa la barra de busqueda en Inicio o en la barra lateral del editor."
            ),
            techPlainExplanation: t(
              "O que e o SQLite FTS5 usado pelo Writtt? Pense nele como um 'indice remissivo de livro' super-rapido que roda guardado so no seu computador, sem mandar sua pesquisa para nenhum site. Melhor ainda: quando voce tranca uma obra no Cofre, o Writtt apaga imediatamente as palavras dela desse indice — garantindo que ninguem descubra o conteudo trancado fazendo buscas.",
              "What is SQLite FTS5? Think of it as an ultra-fast private book index stored strictly on your hard drive rather than a cloud search server. Crucially, whenever you lock a manuscript in the Vault, Writtt immediately scrubs its words from this search index so locked content can never leak.",
              "SQLite FTS5 funciona como un indice privado ultrarrapido dentro de tu propio disco. Al cerrar una obra en la Boveda, sus palabras se borran del indice para proteger tu privacidad."
            ),
          })}
        </div>
      `;

    case "editor":
      return `
        ${guideHero(
          t("ESTUDIO DE ESCRITA · CONFORTO & FOCO", "WRITING STUDIO · COMFORT & FOCUS", "ESTUDIO DE ESCRITURA · ENFOQUE"),
          t(
            "Uma folha limpa que mostra ferramentas so quando voce precisa.",
            "A quiet page that reveals tools only when you need them.",
            "Una pagina limpia que muestra herramientas solo cuando las necesitas."
          ),
          t(
            "Editores tradicionais enchem o topo da tela com dezenas de botoes piscando. No Writtt, o palco prioriza o seu texto — mas todos os recursos profissionais (formatacao, tabelas, listas de tarefas, blocos de codigo e ate desenho livre) surgem a um clique ou comando.",
            "Traditional word processors crowd the screen with dozens of toolbars. Writtt keeps the stage calm while putting rich formatting, tables, task lists, code blocks, and freehand vector drawing one keystroke away.",
            "Writtt mantiene la pantalla despejada mientras ofrece tablas, tareas, bloques de codigo y dibujo libre a un comando de distancia."
          ),
          `<button class="matz-btn matz-btn-primary writtt-btn-sm" data-hgo="new-doc">${matzIcon("edit", 12)} <span>${t("Experimentar no Editor", "Try in Editor", "Probar en el Editor")}</span></button>
           <button class="writtt-btn writtt-btn-sm" data-hgo="settings-appearance">${matzIcon("palette", 12)} <span>${t("Ajustar Fonte, Largura & Brilho", "Customize Font & Brightness", "Ajustar Fuente y Brillo")}</span></button>`
        )}

        <div class="writtt-guide-grid">
          ${guideFeatureCard({
            icon: "command",
            title: t("Menu de Barra (/) e Barra Flutuante de Selecao", "Slash Menu (/) & Floating Selection Bar", "Comandos con / y Barra Flotante"),
            techBadge: t("EDITOR RICO WYSIWYG", "RICH WYSIWYG STUDIO", "EDITOR RICO WYSIWYG"),
            whatItDoes: t(
              "Permite criar titulos grandes, listas de compras/tarefas com caixinhas marcaveis, tabelas, citacoes destacadas e pedir ajuda para a IA sem tirar as maos do teclado.",
              "Lets you insert headings, interactive checklists, tables, blockquotes, and AI actions without taking your hands off the keyboard.",
              "Inserta titulos, listas de tareas interactivas, tablas, citas y ayuda de IA sin soltar el teclado."
            ),
            howToUse: t(
              "No meio de qualquer linha, digite '/' (por exemplo: /task para lista de tarefas, /table para tabela ou /ai para chamar a IA) e aperte Enter. Ou selecione qualquer frase com o mouse para abrir a barrinha flutuante de Negrito, Italico, Marca-texto e IA.",
              "Type '/' anywhere (e.g. /task, /table, /ai) and press Enter. Or highlight any sentence with your mouse to pop up Bold, Italic, Highlight, Link, and AI.",
              "Escribe '/' en cualquier linea (/task, /table, /ai) y pulsa Enter, o selecciona una frase para ver la barra flotante."
            ),
            techPlainExplanation: t(
              "WYSIWYG significa 'o que voce ve e o que voce tem': voce enxerga o texto bonito como um livro pronto enquanto digita, mas nos bastidores o Writtt converte tudo automaticamente para texto estruturado limpo e leve.",
              "You see clean book-grade typography while typing, while behind the scenes Writtt keeps your manuscript structured in clean, lightweight Markdown.",
              "Ves el texto con tipografia editorial limpia mientras internamente se mantiene ligero y portable."
            ),
          })}

          ${guideFeatureCard({
            icon: "image",
            title: t("Imagens Coladas e Quadro de Desenho Livre", "Pasted Images & Freehand Sketch Canvas", "Imagenes y Lienzo de Dibujo"),
            techBadge: t("DESENHO VETORIAL SVG", "VECTOR SVG SKETCHPAD", "DIBUJO VECTORIAL SVG"),
            whatItDoes: t(
              "Precisa ilustrar um mapa mental, esquema de enredo, assinatura ou diagrama rapido no meio do texto? Voce pode desenhar direto dentro do Writtt ou arrastar fotos do seu computador.",
              "Need to sketch a mind map, plot diagram, or quick visual note right inside your manuscript? Draw directly inside Writtt or drag-and-drop images from your computer.",
              "Dibuja esquemas, mapas mentales o diagramas directamente dentro del documento o arrastra fotos."
            ),
            howToUse: t(
              "Arraste ou cole (Ctrl+V) qualquer imagem no editor, ou digite '/draw' (ou clique no botao SVG da barra de formatacao) para abrir o quadro de desenho com caneta, linhas, retangulos e circulos.",
              "Drag or paste (Ctrl+V) any image, or type '/draw' (or click SVG on the format bar) to open the drawing canvas with pen, line, rectangle, and circle tools.",
              "Pega imagenes con Ctrl+V o escribe '/draw' para abrir el lienzo de dibujo."
            ),
            techPlainExplanation: t(
              "O que significa desenho SVG? Diferente de uma foto comum que fica borrada ao dar zoom, o formato SVG guarda os tracos matematicos do seu desenho — por isso ele continua nitido em qualquer tamanho de tela ou impressao e quase nao ocupa espaco no disco.",
              "Unlike pixel photos that blur when zoomed, SVG stores clean mathematical strokes — keeping your diagrams razor-sharp at any zoom or print size while taking minimal disk space.",
              "A diferencia de fotos comunes que se pixelan, SVG guarda trazos nitidos en cualquier tamano ocupando muy poco espacio."
            ),
          })}

          ${guideFeatureCard({
            icon: "eye",
            title: t("Modo Zen, Foco no Paragrafo e Iluminacao Adaptativa", "Zen Mode, Paragraph Focus & Adaptive Brightness", "Modo Zen, Enfoque e Iluminacion"),
            techBadge: t("ERGONOMIA VISUAL", "VISUAL ERGONOMICS", "ERGONOMIA VISUAL"),
            whatItDoes: t(
              "Elimina toda distracao visual para sessoes longas de escrita noturna ou concentracao profunda, além de ensinar ao corretor suas proprias palavras (nomes de personagens, termos medicos ou juridicos).",
              "Removes visual noise for late-night writing or deep concentration, and lets you teach Writtt your custom vocabulary (character names, legal or medical terms).",
              "Elimina distracciones visuales para sesiones largas y permite registrar tu propio vocabulario."
            ),
            howToUse: t(
              "Pressione Alt+Z para entrar no Modo Zen (so voce e o texto). Na barra inferior, deslize o controle de brilho para suavizar a luz da tela. Clique com o botao direito numa palavra para adiciona-la ao seu Dicionario Pessoal.",
              "Press Alt+Z for Zen Mode. Use the brightness slider on the bottom status bar to soften screen glare, and right-click any word to add it to your Custom Dictionary.",
              "Pulsa Alt+Z para Modo Zen, ajusta el brillo abajo y usa clic derecho para agregar palabras a tu Diccionario Personal."
            ),
            techPlainExplanation: t(
              "O Writtt e um aplicativo nativo feito em Go e Wails (sem o peso de navegadores inteiros embutidos), garantindo resposta imediata ao digitar mesmo em livros inteiros com dezenas de milhares de palavras.",
              "Writtt is a native desktop app built with Go and Wails — delivering instant keystroke responsiveness even in book-length manuscripts.",
              "Aplicacion nativa construida con Go y Wails para respuesta instantanea incluso en libros extensos."
            ),
          })}
        </div>
      `;

    case "chapters":
      return `
        ${guideHero(
          t("ORGANIZACAO DE OBRAS LONGAS · VERSIONAMENTO", "LONG-FORM ORGANIZATION · VERSIONING", "ORGANIZACION Y VERSIONES"),
          t(
            "Escreva livros, teses e dossies sem medo de perder nenhuma versao.",
            "Write books, theses, and case files without ever losing a draft.",
            "Escribe libros, tesis e informes sin temor a perder ninguna version."
          ),
          t(
            "Textos grandes precisam de estrutura. O Writtt monta seu sumario sozinho, permite criar rascunhos paralelos para testar mudancas lado a lado e guarda fotografias completas do texto para voce comparar o que mudou.",
            "Long works demand structure. Writtt builds your chapter outline automatically, lets you test rewrites side-by-side in parallel drafts, and saves full snapshots so you can compare or restore past versions anytime.",
            "Writtt genera tu indice automaticamente, permite probar borradores lado a lado y guarda versiones completas para restaurar cuando quieras."
          ),
          `<button class="writtt-btn writtt-btn-sm" data-hgo="new-doc">${matzIcon("columns", 12)} <span>${t("Abrir Editor", "Open Editor", "Abrir Editor")}</span></button>`
        )}

        <div class="writtt-guide-grid">
          ${guideFeatureCard({
            icon: "layers",
            title: t("Navegador Automatico de Capitulos e Meta de Palavras", "Automatic Chapter Navigator & Word Goals", "Navegador de Capitulos y Meta de Palabras"),
            techBadge: t("SUMARIO H1 / H2 / H3", "AUTO OUTLINE", "INDICE AUTOMATICO"),
            whatItDoes: t(
              "Transforma automaticamente cada titulo e subtitulo do seu texto em um sumario clicavel com a contagem exata de palavras de cada capitulo e o tempo estimado de leitura.",
              "Automatically turns every heading and subheading in your text into a clickable table of contents with per-chapter word counts and estimated reading time.",
              "Convierte cada titulo y subtitulo en un indice interactivo con conteo de palabras por capitulo."
            ),
            howToUse: t(
              "Dentro do editor, clique no botao 'Painel' no canto superior direito -> aba 'Sumario'. Clique em qualquer capitulo para pular direto ate ele.",
              "Inside the editor, click 'Panel' at the top right -> 'Outline' tab, then click any chapter to jump straight to it.",
              "En el editor abre 'Panel' -> 'Indice' y haz clic en cualquier capitulo para saltar a el."
            ),
            techPlainExplanation: t(
              "Voce tambem pode organizar documentos em arvore Pai e Filho (por exemplo: uma pasta/obra 'Meu Romance' contendo varios documentos filhos 'Capitulo 1', 'Capitulo 2') sem criar ciclos confusos.",
              "You can also nest child documents under a parent work (e.g. a main book with separate chapter documents) in a clean hierarchical tree.",
              "Tambien puedes anidar subdocumentos debajo de una obra principal formando una jerarquia ordenada."
            ),
          })}

          ${guideFeatureCard({
            icon: "split-horizontal",
            title: t("Subcapitulos em Branco vs. Criar Copia Independente", "Blank Sub-Chapters vs. Independent Copies", "Subcapitulos en Blanco vs. Copias Independientes"),
            techBadge: t("ESTRUTURA HIERARQUICA + COPIA", "SUB-CHAPTERS + DUPLICATE", "SUBCAPITULOS + COPIA"),
            whatItDoes: t(
              "Organiza sua obra com clareza total: 'Subcapitulo' cria uma nova parte em branco ligada dentro da obra original (sem duplicar tudo), enquanto 'Criar Copia' gera um documento separado com todo o texto atual caso voce queira trabalhar em outra frente.",
              "Keeps long works intuitive: 'Sub-Chapter' adds a fresh blank section nested inside your parent work (without duplicating everything), whereas 'Make Copy' creates a full standalone duplicate of the manuscript to explore another direction.",
              "'Subcapitulo' crea una nueva seccion en blanco vinculada dentro de la obra original, mientras 'Crear Copia' duplica todo el documento para trabajar de forma independiente."
            ),
            howToUse: t(
              "No topo do editor (ou na arvore 'Obras' a esquerda), clique em '+ Subcapitulo' para abrir uma pagina limpa vinculada a obra, use 'Ver Obra Pai' se quiser consultar a obra principal ao lado e 'Incorporar na Obra Principal' para anexar ao final. Para copiar toda a obra, clique em 'Criar Copia'.",
              "Click '+ Sub-Chapter' in the editor header (or in the left Works tree) to add a blank linked section, use 'Parent Ref' to view the main work alongside, and 'Append to Parent Work' when ready. To copy the entire document, click 'Make Copy'.",
              "Usa '+ Subcapitulo' para crear una parte nueva en blanco dentro de la obra, o 'Crear Copia' para duplicar todo el manuscrito."
            ),
            techPlainExplanation: t(
              "Subcapitulos herdam automaticamente as etiquetas e a protecao de Cofre da obra pai. E quando voce compara versoes ou consulta a Obra Pai, o comparador visual ('Diff') destaca em verde o que entrou e em vermelho o que saiu.",
              "Sub-chapters automatically inherit tags and Vault encryption from their parent work, and the built-in 'Diff' viewer highlights every added or removed word in two colors.",
              "Los subcapitulos heredan automaticamente las etiquetas y el cifrado de Boveda de su obra principal."
            ),
          })}

          ${guideFeatureCard({
            icon: "git-commit",
            title: t("Linha do Tempo de Versoes Salvas (Snapshots)", "Saved Version Timeline (Snapshots)", "Historial de Versiones Guardadas"),
            techBadge: t("HISTORICO RESTAURAVEL", "VERSION SNAPSHOTS", "HISTORIAL DE VERSIONES"),
            whatItDoes: t(
              "Enquanto o salvamento automatico protege suas ultimas palavras digitadas, o botao Salvar (Ctrl+S) congela uma 'fotografia numerada' (v1, v2, v3...) para voce poder voltar no tempo quando quiser.",
              "While auto-save protects your latest keystrokes, pressing Save (Ctrl+S) freezes a numbered milestone (v1, v2, v3...) that you can compare or restore at any time.",
              "Presionar Guardar (Ctrl+S) congela una version numerada (v1, v2, v3...) a la que puedes volver en cualquier momento."
            ),
            howToUse: t(
              "Pressione Ctrl+S ao concluir uma etapa importante. Para ver ou restaurar versoes antigas, abra 'Painel' -> aba 'Versoes' e clique em 'Diff' ou 'Restaurar'.",
              "Press Ctrl+S whenever you finish an important draft. Open 'Panel' -> 'History' tab to compare or restore any earlier version.",
              "Pulsa Ctrl+S en momentos clave y abre 'Panel' -> 'Historial' para comparar o restaurar versiones."
            ),
            techPlainExplanation: t(
              "Se a obra pertencer ao Cofre Protegido, cada versao antiga do historico tambem fica trancada e embaralhada pela sua senha — nenhuma versao anterior fica desprotegida no computador.",
              "If a manuscript is in your Protected Vault, every historical version snapshot is encrypted with your password as well — leaving zero unencrypted copies behind.",
              "Si la obra esta en la Boveda, todas sus versiones anteriores tambien se guardan cifradas."
            ),
          })}
        </div>
      `;

    case "vault":
      return `
        ${guideHero(
          t("SEGURANCA EXPLICADA DE FORMA SIMPLES · COFRE PESSOAL", "PLAIN-LANGUAGE SECURITY · PERSONAL VAULT", "SEGURIDAD EXPLICADA EN SIMPLE · BOVEDA"),
          t(
            "Algumas coisas nao sao para ninguem. Entenda cada camada de protecao.",
            "Some things aren't meant for anyone else. Every layer explained.",
            "Algunas cosas son solo para ti. Cada capa explicada en simple."
          ),
          t(
            "Se alguem pegar seu notebook emprestado, copiar seu HD ou invadir sua pasta de documentos, os textos guardados no Cofre do Writtt aparecem apenas como embaralhamento matematico impossivel de ler sem a sua senha. Veja exatamente o que cada recurso faz por voce:",
            "Even if someone borrows your laptop or copies your hard drive, manuscripts inside Writtt's Vault appear only as unreadable mathematical noise without your password. Here is what each protection tool does in plain words:",
            "Incluso si alguien accede fisicamente a tu disco duro, los textos dentro de la Boveda son matematicamente ilegibles sin tu contrasena."
          ),
          `<button class="matz-btn matz-btn-primary writtt-btn-sm" data-hgo="settings-security">${matzIcon("shield-check", 12)} <span>${t("Configurar Meu Cofre Agora", "Set Up My Vault Now", "Configurar Mi Boveda Ahora")}</span></button>`
        )}

        <div class="writtt-guide-grid">
          ${guideFeatureCard({
            icon: "lock",
            title: t("Cofre Pessoal e Senha Mestra", "Personal Vault & Master Password", "Boveda Personal y Contrasena Maestra"),
            techBadge: t("AES-256-GCM + ARGON2ID", "AES-256-GCM + ARGON2ID", "AES-256-GCM + ARGON2ID"),
            whatItDoes: t(
              "Permite trancar qualquer livro inedito, diario pessoal, prontuario, contrato sob sigilo ou investigacao com uma Senha Mestra que so voce conhece.",
              "Lets you lock any unpublished book, private journal, client record, NDA contract, or research file with a Master Password known only to you.",
              "Te permite cerrar bajo llave cualquier libro inedito, diario, expediente o contrato confidencial."
            ),
            howToUse: t(
              "Vá em Configuracoes -> Cofre & Seguranca e crie sua Senha Mestra. Depois, clique no cadeado de qualquer documento para tranca-lo no Cofre, ou aperte Ctrl+L quando sair da frente do computador.",
              "Go to Settings -> Vault & Security to set your Master Password. Then click the padlock on any document to seal it in the Vault, and press Ctrl+L whenever you step away.",
              "Ve a Configuracion -> Boveda y Seguridad para crear tu Contrasena Maestra y usa el candado en cualquier obra."
            ),
            techPlainExplanation: t(
              "O que sao Argon2id e AES-256-GCM? Sao dois guardioes trabalhando juntos: (1) O Argon2id transforma sua senha em uma chave secreta exigindo memoria pesada a cada tentativa — alem disso, o Writtt impoe espera obrigatoria progressiva (20 segundos no 2o erro e 60 segundos a partir do 3o erro, mesmo que fechem e abram o programa) e verificacao de presenca humana contra robos de tentativa automatica, sem exibir dicas na tela de bloqueio. (2) O AES-256-GCM (padrao usado por bancos e governos) embaralha cada letra do arquivo no disco e avisa imediatamente se alguem tentar adulterar o arquivo.",
              "What are Argon2id and AES-256-GCM? Think of them as two bodyguards: (1) Argon2id turns your password into a cryptographic key using dedicated memory, reinforced by persistent progressive lockouts (20s on the 2nd wrong attempt and 60s from the 3rd onward, surviving app restarts), zero-hint lock screens, and tactile human-presence verification against automated scripts. (2) AES-256-GCM scrambles every byte on disk and detects any tampering.",
              "Argon2id blinda tu contrasena junto con bloqueos progresivos persistentes (20s al 2o error y 60s desde el 3er error incluso al reiniciar) y verificacion humana contra scripts automaticos, mientras AES-256-GCM cifra cada palabra en el disco."
            ),
          })}

          ${guideFeatureCard({
            icon: "key",
            title: t("PIN Numerico Rapido + Chave de Recuperacao + 2FA", "Quick Numeric PIN + Recovery Key + 2FA", "PIN Rapido + Clave de Recuperacion + 2FA"),
            techBadge: t("CONVENIENCIA + PLANO B", "DAILY ACCESS + BACKUP PLAN", "ACCESO DIARIO + PLAN B"),
            whatItDoes: t(
              "Digitar uma senha longa dezenas de vezes por dia cansa. Por isso o Writtt combina praticidade diaria (PIN curto), um salva-vidas caso voce esqueca a senha (Chave de Recuperacao) e protecao extra pelo celular (2FA).",
              "Typing a long password all day is tiring. Writtt pairs daily speed (Quick PIN), an offline safety net if you ever forget your password (Recovery Key), and optional phone verification (2FA).",
              "Combina rapidez diaria (PIN corto), un salvavidas si olvidas tu contrasena (Clave de Recuperacion) y verificacion movil opcional (2FA)."
            ),
            howToUse: t(
              "Em Configuracoes -> Cofre & Seguranca: (1) cadastre um PIN de 4 a 8 numeros para destrancar com Enter no dia a dia; (2) gere e anote em papel sua Chave de Recuperacao; (3) opcionalmente ative a verificacao em 2 etapas.",
              "In Settings -> Vault & Security: (1) set a 4-8 digit PIN for fast daily Enter unlock; (2) generate and write down your Recovery Key on paper; (3) optionally enable 2-step authenticator codes.",
              "En Configuracion -> Boveda y Seguridad configura tu PIN de 4 a 8 digitos y guarda impresa tu Clave de Recuperacion."
            ),
            techPlainExplanation: t(
              "Por que a Chave de Recuperacao e tao importante? Como o Writtt nao tem servidor nem cadastro de e-mail ('Zero-Knowledge', conhecimento zero por parte do fabricante), nos nao temos copia da sua senha. A Chave de Recuperacao e um codigo reserva matematico gerado na sua maquina para voce nunca ficar trancado para fora. Ja o 2FA (TOTP) usa aplicativos como Google Authenticator para gerar codigos de 6 digitos que mudam a cada 30 segundos, mesmo com o celular sem internet.",
              "Why does the Recovery Key matter? Because Writtt has no company server or email account ('Zero-Knowledge'), nobody else holds a copy of your password. Your printed Recovery Key is your personal master spare key. Optional 2FA (TOTP) pairs with apps like Google Authenticator or 1Password to generate 6-digit codes every 30 seconds completely offline.",
              "Como Writtt no tiene servidores ni correo para recuperar contrasenas, la Clave de Recuperacion impresa es tu llave maestra de respaldo."
            ),
          })}

          ${guideFeatureCard({
            icon: "certificate",
            title: t("Certificado de Autoria, Envelopes Lacrados & Trilha Antifraude", "Authorship Certificates, Sealed Envelopes & Tamper-Proof Trail", "Certificados de Autoria, Sobres y Registro Antifraude"),
            techBadge: t("SHA-256 · FORENSICCHAIN · RSA · ZKP", "SHA-256 · FORENSICCHAIN · RSA · ZKP", "SHA-256 · FORENSICCHAIN · RSA · ZKP"),
            whatItDoes: t(
              "Vai enviar seu livro para uma editora, roteiro para produtora ou relatorio confidencial para um cliente? Gere um Certificado de Autoria que comprova a data, contagem de palavras e integridade exata da obra em nome do seu @alias.",
              "Sending an unpublished manuscript to a publisher, producer, or client? Issue an Authorship Certificate proving the exact text state, date, and your @alias signature.",
              "Emite un Certificado de Autoria fechado con tu @alias antes de compartir una obra inedita con terceros."
            ),
            howToUse: t(
              "No editor, abra 'Painel' -> aba 'Versoes' -> 'Emitir Certificado de Autoria'. Para guardar trechos ultra-confidenciais em capsulas separadas, use Configuracoes -> Writtt Express.",
              "In the editor, open 'Panel' -> 'History' -> 'Issue Authorship Certificate'. To lock confidential excerpts inside standalone capsules, open Settings -> Writtt Express.",
              "En el editor ve a 'Panel' -> 'Historial' para emitir tu certificado, o usa Writtt Express para sellar sobres confidenciales."
            ),
            techPlainExplanation: t(
              "Traduzindo cada sigla: (1) Hash SHA-256 e uma 'impressao digital unica' do seu texto — se mudarem uma unica virgula, o codigo muda inteiro. (2) ForensicChain encadeia cada salvamento como elos de uma corrente: ninguem consegue alterar o passado sem quebrar o elo. (3) Envelope RSA-2048 funciona como uma caixa-correio com fenda: qualquer nota lacrada ali so abre com sua chave privada. (4) Prova ZKP (Conhecimento Zero) permite provar matematicamente que a chave e sua sem mostrar sua senha para ninguem.",
              "Plain-English breakdown: (1) SHA-256 creates a unique mathematical fingerprint of your manuscript — changing a single comma changes the fingerprint completely. (2) ForensicChain links events like chain links so history cannot be silently altered. (3) RSA-2048 Envelopes work like a locked dropbox that only your private key can open. (4) Zero-Knowledge Proof (ZKP) mathematically proves you own the key without ever revealing your secret.",
              "SHA-256 crea una huella digital unica de tu texto; ForensicChain encadena el historial contra alteraciones; RSA-2048 sella sobres privados y ZKP demuestra posesion sin revelar tu clave."
            ),
          })}
        </div>
      `;

    case "ai":
      return `
        ${guideHero(
          t("INTELIGENCIA ARTIFICIAL NO SEU HARDWARE · ZERO NUVEM", "AI ON YOUR OWN HARDWARE · ZERO CLOUD", "IA EN TU PROPIO EQUIPO · CERO NUBE"),
          t(
            "Um assistente editorial que trabalha para voce — sem contar nada para a internet.",
            "An editorial assistant that works for you — without telling the internet a thing.",
            "Un asistente editorial que trabaja para ti — sin enviar nada a internet."
          ),
          t(
            "Servicos de IA online leem seus textos em servidores distantes. No Writtt, o assistente de escrita conversa apenas com modelos instalados gratuitamente no seu proprio computador atraves do Ollama. Suas ideias continuam 100% privadas.",
            "Cloud AI services process your manuscripts on corporate servers. Writtt connects strictly to language models running locally on your own machine via Ollama — keeping every word private.",
            "Writtt se conecta unicamente a modelos instalados en tu propia computadora mediante Ollama, manteniendo cada palabra privada."
          ),
          `<button class="matz-btn matz-btn-primary writtt-btn-sm" data-hgo="open-ai-direct">${matzIcon("cpu", 12)} <span>${t("Abrir Assistente IA no Editor", "Open AI Assistant in Editor", "Abrir Asistente IA")}</span></button>`
        )}

        <div class="writtt-guide-grid">
          ${guideFeatureCard({
            icon: "sparkles",
            title: t("Janela Flutuante no Palco (/ai) e Destaque Temporario no Texto", "Draggable Stage AI Window (/ai) & Temporary Diff Highlight", "Ventana Flotante (/ai) y Resaltado Temporal"),
            techBadge: t("EDICAO ASSISTIDA NO PALCO", "INLINE STAGE AI", "IA EN EL ESCENARIO"),
            whatItDoes: t(
              "Selecione qualquer paragrafo e peca para a IA melhorar a clareza, resumir, expandir com mais detalhes ou corrigir a gramatica. A janela separa claramente o comentario da IA do texto pronto para usar.",
              "Select any paragraph and ask AI to polish clarity, summarize, expand descriptions, or fix grammar. The floating window cleanly separates editorial commentary from ready-to-insert prose.",
              "Selecciona cualquier parrafo para mejorar claridad, resumir, expandir o corregir gramatica separando la opinion del texto final."
            ),
            howToUse: t(
              "Selecione um trecho no editor e clique em 'IA' (ou digite /ai). Voce pode arrastar, redimensionar ou encaixar a janela nos cantos do palco. Ao clicar em 'Substituir Trecho', o novo texto brilha em verde por alguns segundos no documento para voce conferir a mudanca, vira historico e a janela volta limpa mantendo o tamanho e posicao que voce escolheu.",
              "Highlight text and click 'IA' (or type /ai). Drag, resize, or snap the window to any corner. Clicking 'Replace Selection' flashes the updated passage in green for a few seconds right in your manuscript, saves the turn to history, and resets the window while keeping your chosen position and size.",
              "Selecciona texto y pulsa 'IA'. Arrastra o redimensiona la ventana libremente; al reemplazar, el texto nuevo se ilumina unos segundos en el documento y se guarda en el historial."
            ),
            techPlainExplanation: t(
              "O destaque colorido temporario no corpo do documento usa uma camada visual pura do editor: ele ilumina o trecho alterado para seus olhos conferirem a mudanca e desaparece sozinho apos alguns segundos sem sujar seu arquivo com marcacoes extras.",
              "The temporary diff highlight uses a pure visual overlay layer in the editor — illuminating what changed for a few seconds and fading away cleanly without adding stray formatting marks to your file.",
              "El resaltado temporal ilumina el cambio unos segundos sin ensuciar el formato real de tu archivo."
            ),
          })}

          ${guideFeatureCard({
            icon: "shield",
            title: t("Estudio IA Dedicado: Chatbot, Encaminhamento ao Editor IA & 2o Monitor", "Dedicated AI Studio: Chatbot, Forward to Editorial AI & 2nd Monitor", "Estudio IA Dedicado: Chatbot, Envio al Editor IA y 2o Monitor"),
            techBadge: t("CHATBOT -> EDITOR IA + MULTI-MONITOR", "CHATBOT -> EDITORIAL AI + MULTI-MONITOR", "CHATBOT -> EDITOR IA + MULTI-MONITOR"),
            whatItDoes: t(
              "O Estudio IA & RAG agora possui seu proprio painel independente (separado do Painel de Sumario/Versoes/Exportacao). Nele voce conversa naturalmente no 'Chatbot' com historico visual fluido estilo Antigravity, seleciona uma ou mais respostas para encaminhar ao 'Editor IA' aplicar no manuscrito, e pode destacar a janela sobre o palco ou arrasta-la para um segundo monitor.",
              "AI & RAG Studio now has its own dedicated panel (separate from Outline/History/Export). Brainstorm in 'Chatbot' with an Antigravity-style conversational timeline, select one or more replies to forward as context to 'Editorial AI', and detach the studio either floating over Writtt or into a standalone OS window on a second monitor.",
              "El Estudio IA y RAG tiene su propio panel independiente: conversa en el 'Chatbot', selecciona una o mas respuestas para enviarlas al 'Editor IA' y destaca la ventana sobre la pantalla o hacia un segundo monitor."
            ),
            howToUse: t(
              "Clique em 'IA / RAG' no topo do editor. No Chatbot, marque uma ou varias respostas em 'Selecionar p/ Editor' e clique em 'Encaminhar p/ Editor IA' para que o Editor IA interprete a conversa e gere as alteracoes do texto. Use os botoes no topo do Estudio IA para destacar sobre a janela ou abrir em janela independente (2o monitor).",
              "Click 'IA / RAG' in the editor header. In Chatbot, mark one or multiple replies via 'Select for Editor' and click 'Send to Editorial AI' so Editorial AI applies those insights to your manuscript. Use the header icons to float over the app or pop out to a 2nd-monitor OS window.",
              "Haz clic en 'IA / RAG', selecciona respuestas del Chatbot para enviarlas al Editor IA o abre el Estudio en ventana independiente para tu segundo monitor."
            ),
            techPlainExplanation: t(
              "E o que significa a chave 'RAG' no compositor? RAG significa 'consultar suas proprias anotacoes': quando marcada, o Writtt procura automaticamente nos seus outros documentos abertos trechos parecidos com o assunto atual para dar contexto a IA — sem nunca ler obras trancadas no Cofre e mantendo conversas de obras do Cofre apenas na memoria temporaria ate voce fechar o app.",
              "What does the 'RAG' toggle mean? It lets local AI consult relevant passages across your other unlocked Writtt documents for continuity — while strictly excluding locked Vault works and keeping Vault chats in temporary memory only.",
              "La opcion 'RAG' permite que la IA consulte pasajes relevantes de tus otras obras abiertas sin tocar obras bloqueadas en la Boveda."
            ),
          })}
        </div>
      `;

    case "publish":
      return `
        ${guideHero(
          t("PUBLICACAO PROFISSIONAL · ARQUIVOS & BACKUPS", "PUBLISHING · SEALED FILES & BACKUPS", "PUBLICACION · ARCHIVOS Y RESPALDOS"),
          t(
            "Do rascunho secreto ao livro pronto para leitores digitais.",
            "From private draft to bookstore-ready e-book and encrypted backups.",
            "Del borrador privado al e-book listo para lectores y respaldos seguros."
          ),
          t(
            "Quando chegar a hora de compartilhar seu trabalho — ou de guardar uma copia de seguranca em um pendrive — o Writtt gera livros digitais completos e pacotes blindados em poucos cliques.",
            "When you are ready to publish — or save an external backup on a USB drive — Writtt exports standard e-books, clean web pages, and encrypted archive bundles in seconds.",
            "Cuando quieras publicar o guardar una copia en una memoria USB, Writtt genera libros digitales y paquetes cifrados en segundos."
          ),
          `<button class="matz-btn matz-btn-primary writtt-btn-sm" data-hgo="settings-drive">${matzIcon("hard-drive", 12)} <span>${t("Abrir Cofre de Arquivos & Backups", "Open File Vault & Backups", "Abrir Archivos y Respaldos")}</span></button>`
        )}

        <div class="writtt-guide-grid">
          ${guideFeatureCard({
            icon: "bookmark",
            title: t("Exportacao Direta para Kindle / Kobo (EPUB 3.0), HTML5 e Markdown", "Direct Export to Kindle / Kobo (EPUB 3.0), HTML5 & Markdown", "Exportacion a EPUB 3.0, HTML5 y Markdown"),
            techBadge: t("EPUB 3.0 · HTML5 · .MD", "EPUB 3.0 · HTML5 · .MD", "EPUB 3.0 · HTML5 · .MD"),
            whatItDoes: t(
              "Transforma seu manuscrito em um arquivo de livro digital (.epub) pronto para enviar ao Kindle, Apple Books, Kobo ou plataformas de autopublicacao, ou em uma pagina HTML limpa pronta para imprimir em PDF.",
              "Turns your manuscript into a standard e-book (.epub) ready for Kindle, Kobo, Apple Books, and self-publishing platforms, or a clean HTML5 page ready to print to PDF.",
              "Convierte tu manuscrito en un libro digital (.epub) listo para Kindle, Kobo y Apple Books, o en HTML5 listo para imprimir."
            ),
            howToUse: t(
              "Com a obra aberta no editor, va no menu superior 'Arquivo -> Exportar' (ou abra 'Painel -> Exportar') e escolha EPUB 3.0, HTML5 ou Markdown.",
              "With your manuscript open, choose 'File -> Export' in the top menu (or 'Panel -> Export') and select EPUB 3.0, HTML5, or Markdown.",
              "Con tu obra abierta elige 'Archivo -> Exportar' y selecciona EPUB 3.0, HTML5 o Markdown."
            ),
            techPlainExplanation: t(
              "O Writtt monta internamente toda a estrutura exigida pelas livrarias digitais (capa textual, ficha catalografica interna e indice navegavel de capitulos) sem precisar instalar conversores externos.",
              "Writtt builds the complete e-book package internally (metadata manifest and navigable chapter table of contents) with zero external converters required.",
              "Writtt construye internamente toda la estructura e indice navegable exigidos por las tiendas de e-books."
            ),
          })}

          ${guideFeatureCard({
            icon: "archive",
            title: t("Cofre de Arquivos Anexos e Backup Completo (.writttpack)", "Encrypted File Locker & Full Library Backup (.writttpack)", "Boveda de Archivos y Respaldo (.writttpack)"),
            techBadge: t("DRIVE LOCAL E2EE + .WRITTTPACK", "LOCAL E2EE DRIVE + .WRITTTPACK", "DRIVE E2EE + .WRITTTPACK"),
            whatItDoes: t(
              "Alem dos textos, um escritor muitas vezes precisa esconder PDFs de pesquisa, contratos assinados, fotos de documentos ou artes de capa. O Drive E2EE tranca qualquer arquivo avulso, enquanto o .writttpack empacota toda a sua biblioteca num unico arquivo de backup protegido por senha.",
              "Writers often need to protect research PDFs, signed contracts, reference photos, or cover art alongside their texts. The E2EE Drive locks arbitrary files, while .writttpack bundles your entire library into a single password-protected backup file.",
              "Protege PDFs de investigacion, contratos o portadas en el Drive E2EE y respalda toda tu biblioteca en un unico archivo .writttpack."
            ),
            howToUse: t(
              "Abra Configuracoes -> Drive E2EE & Backups. Clique em 'Selar Novo Arquivo' para guardar documentos anexos, ou digite uma frase-senha e clique em 'Exportar Cofre' para salvar seu backup .writttpack em um pendrive ou HD externo.",
              "Open Settings -> E2EE Drive & Backups. Click 'Seal New File' to lock attachments, or enter a passphrase and click 'Export Archive' to save your .writttpack backup onto a USB drive.",
              "Abre Configuracion -> Drive E2EE y Respaldos para sellar archivos adjuntos o exportar tu paquete .writttpack."
            ),
            techPlainExplanation: t(
              "Mesmo que voce guarde esse arquivo .writttpack em um pendrive ou servico externo para nao perder em caso de defeito no computador, ninguem conseguira abrir o pacote sem a frase-senha que voce definiu na hora de exportar.",
              "Even if you store that .writttpack file on a USB stick or external backup disk for disaster recovery, its contents remain completely unreadable without your export passphrase.",
              "Incluso si guardas el archivo .writttpack en una memoria externa, nadie podra abrirlo sin tu frase de contrasena."
            ),
          })}
        </div>
      `;

    default:
      return `
        ${guideHero(
          t("PRODUTIVIDADE · OPERACAO PELO TECLADO", "PRODUCTIVITY · KEYBOARD-FIRST WORKFLOW", "PRODUCTIVIDAD · ATAJOS DE TECLADO"),
          t(
            "Atalhos pensados para voce nunca perder o fio do pensamento.",
            "Shortcuts designed so you never lose your train of thought.",
            "Atajos pensados para que nunca pierdas el hilo de tus ideas."
          ),
          t(
            "Todos os paineis, janelas flutuantes e menus do Writtt respondem ao teclado. Use ESC a qualquer momento para fechar sobreposicoes e Ctrl+K para acessar qualquer acao em um segundo.",
            "Every panel, floating window, and menu in Writtt responds to the keyboard. Press ESC anytime to dismiss overlays, and Ctrl+K to reach any command in a split second.",
            "Todos los paneles y ventanas flotantes responden al teclado. Usa ESC para cerrar superposiciones y Ctrl+K para cualquier comando."
          ),
          `<button class="writtt-btn writtt-btn-sm" data-hgo="open-palette">${matzIcon("command", 12)} <span>${t("Testar Paleta Rapida (Ctrl+K)", "Open Command Palette (Ctrl+K)", "Abrir Paleta (Ctrl+K)")}</span></button>`
        )}

        <div class="writtt-card writtt-mb-0">
          <table class="matz-table writtt-full-table">
            <thead>
              <tr>
                <th>${t("Atalho", "Shortcut", "Atajo")}</th>
                <th>${t("O que faz na pratica", "What it does", "Que hace")}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td class="writtt-mono"><b>Ctrl + K</b></td><td>${t("Abre a busca rapida de comandos para criar obras, trancar o app ou navegar para qualquer tela", "Opens the quick command launcher to create works, lock the app, or jump anywhere", "Abre el buscador rapido de comandos")}</td></tr>
              <tr><td class="writtt-mono"><b>Ctrl + N</b></td><td>${t("Cria imediatamente um novo manuscrito limpo no editor", "Immediately creates a clean new manuscript in the editor", "Crea un nuevo manuscrito limpio")}</td></tr>
              <tr><td class="writtt-mono"><b>Ctrl + S</b></td><td>${t("Salva uma nova versao numerada no historico da obra atual", "Saves a numbered version milestone in the current manuscript's history", "Guarda una version numerada en el historial")}</td></tr>
              <tr><td class="writtt-mono"><b>Ctrl + L</b></td><td>${t("Tranca imediatamente o Writtt e limpa senhas/conversas do cofre da memoria", "Immediately locks Writtt and clears vault keys & ephemeral chats from memory", "Bloquea Writtt al instante y limpia la memoria")}</td></tr>
              <tr><td class="writtt-mono"><b>Alt + Z</b></td><td>${t("Liga ou desliga o Modo Zen (esconde barras laterais e menus para foco total)", "Toggles Zen Mode (hides sidebars and menus for distraction-free writing)", "Activa o desactiva el Modo Zen")}</td></tr>
              <tr><td class="writtt-mono"><b>Ctrl + \\</b></td><td>${t("Mostra ou recolhe a arvore lateral esquerda de documentos dentro do editor", "Shows or collapses the left document tree inside the editor", "Muestra u oculta la barra lateral de documentos")}</td></tr>
              <tr><td class="writtt-mono"><b>Ctrl + ,</b></td><td>${t("Abre a tela de Configuracoes, Cofre, Temas e Backups", "Opens Settings, Vault, Themes, and Backups", "Abre Configuracion y Boveda")}</td></tr>
              <tr><td class="writtt-mono"><b>/</b></td><td>${t("No editor, abre o menu de insercao rapida (/task, /table, /draw, /ai, /h1...)", "Inside the editor, opens quick slash insertion (/task, /table, /draw, /ai, /h1...)", "Abre el menu rapido / en el editor")}</td></tr>
              <tr><td class="writtt-mono"><b>F1</b></td><td>${t("Abre este Guia do Autor de qualquer lugar do aplicativo", "Opens this Author Guide from anywhere in the app", "Abre esta Guia del Autor")}</td></tr>
              <tr><td class="writtt-mono"><b>ESC</b></td><td>${t("Fecha menus, janela flutuante de IA, paineis laterais ou sai do Modo Zen", "Closes menus, the floating AI window, side panels, or exits Zen Mode", "Cierra menus, ventanas flotantes o sale de Modo Zen")}</td></tr>
            </tbody>
          </table>
        </div>
      `;
  }
}
