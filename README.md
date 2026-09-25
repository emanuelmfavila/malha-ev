# Malha EV

Simulador visual de carros elétricos sobre um grafo, com Dijkstra e A*, postos
de recarga com fila e um painel que explica cada decisão tomada.

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 61 testes do núcleo, sem DOM
npm run ensaio         # ensaio em lote na malha 7, CSV em ensaios/resultados/
npm run ensaio:regiao  # cenário de região (corredor Sudeste), idem
```

## Pilha

| Camada             | Tecnologia               | Papel                                              |
| ------------------ | ------------------------ | -------------------------------------------------- |
| Casca              | Next.js 15, App Router   | Uma única página, sem servidor de verdade          |
| Interface          | React 19 + CSS Modules   | Só apresentação: painéis e controles               |
| Estado da interface| Zustand 5                | Configuração, seleção e ações do usuário           |
| Motor e desenho    | TypeScript puro          | Grafo, buscas, simulação e pintura do canvas       |
| Testes             | Vitest em ambiente node  | Invariantes do núcleo, sem jsdom e sem mock        |

## Nenhum carro se recusa a sair

Se a bateria não cobre o caminho e nenhum posto está ao alcance, o carro **vai
assim mesmo** e para exatamente onde a bateria acabar, no meio da aresta, ficando
ali no mapa. Ver a pane acontecer diz muito mais do que um carro que nunca saiu
do lugar. Essas partidas são contadas em "saíram sabendo que não dava", que é
informação, não falha.

Só há duas formas de uma viagem não terminar: **não existe caminho no grafo**, ou
**a bateria acabou na estrada**.

## A regra do modelo

Cada aresta tem **um número só**, o peso: **o tempo de viagem em horas**. A
bateria cai a uma taxa fixa, o **consumo em pontos por hora**, que é uma regra
da simulação e pode ser mudada na engrenagem.

> Atravessar uma aresta de peso 5 leva **5 horas** de relógio e gasta
> **5 × consumo** pontos de bateria. Com consumo 1 (padrão da malha aleatória),
> peso = horas = bateria.

Não existe velocidade nem relevo. Todo carro é igual: a bateria cheia (padrão
100 pontos) e o consumo valem para todos, e a autonomia é bateria ÷ consumo. Na
região o consumo é 24 pontos por hora, então 100 pontos dão 4 h 10 de estrada.
O custo de um caminho é a soma das horas desenhadas nele; o gasto de bateria
é isso vezes o consumo.

Na malha aleatória o peso é o comprimento da aresta na tela dividido pela escala
(14 unidades de tela por hora), **arredondado para cima**, o que mantém a
heurística geográfica do A* admissível. O peso é guardado com precisão de
minuto: na região as rodovias valem 35 min, 1 h 20, 3 h.

Postos: quem chega espera na fila, a recarga leva um tempo fixo (4 h na malha
aleatória, 50 min na região) e sempre devolve a bateria cheia. Cada posto tem o
mesmo número de vagas (1 e 4, respectivamente). Tudo isso é regra editável.

**Parada oportunista.** Passou por um posto com a bateria no nível do limiar ou
abaixo, o carro para e enche, mesmo que aquela parada não estivesse no plano de
rota. O limiar é uma regra; em zero desliga. A condição também exige bateria
abaixo da cheia, o que impede o carro recém-carregado de entrar na fila do posto
seguinte para sempre quando há posto em todo nó.

## Regras na engrenagem

O botão **⚙ Regras** (no topo e no bloco Cenário) abre um painel com todas as
regras da simulação, agrupadas em carro e bateria, postos, roteamento e demanda
e relógio: bateria cheia, consumo por hora, bateria ao sair, quantos nós têm
posto, vagas, tempo de recarga, parada oportunista, algoritmo, reserva, peso da
espera na escolha do posto, viagens automáticas por dia e velocidade do relógio.
Tudo vale na hora, sem reiniciar; trocar de cenário volta aos padrões dele.

## Cenários

O seletor **Cenário** no painel esquerdo troca a malha inteira:

- **Malha aleatória**: nós por semente, árvore mínima e rotas extras. Consumo
  de 1 ponto por hora (peso = horas = bateria), posto de 1 vaga e recarga de 4 h.
- **Região: corredor Sudeste**: 17 cidades (interior de SP, Vale do Paraíba,
  Rio e Juiz de Fora) e 22 rodovias, com dados em `src/nucleo/regiaoSudeste.ts`.
  O peso de cada rodovia é o tempo de viagem em horas; a bateria cai **24
  pontos por hora**, então 100 pontos dão 4 h 10 de estrada (≈ 330 km); recarga
  rápida de 50 min e 4 vagas por posto. O mapa segue as posições reais
  (latitude e longitude na mesma proporção, com barra de km) e os nós levam o
  nome completo da cidade. As viagens automáticas saem com peso proporcional à
  raiz da população de cada cidade, 70% delas com 80 a 100% de bateria. Os
  tempos de estrada são aproximados e devem ser conferidos antes de virar texto.

Um cenário é um objeto em `src/nucleo/cenarios.ts` (como montar a malha, como
são os postos, quanto vale a unidade); registrar outro ali é o bastante para ele
aparecer no seletor.

## Ensaios em lote

`ensaios/ensaio.ts` (malha 7) e `ensaios/regiao.ts` (região) rodam o núcleo sem
interface, com várias sementes por cenário, e gravam CSV em `ensaios/resultados/`.
Os ensaios são a posição de um posto único em cada nó, a saturação com demanda
crescente e, na região, um posto em toda cidade com vagas crescentes
(`--ensaios=3 --vagas=1,2,4 --demandas3=100,200 --bateria=100`). Foi o ensaio da região que revelou o carro
quicando entre postos e motivou a cadeia de postos viáveis no planejador.

## Arquitetura

O motor **não vive em estado do React**. Os objetos do núcleo (`Malha`,
`Simulacao`, `Estatisticas`) são singletons mutáveis de propósito. São centenas
de carros a 60 quadros por segundo: re-renderizar a árvore a cada quadro mataria
a página. Em vez disso:

- um laço de animação em `Palco.tsx` avança o motor e pinta o canvas a 60 fps;
- o React é acordado **4 vezes por segundo** por um contador (`tique`) na store;
- os painéis leem o motor direto na hora de renderizar, sem receber cópias
  por props;
- cada ação da store (colocar carro, trocar algoritmo, editar peso) chama o
  motor e depois dispara o tique.

O motor fala com a interface por um emissor de eventos simples: `carroChegou`,
`carroFalhou`, `recargaConcluida`, `rotaPlanejada`, `novaViagem`. O laço em
`laco.ts` assina esses eventos uma vez só, no carregamento do módulo, e
transforma cada um num pulso visual ou na animação da busca no mapa.

A dependência entre pastas é sempre de cima para baixo: `componentes` usa
`estado`, que usa `mapa` e `nucleo`; `mapa` usa só `nucleo`; `nucleo` não usa
ninguém.

```
app/                      casca do Next (App Router)
  layout.tsx
  page.tsx
  globals.css             tokens de design, reset

