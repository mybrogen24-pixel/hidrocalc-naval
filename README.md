# HidroCalc Naval

Aplicativo web para o AP1.1 de Arquitetura Naval. Processa uma tabela de cotas para calcular propriedades hidrostáticas, gerar a Hydrostatic Table, exibir curvas e registrar a auditoria numérica. O núcleo continua em HTML, CSS e JavaScript; o Streamlit funciona somente como camada de hospedagem.

## Executar localmente

```bash
python -m pip install -r requirements.txt
streamlit run streamlit_app.py
```

O comando abre o HidroCalc no endereço local informado pelo Streamlit. Como alternativa de desenvolvimento puramente estática, execute `python -m http.server 4173` na pasta do projeto e abra `http://127.0.0.1:4173/index.html`.

## Deploy

1. Crie um repositório no GitHub e envie todos os arquivos deste projeto, incluindo `vendor/` e `data/`.
2. Abra o Streamlit Community Cloud e selecione **Create app**.
3. Escolha o repositório e a branch `main`.
4. Informe `streamlit_app.py` como arquivo principal.
5. Selecione **Deploy**.

O projeto não requer tokens, senhas ou outros secrets. Não adicione credenciais ao repositório.

### Camada de hospedagem Streamlit

`streamlit_app.py` lê tudo relativamente a `Path(__file__).parent`. Os cinco CSS são incorporados em uma única tag `<style>` e os scripts são incorporados na ordem `Pako → viewer3d.js → offset-importer.js → app.js`; as tags externas equivalentes são removidas, evitando execução duplicada. O documento autossuficiente é entregue a `st.iframe()` como `srcdoc`, com fallback para `components.html()` em versões antigas do Streamlit. Os três modelos CSV de `data/` viram URLs `data:` para que seus botões de download funcionem dentro do componente sem `fetch`, `localhost` ou `file://`. O upload principal permanece o `<input type="file">` do navegador e continua processando CSV, TSV, TXT, DAT e XLSX inteiramente no frontend.

O componente usa layout largo, 1.500 px de altura inicial e rolagem interna. Canvas, WebGL, órbita, pan, zoom, DPR e observadores de redimensionamento permanecem sob responsabilidade do frontend existente.

## Arquitetura do 3D

O visualizador foi separado explicitamente em duas camadas:

| Camada | Fonte | Usos |
|---|---|---|
| **Geometria numérica** | offsets originais e `valueAt()` com interpolação linear rastreada | áreas, volumes, momentos, WSA, estabilidade, Hydrostatic Table, auditoria e validações |
| **Geometria visual** | os mesmos offsets; PCHIP adaptativa para cascos suaves ou faces lineares por offsets equivalentes em `hard chine` | superfície, balizas, linhas d'água e planos de linhas |

`viewer3d.js` é um renderizador WebGL local: não usa Three.js, OrbitControls, CDN ou dependência de rede. Ele mantém buffers de GPU e usa `requestAnimationFrame` sob demanda: solicita um frame quando câmera, opções, dados, plano d’água ou tamanho do canvas mudam; quando a câmera termina a interpolação, não mantém um loop de renderização em repouso. O `ResizeObserver` próprio do viewer cuida de tamanho e o DPR é limitado a 1,5 na visualização normal. As famílias de curvas visíveis são filtradas e armazenadas quando a opção ou densidade muda, nunca em todo frame. A câmera tem alvo no centro geométrico, damping independente da taxa de atualização (resposta direta durante o arraste), órbita, zoom, pan, enquadramento e vistas padrão; o gizmo fixo informa X/Y/Z e as convenções Proa/Popa e BE/BB.

O painel abaixo do viewer mostra a telemetria de renderização disponível no navegador: FPS recente, milissegundos por frame, draw calls, vértices e curvas visíveis. É uma métrica da representação visual; não participa de cálculo hidrostático. `preserveDrawingBuffer` foi mantido como estava, pois a otimização deve ser validada no navegador com WebGL do equipamento-alvo antes de alterar a estratégia de captura.

Os modos são **Superfície**, **Superfície + curvas** (padrão), **Somente curvas**, **Curvas completas**, **X-ray** e **Depuração geométrica**. No modo padrão a superfície é opaca, com teste de profundidade ativo: o lado oposto é ocultado e a leitura não fica “vazada”. X-ray é o modo explícito para transparência. O antigo “wireframe” foi convertido em **Curvas completas**: ele exibe apenas curvas navais, nunca as diagonais dos triângulos. A triangulação interna e os pontos de controle só aparecem em **Depuração geométrica**.

Quilha, chines, sheer, balizas, linhas d’água, longitudinais, offsets originais e plano de calado podem ser ligados separadamente. Grade, vetores globais, resolução, fairing visual e escala visual ficam em **Detalhes de visualização**, pois são recursos de diagnóstico/inspeção; permanecem disponíveis e grade, vetores globais e plano d’água começam desligados. Os controles de densidade vão de 0% a 100% para balizas, linhas d’água e longitudinais — sem chamar pontos internos da malha de “waterlines”. Mouse esquerdo orbita, scroll altera o zoom e botão direito ou `Shift` + arrastar faz pan. Duplo clique e **Enquadrar casco** redefinem o enquadramento.

