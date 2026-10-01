/* Ensaio em lote no cenário de região (corredor Sudeste), o mesmo que a interface
   mostra no seletor "Cenário". Os dados da região e a escala estão em
   src/nucleo/regiaoSudeste.ts.

   Rodar:  npm run ensaio:regiao [-- --dias=7 --repeticoes=30 --demanda=200 --demandas=50,100,...]
           npm run ensaio:regiao -- --ensaios=4 [--passo=10 --teto=1500 --saturacao=90 --nos=SP,CAM]
           (com --nos, o ensaio 4 grava só regiao-ensaio4-partes/<sigla>.csv, para rodar
           cidades em processos paralelos e juntar depois) 
   Saída:  ensaios/resultados/regiao-*.csv

   O modelo do simulador tem uma unidade só: peso da aresta = "horas" de relógio = pontos de
   bateria, com bateria cheia de 100. Para ler isso como um carro elétrico de verdade, cada
   unidade do modelo vale 2,5 minutos reais:
     bateria cheia  = 100 unidades = 250 min ≈ 4 h 10 de estrada ≈ 330 km a 80 km/h
     recarga rápida = 20 unidades  = 50 min (carregador DC até encher)
     reserva        = 10 unidades  = 25 min ≈ 33 km guardados
     dia real       = 576 unidades

   As cidades e os tempos de estrada estão nas tabelas CIDADES e ESTRADAS. Os tempos são
   aproximações de viagem em condições normais e devem ser conferidos antes de publicar;
   trocar a região é trocar essas duas tabelas. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Malha } from '../src/nucleo/malha';
import { Simulacao } from '../src/nucleo/simulacao';
import { Estatisticas } from '../src/nucleo/estatisticas';
import { AlgoritmosDeBusca } from '../src/nucleo/algoritmos';
import { CriteriosDeCusto } from '../src/nucleo/criterios';
import { criarGeradorAleatorio } from '../src/nucleo/aleatorio';
import { BATERIA_CHEIA } from '../src/nucleo/constantes';
import {
  CIDADES,
  CONSUMO_NA_REGIAO,
  ESTRADAS,
  PERFIL_HORARIO,
  RECARGA_RAPIDA_H,
  RECARGA_RAPIDA_MIN,
  VAGAS_NA_REGIAO,
  indicePorSigla,
  montarRegiaoSudeste,
  sortearBateria,
  sortearCidade,
} from '../src/nucleo/regiaoSudeste';
import { colocarPostosEm, csv, media, mostrar, resumir } from './comum';

const PASTA = join(__dirname, 'resultados');

/* ---------- região: vem do núcleo, os mesmos dados da interface ----------
   O peso é o tempo em horas e a bateria cai CONSUMO_NA_REGIAO pontos por hora. */

const UNIDADES_POR_DIA = 24; // o relógio anda em horas reais
const RECARGA_MIN = RECARGA_RAPIDA_MIN;
const VAGAS_POR_POSTO = VAGAS_NA_REGIAO;
const CONSUMO = CONSUMO_NA_REGIAO;
const RESERVA = 10;
const BATERIA = Number(
  Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string])).bateria ?? BATERIA_CHEIA
);
const LIMIAR_OPORTUNISTA = 30; // 75 min de autonomia: passou num posto, para
const horasReais = (h: number) => h;
const SOMA_DO_PERFIL = PERFIL_HORARIO.reduce((s, v) => s + v, 0);
const montarRegiao = montarRegiaoSudeste;

interface Gerador { sortear: () => number }

function poisson(g: Gerador, lambda: number): number {
  const limite = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= g.sortear(); } while (p > limite);
  return k - 1;
}

/* ---------- uma rodada ---------- */

interface Medida extends Record<string, number> {
  iniciadas: number;
  concluidas: number;
  emAndamento: number;
  panes: number;
  panesPorCem: number;
  arriscadas: number;
  recargas: number;
  recargasPorCemViagens: number;
  oportunistas: number;
  tempoMedioViagemH: number;
  tempoMedioFilaMin: number;
  tempoMedioRecargaMin: number;
  utilizacao: number;
  maiorFila: number;
  filaMedia: number;
}