src/
  nucleo/                 TypeScript puro: zero React, zero DOM
    tipos.ts              contratos do modelo
    constantes.ts         escala de peso, bateria cheia, tempo de recarga
    aleatorio.ts          gerador determinístico por semente
    filaDePrioridade.ts   heap mínimo das buscas
    malha.ts              grafo: nós, arestas, pesos, postos
    criterios.ts          registro de critérios de custo
    algoritmos.ts         Dijkstra e A* a partir de uma busca só
    planejador.ts         política de rota e de parada para recarga
    cenarios.ts           registro de cenários: malha aleatória e região
    regiaoSudeste.ts      cidades, rodovias e escala do corredor Sudeste
    estatisticas.ts       coleta de métricas
    simulacao.ts          motor de tempo: carros, postos e filas
    utilidades.ts         emissor de eventos, relógio, formatação

  mapa/                   desenho, também sem React
    camera.ts             zoom, arraste e conversão mundo ↔ tela
    cores.ts              paleta e as cores por situação
    vista.ts              pintura do canvas e a camada de estudo da busca

  estado/
    loja.ts               Zustand: configuração, seleção, ações
    laco.ts               avanço do tempo e assinatura dos eventos

  componentes/            React, só apresentação
    Aplicacao.tsx         layout e atalhos de teclado
    BarraSuperior.tsx     relógio e controles de execução
    Palco.tsx             canvas, laço de animação e camadas sobre o mapa
    PainelEsquerdo.tsx    controles
    PainelDireito.tsx     resultados, postos, frota, ocorrências
    Acompanhamento.tsx    medidor, balanço da bateria, narrativa e diário
    GraficoDeOcupacao.tsx
    ui/Controles.tsx      primitivas: bloco, deslizante, alternador, botão

  estilos/
    painel.module.css     CSS Modules do painel