O triedro fixo no canto inferior esquerdo é um overlay compacto de viewport que gira com a câmera. Ele é filho direto de `.viewer-canvas-wrap`, o wrapper exclusivo do canvas WebGL, e fica recortado por ele: não acompanha toolbars, telemetria nem outras áreas da página. Seu tamanho é `135 × 112 px` no desktop e `105 × 92 px` no mobile. Os vetores têm hastes, pontas de seta e cores reservadas: **X vermelho** (`#ff5c7a`), **Y azul-claro** (`#55c7ff`) e **Z verde** (`#45e3a3`). A legenda explicita a convenção física usada pela renderização: `+X` proa / `−X` popa, `+Y` boreste / `−Y` bombordo e `+Z` topo / `−Z` fundo. A opção **Vetores globais** cria os mesmos três vetores 3D, agora em escala discreta de 8,5% do maior comprimento do casco, na referência de origem visual da geometria. A transformação de escala visual não rotaciona nem inverte os eixos.

Para cascos suaves, a resolução visual é **adaptativa**, não uma quantidade fixa de painéis. `buildRenderGeometry()` usa todas as posições físicas `x` e todas as alturas normalizadas `u` dos offsets como âncoras obrigatórias; entre duas âncoras, só subdivide quando o ponto PCHIP de meio parâmetro se afasta mais que a tolerância visual da corda 3D. A tolerância relativa e a profundidade máxima variam com a opção baixa/média/alta e são escaladas pela maior dimensão do casco. Isso concentra amostras em proa, popa e regiões de maior curvatura, preservando estações longitudinalmente irregulares sem redistribuí-las. No modo `Quinas vivas / barcaça`, a resolução é deliberadamente a dos offsets: não há densificação longitudinal ou vertical.

As tangentes PCHIP usam o limitador de Fritsch–Carlson, o valor interpolado é limitado pelo intervalo dos controles locais e a semi-boca é limitada a `y ≥ 0`. Uma quebra de inclinação repetida em várias seções é classificada como **chine**: ela permanece âncora transversal e recebe grupo de normal próprio, enquanto regiões sem chine usam normais contínuas. No modo de quinas vivas, as normais são derivadas por face para manter chines, costados e fundo planos sem arredondamento visual. A geometria visual nunca altera offsets, fórmulas, resultados ou a lista oficial de interpolações numéricas. O cursor identifica **Offset original**, **Superfície visual interpolada** e outros pontos visuais.

## Entrada e convenções

`T` é a coordenada vertical **absoluta** do plano d’água na referência global `z` declarada no projeto; não é uma distância reiniciada em cada quilha local. Essa convenção é usada de forma idêntica em cálculo, Hydrostatic Table, planos e curvas. A opção “relativo à quilha local” do plano de balizas só transforma o desenho para leitura e nunca entra no núcleo numérico.

- Unidade interna: metro (m), metro quadrado (m²), metro cúbico (m³), tonelada (t) e t/cm.
- Coordenadas: `x` é a posição longitudinal declarada no formulário; `z` é a cota na referência vertical declarada; `y` é a semi-boca, com simetria de boreste (`+y`) e bombordo (`-y`). `z = 0` pode ser um datum, mas não é exigido como quilha global.
- CSV, TSV, TXT, DAT e XLSX: o app reconhece listas (`station,z,half_breadth`), matrizes de estações × linhas d'água, matrizes transpostas e cabeçalhos multinível de programas navais. Há exemplos em [`data/`](data/).
- Os dados originais são preservados. Interpolações são registradas com estação, cotas-limite, valor, método e fração `α`.

### Importador universal de offsets

O importador trabalha como uma sequência de candidatos, sem alterar a geometria numérica. Primeiro ele detecta regiões tabulares, separador CSV e cabeçalhos; depois avalia, em paralelo, formatos de lista, matriz larga, matriz transposta, triplet numérico e matriz naval com um a três cabeçalhos. Este último reconhece, por exemplo, `WL` como índice auxiliar, uma linha explícita `Z | 0 | 1 | ...`, uma coluna `BALIZA`, uma coluna `X` separada e uma matriz identificada por `MEIA BOCA`, `SEMI-BOCA`, `HALF BREADTH` ou `OFFSET`. Quando coexistem `WL` e `Z`, a cota explícita `Z` tem prioridade; `BALIZA` permanece apenas como identificador e `X` é preservado como posição longitudinal.