function rodar(
  postos: number[],
  viagensPorDia: number,
  dias: number,
  semente: number,
  vagas = VAGAS_POR_POSTO,
  passo = 0.05 // 3 minutos
): Medida {
  montarRegiao();
  colocarPostosEm(postos, vagas, RECARGA_RAPIDA_H);
  Object.assign(Simulacao.configuracao, {
    algoritmo: 'estrela',
    criterio: 'peso',
    bateriaCheia: BATERIA,
    consumoPorHora: CONSUMO,
    reserva: RESERVA,
    limiarDeRecarga: LIMIAR_OPORTUNISTA,
    pesoDaFila: 0.35,
    chegadasAutomaticas: false,
  });
  Simulacao.reiniciar();
  const g: Gerador = { sortear: criarGeradorAleatorio(semente) };

  const total = dias * UNIDADES_POR_DIA;
  const passos = Math.round(total / passo);
  let integralDaFila = 0;
  for (let k = 0; k < passos; k++) {
    const horaDoDia = Math.floor(horasReais(Simulacao.hora) % 24);
    const taxaPorHoraReal = (viagensPorDia * PERFIL_HORARIO[horaDoDia]) / SOMA_DO_PERFIL;
    const novas = poisson(g, taxaPorHoraReal * horasReais(passo));
    for (let n = 0; n < novas; n++) {
      const origem = sortearCidade(g.sortear);
      Simulacao.colocarCarro(origem, sortearCidade(g.sortear, origem), sortearBateria(g.sortear));
    }
    Simulacao.avancar(passo);
    integralDaFila += Simulacao.totalNaFila() * passo;
  }

  const emAndamento = Simulacao.carros.filter(
    (c) => c.situacao === 'em rota' || c.situacao === 'na fila' || c.situacao === 'recarregando'
  ).length;
  const nosComPosto = Malha.nosComPosto();
  const utilizacao = nosComPosto.length
    ? nosComPosto.reduce((s, no) => s + Simulacao.utilizacaoDoPosto(no), 0) / nosComPosto.length
    : 0;
  const maiorFila = nosComPosto.reduce((m, no) => Math.max(m, no.posto!.maiorFila), 0);
  const E = Estatisticas;
  const concluidas = E.viagensConcluidas;
  return {
    iniciadas: E.viagensIniciadas,
    concluidas,
    emAndamento,
    panes: E.falhasPorPane,
    panesPorCem: E.viagensIniciadas ? (100 * E.falhasPorPane) / E.viagensIniciadas : NaN,
    arriscadas: E.saidasArriscadas,
    recargas: E.recargasConcluidas,
    recargasPorCemViagens: E.viagensIniciadas ? (100 * E.recargasConcluidas) / E.viagensIniciadas : NaN,
    oportunistas: E.recargasOportunistas,
    tempoMedioViagemH: concluidas ? horasReais(E.somaTempoDeViagem / concluidas) : NaN,
    tempoMedioFilaMin: concluidas ? horasReais(E.somaTempoEmFila / concluidas) * 60 : NaN,
    tempoMedioRecargaMin: concluidas ? horasReais(E.somaTempoRecarregando / concluidas) * 60 : NaN,
    utilizacao,
    maiorFila,
    filaMedia: integralDaFila / total,
  };
}

/* ---------- estrutura da região ---------- */

montarRegiao();
const dijkstra = AlgoritmosDeBusca.porId.dijkstra;
const criterioPeso = CriteriosDeCusto.porId.peso;
const estrutura = Malha.nos.map((no) => {
  const custos = Malha.nos
    .filter((outro) => outro.indice !== no.indice)
    .map((outro) => dijkstra.buscar(no.indice, outro.indice, criterioPeso)!.custo);
  return {
    sigla: no.nome,
    cidade: CIDADES[no.indice].nome,
    populacaoMil: CIDADES[no.indice].pop,
    grau: Malha.adjacencia[no.indice].length,
    tempoMedioAteOsOutrosH: horasReais(media(custos)),
    excentricidadeH: horasReais(Math.max(...custos)),
  };
});
const pares: number[] = [];
let paresForaDoAlcance = 0;
for (let a = 0; a < Malha.nos.length; a++)
  for (let b = a + 1; b < Malha.nos.length; b++) {
    const custo = dijkstra.buscar(a, b, criterioPeso)!.custo;
    pares.push(custo);
    if (custo * CONSUMO > BATERIA - RESERVA) paresForaDoAlcance++;
  }