tests/
  nucleo.test.ts          Vitest sobre o núcleo, ambiente node
  regiao.test.ts          cenário de região e cadeia de postos no planejador

ensaios/
  ensaio.ts               ensaio em lote na malha 7
  regiao.ts               ensaio em lote na região
  comum.ts                médias, CSV e postos
  resultados/             CSV e JSON gerados
```

### Por que o núcleo é separado

Ele não importa nada de React nem toca no DOM, então os testes rodam em ambiente
`node`, sem jsdom e sem nenhum mock de canvas. É onde ficam as invariantes que
realmente importam:

- peso do caminho = horas de viagem, e bateria gasta = horas × consumo, com
  qualquer tamanho de passo;
- A* devolve o mesmo custo ótimo do Dijkstra, abrindo menos nós, mesmo depois
  de embaralhar todos os pesos;
- `bateria inicial + recarregado − gasto = bateria atual`, para todo carro;
- a mesma semente reproduz o cenário inteiro.

## Como o motor funciona

### Geração do grafo

1. Os nós são espalhados por rejeição, com um espaçamento mínimo entre eles.
   Quando o espaço aperta, o espaçamento cede aos poucos, então a quantidade
   pedida é sempre alcançada.
2. Uma **árvore geradora mínima** liga sempre o par mais próximo entre quem já
   está na árvore e quem ainda não está. Isso garante que todo nó é alcançável.
3. As **rotas extras** entram entre os pares mais próximos ainda desconectados.
4. Postos vão para os nós de maior grau.

Tudo sai de um gerador aleatório determinístico por semente, então a mesma
semente reproduz a mesma malha e a mesma sequência de viagens automáticas.

### Buscas

Dijkstra e A* são **a mesma função de busca** com uma prioridade diferente.
Dijkstra usa estimativa zero. A* usa a distância em linha reta até o destino
vezes a **menor razão peso/comprimento da malha**. Escrever as duas a partir de
uma função só deixa isso explícito e impede que elas divirjam por descuido.

A ordem em que cada busca abre os nós só é gravada quando alguém está olhando
(comparação ou carro selecionado). Fora disso o custo extra some e o motor roda
em lote na velocidade de sempre.

### Planejador

Para cada trecho, `planejarProximoTrecho` decide entre três saídas:

- **Direto**: o peso do caminho cabe na bateria menos a reserva. Segue.
- **Desvio**: não cabe, então avalia cada posto ao alcance **de onde o destino
  é alcançável**, direto ou por uma cadeia de outros postos com a bateria cheia
  (`custoRestanteDosPostos`, um Dijkstra ao contrário sobre o grafo dos postos,
  com a recarga somada em cada elo). A pontuação de um posto é o custo até ele,
  mais o custo restante dele ao destino por essa cadeia, mais a espera prevista
  na fila vezes um peso configurável. Escolhe a menor. Sem o filtro, o carro
  escolheria o posto "mais perto do destino" e passaria a quicar entre dois
  postos para sempre quando nenhum deles alcança o destino.
- **Arriscado**: nenhum posto útil ao alcance. Sai pelo caminho mais curto e
  para no meio da aresta quando a bateria zerar. Conta como saída arriscada.

Depois de cada recarga o carro replaneja, então viagens com várias paradas se
resolvem **um posto por vez**.

### Passo de tempo

O laço converte segundos reais em horas simuladas (controle "horas por
segundo") e subdivide em passos de no máximo 0,1 h para não pular arestas
curtas. Cada passo:

1. atende os postos: desconta o tempo de quem está na vaga, libera quem
   terminou e puxa o próximo da fila;
2. move cada carro: uma hora move uma hora de peso e gasta `consumo` pontos de
   bateria;
3. gera viagens aleatórias, se as chegadas automáticas estiverem ligadas;
4. amostra a ocupação da rede a cada hora simulada, para o gráfico.

O movimento nunca perde tempo ao cruzar um nó: o que sobra de hora ao terminar
uma aresta já entra na aresta seguinte. Sem isso, um passo fracionado engoliria
um pedaço de hora em cada nó e o peso deixaria de ser exatamente o tempo de
viagem.

Ao chegar num nó, o carro verifica nesta ordem: é o destino, é o posto
planejado, cabe uma parada oportunista, e só então segue para a próxima aresta
ou, no fim do trecho planejado, replaneja.

### Postos e filas

Cada posto tem uma vaga, recarga fixa de 4 h e sempre devolve a bateria cheia.
Quem chega entra numa fila em ordem de chegada. O posto acumula horas de vaga
ocupada, recargas concluídas e maior fila, que viram a utilização mostrada no
painel. Remover um posto com carros em campo replaneja quem estava na fila,
recarregando ou a caminho dele.

### Carros persistentes

Um carro que chegou **não sai da malha**. O nó de chegada vira a nova origem,
e escolher outro destino gera uma viagem nova com bateria e histórico
preservados. Cada viagem conta separado nas médias: um retrato dos contadores é
tirado na largada e a estatística de chegada é a diferença entre agora e ele.

Trocar o destino de um carro em movimento tem tratamento por situação:

| Situação do carro          | O que acontece                                   |
| -------------------------- | ------------------------------------------------ |
| parado no nó               | replaneja na hora                                |
| no meio de uma aresta      | termina o trecho e replaneja no nó seguinte      |
| na fila                    | sai da fila e replaneja                          |
| recarregando               | espera a recarga terminar e replaneja            |
| chegou ou sem rota         | começa uma viagem nova                           |
| sem bateria na estrada     | não anda mais                                    |

A origem só muda enquanto o carro não saiu do lugar nesta viagem.

## Interface

O canvas é pintado em camadas fixas, nesta ordem: fundo, arestas, rotas de cada
carro, par escolhido, camada de estudo da busca, nós, carros e pulsos. A camada
de estudo acende, em ordem, cada nó que cada algoritmo abriu: a mancha do
Dijkstra cresce em círculo, a do A* se estica na direção do destino.

**Painel esquerdo**: carros novos, ritmo da simulação, malha viária, postos de
recarga, roteamento, comparar buscas e exibição.

**Painel direito**: o que está acontecendo, resultados, detalhamento, ocupação
da rede (gráfico), utilização dos postos, frota e ocorrências. Com um carro
selecionado, o painel passa a ser a ficha dele: medidor de bateria, balanço de
gasto e recarga, narrativa e diário de decisões.

**Exportação**: um botão baixa todo o estado em JSON, incluindo a configuração,
as arestas com peso, os postos e o diário de cada carro.

### Como usar

1. Clique num nó do mapa para a **origem**, noutro para o **destino**.
2. **Colocar carro** — o deslizante ao lado põe vários de uma vez. Essa rota
   vale só para os carros criados ali; cada carro passa a ter a sua.
3. Clique numa **aresta** para editar o peso dela ali mesmo. Como o peso é o
   tempo e a bateria cai por hora, o efeito aparece nas duas coisas na hora.
4. Clique num **carro** e o painel da direita passa a ser dele: bateria atual,
   quanto gastou, quanto recarregou, diário de decisões e a **rota dele**.
   Com o carro selecionado, clicar num nó do mapa muda a ponta que estiver
   ativa nas fichas — e só a rota daquele carro.
5. Um carro que **chegou** fica parado naquele nó, na malha, até você reiniciar.
   O nó de chegada vira a **nova origem** dele e o destino fica vazio: escolha
   outro e ele sai de novo, guardando bateria e histórico.
6. **Mostrar a busca no mapa** acende cada nó que Dijkstra e A* precisaram abrir.

Roda do mouse aproxima, arrastar move.
Atalhos: `espaço` inicia ou pausa, `N` avança 1 h, `C` compara, `F` enquadra.

## Uma sutileza do peso editável

A estimativa do A* é a distância em linha reta vezes a **menor razão
peso/comprimento da malha**, e não uma escala fixa. Essa razão é recalculada a
cada edição de peso. Sem isso, baixar um peso à mão abaixo do comprimento da
aresta tornaria a estimativa maior que o custo real, a heurística deixaria de
ser admissível e o A* passaria a devolver caminhos piores que o Dijkstra —
silenciosamente. Há um teste que embaralha todos os pesos e exige que os dois
algoritmos continuem empatando em custo.

## Pontos de crescimento

Marcados com `EXTENSÃO:` no código.

- **Outro algoritmo**: registre em `algoritmos.ts` e ele aparece sozinho no
  seletor e na comparação.
- **Outro critério de custo**: registre em `criterios.ts`; o seletor de critério
  volta a aparecer sozinho quando existir mais de um.
- **Outra política de recarga**: troque `planejarProximoTrecho` em
  `planejador.ts` (por exemplo recarga parcial ou preferência por posto vazio).