Cada candidato é normalizado para o formato canônico `station, z, half_breadth`. Quando esse cabeçalho aparece exatamente (sem unidade declarada), ele é o contrato interno documentado: `station = X`, `z = Z`, `half_breadth = semi-boca`, todos em **metros**. Uma unidade explícita no cabeçalho continua tendo prioridade. A inferência `m/mm/cm/ft/in` fica reservada aos formatos não canônicos sem unidade e só seleciona automaticamente uma hipótese quando a evidência dimensional é forte; hipóteses próximas exigem revisão.

A decisão é explícita: **automática**, **revisão necessária** ou **bloqueada** — ela não depende de um limiar mágico de confiança. Cabeçalhos, cobertura da matriz, coordenadas válidas, duplicatas, sinais de semi-boca e coerência de unidade formam diagnósticos independentes. Valores-padrão de `L`, `B` e `D` do formulário nunca participam dessa decisão; somente depois de o usuário editar explicitamente essas dimensões elas aparecem como uma conferência informativa, sem alterar o ranking, a unidade ou os offsets.

Uma linha física explícita `Z` válida elimina da disputa a linha `WL` auxiliar e leituras simplificadas do mesmo bloco de cabeçalhos; assim, `WL = 0, 1, …` não bloqueia a importação automática nem a geração do 3D quando `Z` define as cotas reais. Também é aceita a forma pareada `WL` + linha numérica de `Z` sem etiqueta, com coluna de `X` implícita junto à matriz. Interpretações estruturais realmente diferentes continuam apresentadas na prévia para confirmação. O painel **Importação detectada** mostra a decisão, qualidade estrutural, coerência geométrica, inferência de unidade, mapeamento, pré-verificação da malha e uma prévia dos offsets já convertidos.

O mapeamento assistido usa a mesma API do importador automático e permite escolher lista ou matriz `baliza/X × níveis Z`, coluna de etiqueta, coluna `X`, linha/coluna de `Z`, primeira coluna de offsets, tipo de largura e unidades. São aceitas unidades `m`, `mm`, `cm`, `ft` e `in`; quando o cabeçalho não declara uma unidade, todas as escalas são testadas como hipóteses e a selecionada é documentada — não há uma conversão silenciosa de “desconhecida = m”. Um cabeçalho que declare **boca completa** é dividido por dois de forma explícita. Célula vazia, `—`, `-`, `N/A` e texto inválido significam **dado ausente**, não zero: não são transformados em offsets e não unem curvas inexistentes. A opção de preencher zero só atua quando o usuário a escolhe expressamente; as demais lacunas seguem para as validações e para a interpolação numérica já existente, quando ela for matematicamente aplicável.

Em XLSX, as planilhas são avaliadas individualmente e vence o candidato com melhor confiança; as referências de linha físicas da planilha são preservadas, inclusive quando há linhas vazias antes da matriz. Colunas isoladas após uma lacuna não são incorporadas à matriz de cotas. CSV/TSV também detectam automaticamente vírgula, ponto e vírgula ou tabulação. O importador é determinístico e local: não usa IA, serviços externos ou um casco pré-programado. Formatos sem metadados suficientes continuam importáveis por confirmação ou pelo mapeamento, mas o aplicativo não inventa cotas, não extrapola uma tabela incompleta e não tenta interpretar formatos proprietários binários.

A implementação fica isolada em `offset-importer.js`, em sete etapas: grade bruta e regiões tabulares; semântica de cabeçalho; adaptadores de lista canônica, matriz larga, matriz transposta, cabeçalho multinível, `WL/Z` pareado, blocos por estação, blocos por linha d’água, BB/BE e triplets; hipóteses de unidade; diagnóstico geométrico; decisão explicável; e emissão dos offsets canônicos com a célula de origem. `app.js` apenas chama essa camada, aplica os offsets canônicos e faz a pré-verificação `leitura → parser → normalização → buildGeometry() → buildRenderGeometry() → viewer.setData()`. Cabeçalhos de um a três níveis aceitam, entre outras, as formas `BALIZA`, `X`, `WL`, `Z`, `MEIA BOCA`, `SEMI-BOCA`, `HALF BREADTH`, `OFFSET`, `BB`, `BE`, `PORT` e `STARBOARD`. Números em cabeçalho como `Z = 0,60 m` e `X: 12.5` também são reconhecidos sem tornar texto comum em dado numérico.

Tabelas BB/BE simétricas são reduzidas explicitamente a semi-boca. Se BB e BE diferirem, a importação é bloqueada: a prévia indica a assimetria e exige uma futura regra explícita, em vez de calcular uma média silenciosa. O XLSX é lido em todas as abas, com strings compartilhadas, células mescladas e valores de fórmula em cache. A associação `nome da aba → r:id → worksheet XML` é lida de `xl/workbook.xml` e `xl/_rels/workbook.xml.rels`; portanto, o parser não presume que a ordem de `sheetN.xml` seja a ordem das abas. A descompressão Deflate usa o arquivo local `vendor/pako_inflate.min.js` (Pako 2.1.0, licença MIT em `vendor/pako-LICENSE`), portanto continua offline mesmo onde `DecompressionStream` não existe.