const viagemMediaH = horasReais(media(pares));
const postosPorGrau = [...Malha.nos]
  .sort((a, b) => Malha.adjacencia[b.indice].length - Malha.adjacencia[a.indice].length)
  .slice(0, 4)
  .map((no) => no.indice);
const todosOsNos = Malha.nos.map((no) => no.indice);
// alternativa à regra "por grau": um posto em cada trecho do corredor, escolhidos à mão
const postosEspalhados = ['CAM', 'SCA', 'RES', 'RIO'].map((sigla) => indicePorSigla.get(sigla)!);

/* ---------- parâmetros dos ensaios ---------- */

const argumentos = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string])
);
const DIAS = Number(argumentos.dias ?? 7);
const ENSAIOS = (argumentos.ensaios ?? '1,2,3').split(',').map(Number);
const VAGAS = (argumentos.vagas ?? '1,2,3,4,6,8').split(',').map(Number);
const DEMANDAS_3 = (argumentos.demandas3 ?? '100,200,400,800').split(',').map(Number);
const REPETICOES = Number(argumentos.repeticoes ?? 10);
const DEMANDA_1 = Number(argumentos.demanda ?? 200);
const DEMANDAS = (argumentos.demandas ?? '50,100,200,400,800,1600').split(',').map(Number);
const SEMENTES = Array.from({ length: REPETICOES }, (_, k) => 2001 + k);
const PASSO_4 = Number(argumentos.passo ?? 10);
const TETO_4 = Number(argumentos.teto ?? 1500);
const SATURACAO_4 = Number(argumentos.saturacao ?? 90);
const NOS_4 = argumentos.nos ? argumentos.nos.split(',').map((sigla) => indicePorSigla.get(sigla)!) : null;
const nome = (postos: number[]) => postos.map((i) => Malha.nos[i].nome).join('+') || '-';

console.log(`região: ${CIDADES.length} cidades, ${ESTRADAS.length} estradas, viagem média ${viagemMediaH.toFixed(2)} h reais, ` +
  `${paresForaDoAlcance} de ${pares.length} pares fora do alcance de uma carga`);
console.log(`ensaios ${ENSAIOS.join(',')}: ${DIAS} dias reais, ${REPETICOES} repetições, bateria ${BATERIA}, ensaio 1 a ${DEMANDA_1} viagens/dia, ` +
  `saturação em ${DEMANDAS.join('/')} viagens/dia, vagas ${VAGAS.join('/')} em ${DEMANDAS_3.join('/')} viagens/dia`);
console.log('postos por grau:', nome(postosPorGrau), '\n');

/* ---------- ensaio 1: posto único em cada cidade ---------- */

const inicio = Date.now();
const ensaio1: Record<string, unknown>[] = [];
const brutos1: Record<string, unknown>[] = [];
function cenario1(rotulo: string, postos: number[]) {
  const medidas = SEMENTES.map((s) => {
    const m = rodar(postos, DEMANDA_1, DIAS, s);
    brutos1.push({ cenario: rotulo, semente: s, ...m });
    return m;
  });
  ensaio1.push({ cenario: rotulo, postos: nome(postos), ...resumir(medidas) });
}
if (ENSAIOS.includes(1)) {
  cenario1('sem posto', []);
  for (const no of Malha.nos) cenario1(`posto em ${no.nome}`, [no.indice]);
  cenario1('4 postos por grau', postosPorGrau);
  cenario1('4 postos espalhados', postosEspalhados);
  cenario1('posto em toda cidade', todosOsNos);
  console.log(`ensaio 1 em ${((Date.now() - inicio) / 1000).toFixed(0)} s`);
}