## Fonte da verdade geométrica

A tabela de cotas define a geometria efetivamente usada no cálculo:

- `L_geometry = max(x) - min(x)`;
- `B_geometry = 2 × max(semi-boca)`;
- `D_geometry = max(z) - min(z)`.

LBP, B e D informados no formulário são controles de consistência. O aplicativo mostra suas diferenças absoluta e relativa em relação à geometria, mas não altera offsets automaticamente nem usa silenciosamente dimensões informadas nos coeficientes. `Cᴮ`, `Cᵂᴾ`, `Cᴹ` e `Cᴾ` usam `L_geometry` e `B_geometry`.

O calado é bloqueado quando ultrapassa o menor topo disponível entre as estações. Não há extrapolação automática. Abaixo da quilha **local** de uma estação, aquela seção e sua semi-boca no plano d’água valem zero, sem tentar extrapolar os offsets.

## Reconstrução visual do casco

`buildSectionGeometry()` é a única fonte da seção transversal **numérica** e dos diagnósticos, usada pelos planos de balizas e linhas d’água. Ela ordena os offsets verticalmente, replica apenas a simetria (`+y` boreste e `-y` bombordo) e usa interpolação linear somente nos níveis solicitados. A menor cota de cada baliza define `keelZ(x)`; não há condição de que toda estação contenha `z = 0`.

O loft WebGL recebe essas seções e usa uma coordenada transversal local `u` (de `0` no ponto inferior local a `1` no topo local). Assim, a linha `u = 0` usa a cota inferior local e nunca cria um plano horizontal em `z = 0`. A função visual `triangulateBottomSpan(ix)` classifica cada painel longitudinal de maneira independente:

- `keel-keel` (`b0 ≈ 0`, `b1 ≈ 0`): convergência natural BB/BE; não cria face extra;
- `flat-flat`: cria dois triângulos para o quadrilátero inferior real;
- `flat-keel`: cria um único triângulo até o ápice da quilha seguinte;
- `keel-flat`: cria um único triângulo a partir do ápice inicial.

O modo padrão **Automático** aplica essas quatro regras simultaneamente, de modo que caixa, V-bottom e uma transição longitudinal de fundo para quilha usam o mesmo algoritmo. **Somente quilha** não acrescenta faces inferiores e alerta quando houver semi-boca inferior positiva. **Forçar faixa inferior** usa a mesma triangulação segura do automático, sem criar áreas nulas. Cada face usa os valores locais `x`, `y` e `z`; uma quilha curva continua curva. A PCHIP longitudinal limita a semi-boca inferior ao intervalo dos controles vizinhos, evitando largura negativa, overshoot ou reabertura perto da ponta.

### Barcaças, caixa e hard chine

O seletor **Fairing visual** oferece `Automático`, `Suave (PCHIP)` e `Quinas vivas / barcaça`. O automático classifica `smooth`, `hard-chine`, `box` ou `uncertain` por evidências geométricas: fundo aberto real, proporção da boca inferior, paredes prismáticas, quebras angulares e continuidade de chine. O modo manual permite aplicar a mesma reconstrução conservadora a qualquer casco hard-chine. Nessa rota não há PCHIP, densificação nem deslocamento de offsets: para cada par de estações, a malha forma a **união** dos níveis `z` existentes no domínio comum e avalia somente os pontos intermediários por interpolação linear local. Assim, `z = [0,1,2,3]` e `z = [0,0.8,2,3]` se unem em `[0,0.8,1,2,3]` sem exigir cotas idênticas nem cruzar painéis.

Uma célula explicitamente vazia vira uma lacuna de domínio, não uma semi-boca zero: ela interrompe aquele vão em vez de ser interpolada ou fechada artificialmente. Isso é diferente de uma estação com amostragem vertical naturalmente irregular, em que a interpolação linear entre dois offsets realmente fornecidos é permitida. A mesma regra de avaliação é usada pelo loft, waterlines e plano de balizas.

As faces usam normais por canto derivadas de cada triângulo, mantendo fundo plano, costados retos e chines visualmente vivos. Uma seção com contorno auto-intersectante, níveis duplicados ou menos de dois pontos é excluída do loft e relatada; o renderizador nunca conecta estações separadas por ela. Painéis com ordem vertical inválida, cruzamento potencial ou área nula são descartados antes de entrar no buffer WebGL.

Os controles **Espelho de popa** e **Espelho de proa** aceitam **Automático**, **Somente ponta / aberta** e **Forçar espelho**. Para a rota hard-chine, `Automático` só gera transom em uma caixa prismática e com uma seção extrema válida; uma extremidade larga, porém ambígua, permanece aberta e é diagnosticada até que o usuário escolha explicitamente **Forçar espelho**. Nenhuma tampa superior é criada. As balizas desenham os dois bordos reais e, nos modos que fecham o fundo, apenas o segmento inferior real — nunca um vínculo superior artificial.

O painel de qualidade informa tipo de reconstrução, estações válidas, níveis por estação, pontos ausentes, ordem de entrada, modo inferior, painéis quadriláteros, transições triangulares, convergências naturais, faces descartadas por lacuna/cruzamento, fechamentos automáticos, faces degeneradas e arestas inferiores abertas inesperadas. A auditoria topológica quantiza posições espaciais para reconhecer BB e BE coincidentes na quilha mesmo que usem índices distintos; arestas inferiores com apenas uma face são reportadas como abertura, enquanto o topo aberto é identificado explicitamente como intencional.

Essas escolhas de fechamento e fairing são exclusivamente visuais. As fórmulas hidrostáticas, offsets e interpolação numérica continuam inalterados; para a WSA, fundo e espelhos só entram com as opções explícitas `flat` e `transom`, respectivamente.

As curvas de linhas d’água são avaliadas em cotas físicas. Quando um nível não intercepta uma estação, o renderizador registra **ausência de ponto**, não semi-boca zero. Cada trecho contínuo vira uma curva visual separada, impedindo diagonais artificiais entre regiões desconectadas. Semi-boca igual a zero continua válida apenas quando é um offset real na linha de centro.

### Diagnóstico de cadeia geométrica

`diagnoseHullPipeline(payload)` é o diagnóstico de integração usado pelo pré-flight. Ele registra a interpretação de entrada, offsets canônicos, erros e lacunas da geometria, malha (vértices, triângulos, índices, finitude, áreas degeneradas e spikes), segmentos de linhas d’água, seções do Body Plan, áreas longitudinais e prontidão para o viewer. Uma importação automática só chama `loadRows()`, `ensureRenderGeometry(true)` e `viewer.setData()` após esse diagnóstico não encontrar falhas. O diagnóstico não altera cotas nem fórmulas hidrostáticas.

## Planos geométricos e auto-fit 2D

Os canvas 2D usam `computePlotBounds(points, options)` e `axes()`. Eles recebem somente pontos válidos que realmente serão desenhados, removem `null`, `undefined` e valores não finitos, aplicam margem proporcional e garantem um intervalo mínimo em geometrias constantes. Os ticks são arredondados para incrementos legíveis (`1`, `2`, `2,5`, `5` × potência de dez) e o tamanho interno do canvas acompanha `devicePixelRatio` e redimensionamentos da janela.

- **Plano de linhas d’água:** deriva `x` das estações reais e `±y` da maior semi-boca efetivamente desenhada. São exibidas linhas originais selecionadas e 8–10 níveis visuais intermediários, claramente identificados como desenho. Toda linha é recortada pelo domínio local de cada baliza e dividida em segmentos contínuos. Curvas coincidentes, comuns em uma caixa prismática, são agrupadas em vez de sobrepostas. O controle **Representação** permite PCHIP exclusivamente visual ou segmentos lineares dos offsets; **Proporção real 1:1** (padrão) preserva a equivalência física entre `x [m]` e `y [m]`, enquanto **Ajustar à janela** usa escalas independentes apenas para leitura.
- **Plano de balizas:** oferece **Individual** (padrão), **Todas sobrepostas** e **Body Plan tradicional**. No modo completo, cada seção é uma curva independente no mesmo `bodyPlanCanvas`, sempre no sistema físico `x_gráfico = y` e `y_gráfico = z`, sem qualquer deslocamento lateral entre estações. O modo tradicional mostra uma única metade de cada baliza: as estações de popa ocupam BB à esquerda e as de proa BE à direita; o controle explícito informa se o menor `x` é popa ou proa. A meia-nau é calculada pelo meio do intervalo físico de `x` e a baliza mais próxima é indicada, sem pressupor espaçamento uniforme. O desenho **Suave (visual)** utiliza a mesma PCHIP adaptativa do 3D; **Offsets lineares** é uma comparação geométrica opcional. A caixa `Mostrar offsets originais` apresenta os pontos da tabela sem modificar a curva. O auto-fit usa a maior semi-boca e as cotas verticalmente válidas de todas as seções mostradas; a baliza escolhida fica por cima em azul-claro e as demais em azul discreto. A linha de centro `y = 0` é tracejada, grupos de seções coincidentes são informados e uma cache por geometria evita reconstrução transversal repetida. O padrão é **Proporção real 1:1**; **Ajustar à janela** é uma alternativa visual. A referência vertical pode ser `z global` (padrão) ou `relativo à quilha local`; a segunda somente subtrai `keelZ` de cada seção durante o desenho. Fundo plano real aparece apenas quando a menor cota possui semi-boca positiva e o fechamento visual está em Automático ou Forçar faixa; uma quilha pontual converge em `(0, zMin)`. Trocar os controles do plano redesenha apenas o canvas 2D; não reconstrói a malha WebGL nem recalcula hidrostática.
- **Plano de Linhas do Alto:** mostra buttocks navais reais no plano `X × Z`. `buildButtockGeometry(y)` intersecta cada triângulo da mesma malha entregue ao viewer 3D com o plano físico `Y = constante`; portanto não reutiliza as longitudinais paramétricas de `u` constante. As interseções coincidentes são reunidas por posição, arestas duplicadas são eliminadas e um grafo topológico separa componentes e ramos. Uma lacuna da malha interrompe a curva, e flare/tumblehome podem produzir mais de um ramo para o mesmo `Y`. O modo **Suave visual** intersecta a malha PCHIP já construída para o 3D; **Linear / offsets** intersecta a representação linear compartilhada das cotas. O tooltip informa `Y`, `X`, `Z` e distingue offset exato, interpolação linear e ponto visual suavizado.