const melhorNo = ensaio1.length
  ? Malha.nos
      .map((no) => ({ indice: no.indice, panes: ensaio1.find((l) => l.cenario === `posto em ${no.nome}`)!.panes as number,
                      tempo: ensaio1.find((l) => l.cenario === `posto em ${no.nome}`)!.tempoMedioViagemH as number }))
      .sort((a, b) => a.panes - b.panes || a.tempo - b.tempo)[0].indice
  : indicePorSigla.get('CAM')!;

/* ---------- ensaio 2: saturação ---------- */

const ensaio2: Record<string, unknown>[] = [];
const brutos2: Record<string, unknown>[] = [];
if (ENSAIOS.includes(2))
for (const rede of [
  { rotulo: `1 posto em ${Malha.nos[melhorNo].nome}`, postos: [melhorNo] },
  { rotulo: '4 postos por grau', postos: postosPorGrau },
  { rotulo: '4 postos espalhados', postos: postosEspalhados },
  { rotulo: 'posto em toda cidade', postos: todosOsNos },
])
  for (const demanda of DEMANDAS) {
    const medidas = SEMENTES.map((s) => {
      const m = rodar(rede.postos, demanda, DIAS, s);
      brutos2.push({ rede: rede.rotulo, viagensPorDia: demanda, semente: s, ...m });
      return m;
    });
    ensaio2.push({ rede: rede.rotulo, postos: nome(rede.postos), viagensPorDia: demanda, ...resumir(medidas) });
  }
if (ENSAIOS.includes(2)) console.log(`ensaio 2 pronto em ${((Date.now() - inicio) / 1000).toFixed(0)} s no total`);

/* ---------- ensaio 3: posto em toda cidade, vagas crescentes ---------- */

const ensaio3: Record<string, unknown>[] = [];
const brutos3: Record<string, unknown>[] = [];
if (ENSAIOS.includes(3))
  for (const vagas of VAGAS)
    for (const demanda of DEMANDAS_3) {
      const medidas = SEMENTES.map((s) => {
        const m = rodar(todosOsNos, demanda, DIAS, s, vagas);
        brutos3.push({ vagasPorPosto: vagas, viagensPorDia: demanda, semente: s, ...m });
        return m;
      });
      ensaio3.push({ vagasPorPosto: vagas, viagensPorDia: demanda, ...resumir(medidas) });
    }
if (ENSAIOS.includes(3)) console.log(`ensaio 3 pronto em ${((Date.now() - inicio) / 1000).toFixed(0)} s no total\n`);

/* ---------- ensaio 4: 1 posto por cidade, carga de PASSO_4 em PASSO_4 carros/dia ----------
   Para cada cidade a carga sobe até a utilização média do posto passar de SATURACAO_4
   (em %; o degrau que passou entra no resultado) ou até TETO_4 carros/dia. */

const ensaio4: Record<string, unknown>[] = [];
const brutos4: Record<string, unknown>[] = [];
if (ENSAIOS.includes(4)) {
  for (const no of NOS_4 ? NOS_4.map((i) => Malha.nos[i]) : Malha.nos) {
    for (let carros = PASSO_4; carros <= TETO_4; carros += PASSO_4) {
      const medidas = SEMENTES.map((s) => {
        const m = rodar([no.indice], carros, DIAS, s);
        brutos4.push({ posto: no.nome, carrosPorDia: carros, semente: s, ...m });
        return m;
      });
      const resumo = resumir(medidas);
      ensaio4.push({ posto: no.nome, carrosPorDia: carros, ...resumo });
      if (resumo.utilizacao >= SATURACAO_4) break;
    }
    console.log(`ensaio 4: ${no.nome} até ${ensaio4[ensaio4.length - 1].carrosPorDia} carros/dia, ${((Date.now() - inicio) / 1000).toFixed(0)} s`);
  }
}

/* ---------- gravação ---------- */

if (NOS_4) {
  const partes = join(PASTA, 'regiao-ensaio4-partes');
  mkdirSync(partes, { recursive: true });
  for (const i of NOS_4) {
    const nomeDoNo = Malha.nos[i].nome;
    writeFileSync(join(partes, `${CIDADES[i].sigla}.csv`), csv(ensaio4.filter((l) => l.posto === nomeDoNo)));
    writeFileSync(join(partes, `${CIDADES[i].sigla}-brutos.csv`), csv(brutos4.filter((l) => l.posto === nomeDoNo)));
  }
  process.exit(0);
}