Os três planos 2D aplicam auto-fit sempre que a geometria, o calado, a representação, a proporção ou o tamanho do canvas muda; por isso não possuem botões redundantes de **Enquadrar**. Como `X`, `Y` e `Z` são comprimentos, todos oferecem **Proporção real 1:1** e a alternativa **Ajustar à janela**. O Plano do Alto inclui discretamente estações, datum `z = 0`, calado atual e referências AP/FP quando a origem longitudinal declarada permite identificá-las. A distribuição numérica `A(x,T)` continua preservada nas rotinas `sections()`, integração de volume, LCB, auditoria e diagnóstico, mas não ocupa mais a área dos planos geométricos.

## Método de cálculo

Uma função central, `calculateHydrostatics(T)`, calcula todas as propriedades em um calado. A Hydrostatic Table apenas chama essa mesma rotina para cada `T`; gráficos, exportações e auditoria usam os resultados retornados por ela.

1. Para cotas intermediárias, a semi-boca é interpolada linearmente: `y(T) = y1 + (T-z1)/(z2-z1) × (y2-y1)`.
2. Área seccional: `A(x,T) = 2 ∫[keelZ(x)]^T y(x,z) dz`; se `T ≤ keelZ(x)`, a área é zero.
3. Plano d'água: `AWP = 2 ∫ y(x,T) dx`; LCF é o centroide longitudinal desse plano.
4. Volume longitudinal: `∇x = ∫ A(x,T) dx`; volume vertical independente: `∇z = ∫ AWP(z) dz`, com `KB = ∫ z·AWP(z)dz/∇` na referência vertical global declarada.
5. LCB e KB são obtidos pelos respectivos primeiros momentos; `BMₜ = Iₜ/∇` e `BMₗ = Iₗ/∇`, com `Iₗ` referido ao LCF.
6. WSA é a soma dos painéis triangulados entre perfis submersos locais, dos dois bordos. Fundo e espelhos só entram quando declarados explicitamente no formulário; o fundo declarado acompanha as cotas inferiores reais das estações.

Para cada trecho, a integração escolhe Simpson 1/3 ou 3/8 somente para espaçamentos uniformes consecutivos. Intervalos isolados ou não uniformes usam Trapézio. A auditoria expõe pontos, intervalos, passo, método e resultado parcial.

`Tmin` pode ser igual a zero. Para `T = 0` — ou para qualquer calado abaixo de todas as quilhas locais — volume, deslocamento, AWP, TPC e WSA são zero; propriedades matematicamente indefinidas aparecem como `—`, sem `NaN` ou `Infinity`.

## Curvas e exportação

O diagrama combinado usa escalas visuais declaradas na legenda, no formato `nome [unidade] × fator` ou `÷ fator`. Cada propriedade é normalizada independentemente, mas o eixo vertical continua sendo o calado físico `T` em metros. O eixo mostra `0 → Tmax` para leitura do datum; quando `Tmin > 0`, uma linha discreta marca **Início dos dados calculados**. Nenhuma curva é estendida ou ligada artificialmente a `T = 0`. Ao passar o cursor perto de um ponto, o tooltip mostra propriedade, calado, valor físico real e, no diagrama combinado, o fator de escala visual; curvas individuais usam eixos próprios. Há exportação local PNG e PDF para o diagrama combinado e para cada curva. O PDF inclui título, embarcação, data, intervalo `Tmin/Tmax`, `ΔT` e densidade.

O layout das curvas é deliberadamente independente da quantidade de calados: o canvas combinado usa `width: 100%` e `height: clamp(380px, 52vh, 600px)`, separando sua resolução interna (DPR) do tamanho CSS. Em vez de criar 16 canvas simultâneos, o painel **Curva individual** tem um seletor de propriedade e mantém somente um canvas de `clamp(280px, 34vh, 380px)`; a propriedade selecionada preserva todos os calados, tooltip, ampliação e exportação PNG/PDF. Alterar o seletor somente redesenha esse canvas. A criação dos controles é separada de `redrawIndividualCurves()`, portanto um resize não reconstrói DOM, botões ou listeners.

## Tabela e redimensionamento da interface