const estradas = ESTRADAS.map(([de, para, minutos]) => ({ de, para, minutos, pesoHoras: minutos / 60 }));
writeFileSync(join(PASTA, 'regiao-cidades.csv'), csv(estrutura));
writeFileSync(join(PASTA, 'regiao-estradas.csv'), csv(estradas));
if (ensaio1.length) {
  writeFileSync(join(PASTA, 'regiao-ensaio1-posicao-do-posto.csv'), csv(ensaio1));
  writeFileSync(join(PASTA, 'regiao-ensaio1-brutos.csv'), csv(brutos1));
}
if (ensaio2.length) {
  writeFileSync(join(PASTA, 'regiao-ensaio2-saturacao.csv'), csv(ensaio2));
  writeFileSync(join(PASTA, 'regiao-ensaio2-brutos.csv'), csv(brutos2));
}
if (ensaio3.length) {
  writeFileSync(join(PASTA, 'regiao-ensaio3-vagas.csv'), csv(ensaio3));
  writeFileSync(join(PASTA, 'regiao-ensaio3-brutos.csv'), csv(brutos3));
}
if (ensaio4.length) {
  writeFileSync(join(PASTA, 'regiao-ensaio4-saturacao-por-no.csv'), csv(ensaio4));
  writeFileSync(join(PASTA, 'regiao-ensaio4-brutos.csv'), csv(brutos4));
}
writeFileSync(join(PASTA, `regiao-resumo${ENSAIOS.length === 3 ? '' : '-ensaio' + ENSAIOS.join('')}.json`), JSON.stringify({
  modelo: { regra: 'peso = horas de viagem; bateria gasta = horas × consumo', bateriaCheia: BATERIA, consumoPorHora: CONSUMO,
    autonomiaH: BATERIA / CONSUMO, recargaMin: RECARGA_MIN, vagasPorPosto: VAGAS_POR_POSTO, reservaPontos: RESERVA,
    limiarOportunistaPontos: LIMIAR_OPORTUNISTA },
  demanda: { perfilHorario: PERFIL_HORARIO, pesoDaCidade: 'raiz da população', bateriaInicial: '70% em 80-100, 30% em 40-80' },
  ensaios: { dias: DIAS, repeticoes: REPETICOES, bateria: BATERIA, passo4: PASSO_4, teto4: TETO_4, saturacao4: SATURACAO_4, demandaEnsaio1: DEMANDA_1, demandas: DEMANDAS, vagas: VAGAS, demandasEnsaio3: DEMANDAS_3, sementes: SEMENTES },
  regiao: { viagemMediaH, paresForaDoAlcance, totalDePares: pares.length, postosPorGrau: nome(postosPorGrau), melhorNo: Malha.nos[melhorNo].nome },
  estrutura, estradas, ensaio1, ensaio2, ensaio3, ensaio4,
}, null, 2));

mostrar(estrutura, ['sigla', 'populacaoMil', 'grau', 'tempoMedioAteOsOutrosH', 'excentricidadeH']);
if (ensaio1.length) mostrar(ensaio1, ['cenario', 'iniciadas', 'concluidas', 'panesPorCem', 'arriscadas', 'recargasPorCemViagens', 'tempoMedioViagemH', 'tempoMedioFilaMin', 'utilizacao', 'maiorFila', 'filaMedia']);
if (ensaio3.length) mostrar(ensaio3, ['vagasPorPosto', 'viagensPorDia', 'iniciadas', 'concluidas', 'panesPorCem', 'recargasPorCemViagens', 'tempoMedioViagemH', 'tempoMedioFilaMin', 'utilizacao', 'maiorFila', 'filaMedia']);
if (ensaio2.length) mostrar(ensaio2, ['rede', 'viagensPorDia', 'iniciadas', 'concluidas', 'panesPorCem', 'recargas', 'recargasPorCemViagens', 'tempoMedioViagemH', 'tempoMedioFilaMin', 'utilizacao', 'maiorFila', 'filaMedia']);