A **Hydrostatic Table** é sempre o mesmo elemento `<table>`: a geração substitui apenas seu `thead` e `tbody`, sem acrescentar tabelas no DOM. O contêiner `.hydro-table-viewport` limita a visualização a `max-height: min(520px, 60vh)` e oferece rolagem horizontal e vertical. O cabeçalho e a coluna `T` ficam fixos durante a leitura.

Os canvas 2D registram, por elemento, a última largura, altura CSS arredondadas e DPR. O `ResizeObserver` agenda no máximo um redraw por frame e só redesenha os canvas cuja dimensão CSS realmente mudou; ele não chama `renderIndividual()` nem atualiza a tabela. A aba ativa também limita os redraws: os planos são atualizados na aba de geometria, e os gráficos apenas na aba de curvas. Isso evita que a interação 3D dispare operações de gráficos ou tabela.

## Validação

A aba **Verificação** apresenta:

- consistência de LBP, B e D versus geometria;
- fechamento de volume longitudinal × vertical;
- relação `Cᴮ ≈ Cᴹ × Cᴾ`;
- painel de interpolação e seleção de área máxima discretizada;
- teste da barcaça paralelepipédica;
- testes analíticos automatizados: paralelepípedo, geometria de largura linear, malha refinada, quilha variável, tabela sintética 31 × 15 e quatro cenários de loft (curto/largo, longo/estreito, espaçamentos irregulares e chine);
- teste de convergência por subdivisão linear, sem modificar as cotas originais.

Os casos analíticos verificam, entre outros, volume, deslocamento, LCB, LCF, KB, BM transversal e longitudinal, AWP, TPC, WSA e coeficientes. Há sete testes de topologia puramente visual: caixa `40 × 8 × 5` em automático, V puro, fundo→quilha, quilha→fundo, a mesma transição em faixa forçada, casco afilado completo e uma fenda inferior simulada que a auditoria deve detectar. Há seis regressões de barcaça/hard-chine: detecção prismática, fundo plano, espelhos válidos, ausência de fairing, união de níveis Z irregulares e preservação de lacuna explícita. Os testes de fairing cobrem caixa, V-bottom, chine repetido, estações fisicamente irregulares e 60 estações, verificando controle de offset, normal de chine, finitude e limite de malha. Há ainda testes de visualização para linhas coincidentes, ausência local de uma linha d’água, quilha variável, auto-fit estreito/largo, tumblehome/flare e `Tmin > 0`. Seis regressões específicas do Plano do Alto cobrem caixa, quilha longitudinal variável, proa fina, múltiplos ramos de tumblehome, lacuna explícita e coincidência de todos os pontos com o plano `Y` solicitado.

A suíte interna inclui regressões para lista canônica, matriz, `BALIZA + X`, `WL + Z`, cabeçalho `WL/Z` pareado, unidades declaradas e inferidas, células vazias, `X` fora de ordem, controles dimensionais editados e a passagem de uma importação válida para a superfície 3D. A regressão com `TABELADECOTASARQ2.xlsx` confirma a matriz `BALIZA + X + WL + Z + MEIA BOCA`: `Z = [0, 0.15, 0.30, 0.60]` é selecionado como cota física, `WL` não concorre como coordenada e a importação segue automaticamente até a malha. Como teste de integração externo, foram exercitados no app os arquivos `cargo_ship_offset_HydroCalc.csv` (15 × 6, 90 offsets), `ferry_roro_offset_HydroCalc.csv` (66 estações, 380 offsets válidos) e `Tabela de cotas Barcaça.csv` (25 estações, `Y` inferido em mm e 130 offsets válidos).

Também são mostradas explicitamente as identidades `KMₜ − (KB + BMₜ)` e `KMₗ − (KB + BMₗ)`. Os testes de controle incluem seções triangular/trapezoidal, fundo plano representado por offset real, quilha variável e a fórmula de erro Maxsurf (90 versus 100 = 10%; 0 versus 0 = 0). O arquivo `data/teste_quilha_variavel.csv` é uma entrada manual de verificação.

### Regressão com tabelas reais

`tests/real-fixture-regression.html` é um runner de desenvolvimento completamente separado de `index.html`. Ele não executa nada ao abrir: o desenvolvedor precisa acionar **Executar fixtures manualmente**. Em `file://`, a página não tenta `fetch` e explica que o runner requer servidor local para registrar URL, status HTTP, `response.ok` e erro; isso nunca afeta o boot do aplicativo. Quando servido com acesso à pasta de fixtures configurada no ambiente de desenvolvimento, o runner carrega o aplicativo em um `iframe` isolado e executa o mesmo parser, `diagnoseHullPipeline()` e `preflightImport()`. Na última execução registrada, todos os casos abaixo tiveram decisão automática, geometria válida, `spikes = 0`, planos geométricos e a distribuição numérica `A(x,T)` finitos:

| Fixture | Parser | Estações × níveis | Offsets | Vazios | Triângulos |
|---|---:|---:|---:|---:|---:|
| VLCC_320K_offsets_APP.csv | canonical-list | 27 × 24 | 648 | 0 | 9.958 |
| VLCC_320K_matriz_semantica.csv | wide-matrix | 27 × 24 | 648 | 0 | 9.958 |
| Tabela de cotas Barcaça.csv | paired-wl-z-matrix | 25 × 6 | 130 | 20 | 448 |
| cargo_ship_offset_HydroCalc.csv | multi-header-matrix | 15 × 6 | 90 | 0 | 2.738 |
| ferry_roro_offset_HydroCalc.csv | multi-header-matrix | 66 × 6 | 380 | 16 | 1.337 |
| Benchmark_HidroCalc_40x8x4.xlsx | canonical-list | 21 × 9 | 189 | 0 | 1.560 |
| embarcacao_caixa_40x8x5_COMPLETA.xlsx | canonical-list | 11 × 11 | 121 | 0 | 460 |
| TABELADECOTASARQ2.xlsx | multi-header-matrix | 11 × 4 | 44 | 0 | 1.248 |

O VLCC canônico e a matriz semântica produziram o mesmo total de estações, níveis, offsets e triângulos. A caixa foi classificada como `box`; a tabela de barcaça como `hard-chine` por fundo inferior cheio e costados prismáticos, sem depender do nome do arquivo. A suíte interna também inclui a regressão de níveis `z` diferentes entre estações e a distinção entre amostragem irregular e célula explicitamente vazia.

### Comparação Maxsurf

A seção **Validação com Maxsurf** tem as três condições obrigatórias: baixo, intermediário e de projeto. Os valores podem ser preenchidos manualmente ou importados de CSV:

```text
condition,draft,property,value
low,0.5,volume,123.45
intermediate,1.5,kb,0.82
design,3.0,awp,250.0
```

São aceitas as propriedades `volume`, `displacement`, `lcb`, `lcf`, `kb`, `bmt`, `kmt`, `bml`, `kml`, `awp`, `tpc`, `wsa`, `cb`, `cwp`, `cm` e `cp`. A tabela exibe App, Maxsurf, diferença absoluta, erro percentual e status, com tolerância editável; também exporta `maxsurf_comparison.csv` e `maxsurf_comparison.xlsx`. Para referência Maxsurf igual a zero, somente 0 versus 0 recebe erro 0; os demais casos são tratados como indefinidos e sinalizados para atenção.

## Limitações conhecidas

- O modelo assume simetria transversal; cascos assimétricos exigem extensão do formato de entrada.
- A interpolação usada nos cálculos é linear entre offsets. O loft PCHIP do visualizador é apenas uma aproximação de desenho, não uma superfície NURBS nem uma nova fonte de dados hidrostáticos. Uma malha numérica pouco densa pode produzir diferença entre os volumes vertical e longitudinal e entre a malha original e a refinada; o app informa esses efeitos, mas não inventa geometria adicional.
- As longitudinais opcionais do viewer 3D continuam sendo isolinhas paramétricas do loft (`u` constante), úteis apenas como referência visual. O **Plano de Linhas do Alto** é distinto: suas buttocks são calculadas por interseções físicas `Y = constante` na malha selecionada, com ramos e lacunas preservados.
- A seção mestra é o maior valor entre as estações disponíveis e é identificada como máximo discretizado.
- WSA só pode fechar corretamente fundo, popa e proa se essas superfícies estiverem representadas nas cotas e declaradas pelo usuário. Sem declaração, elas não são adicionadas por suposição.
- A comparação com Maxsurf deve usar a mesma tabela de cotas, referências de `x`/`z`, densidade, calado, definição de superfície e fechamento de extremidades.

## Arquivos adicionados nesta evolução

- `streamlit_app.py`: empacotamento autossuficiente do frontend no componente HTML do Streamlit.
- `requirements.txt`: dependência Python mínima, somente `streamlit`.
- `.gitignore`: exclusões locais de Python, ambientes virtuais e arquivos de ambiente.
- `viewer3d.js`: renderização WebGL, câmera orbital, gizmo, projeções, escala exclusivamente visual, profundidade opaca/X-ray e seleção visual.
- `visualizer.css`: barra compacta do 3D, controle de densidade das curvas, painel de qualidade, tooltip de curvas e painel Maxsurf.
- `offset-importer.js`: leitura semântica, candidatos de formato, normalização e rastreabilidade da importação de offsets.
- `tests/real-fixture-regression.html`: regressão local da cadeia `parser → geometria → malha → planos → pré-flight` com os fixtures reais fornecidos.
- `vendor/pako_inflate.min.js` e `vendor/pako-LICENSE`: descompressão Deflate local para planilhas XLSX.

## Entrega AP1.1

Além deste código, a entrega deve conter a tabela de cotas original, dados processados, Hydrostatic Table em Excel, figuras/PDF das curvas, validação analítica, comparação com Maxsurf e relatório técnico. Antes da defesa, execute os testes analíticos e revise a auditoria para explicar a origem de cada resultado.
