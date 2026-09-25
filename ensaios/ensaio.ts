/* Ensaio em lote sobre o núcleo do simulador, sem interface.

   Rodar:  npm run ensaio
   Saída:  ensaios/resultados/*.csv e resumo.json

   Ensaio 1  posto único em cada nó da malha 7, 24 h simuladas
   Ensaio 2  saturação: demanda crescente com postos fixos, 24 h simuladas */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Malha } from '../src/nucleo/malha';
import { Simulacao } from '../src/nucleo/simulacao';
import { Estatisticas } from '../src/nucleo/estatisticas';
import { AlgoritmosDeBusca } from '../src/nucleo/algoritmos';
import { CriteriosDeCusto } from '../src/nucleo/criterios';
import { semear } from '../src/nucleo/aleatorio';
import { colocarPostosEm, csv, media, mostrar, resumir } from './comum';

const PASTA = join(__dirname, 'resultados');

const MALHA = { nos: 14, rotasExtras: 6, semente: 7 };
/** Alvo para o custo médio do caminho mais curto entre dois nós quaisquer, em horas.
    Os pesos gerados pela escala padrão dão cerca de 41 h; aqui eles são reduzidos por um
    fator único, com arredondamento, até a média ficar o mais perto possível do alvo. */
const VIAGEM_MEDIA_ALVO_H = 24;
const HORAS = 24;
const HORAS_LONGAS = 240; // 10 dias: dá tempo de toda viagem do dia terminar
const PASSO = 0.1;
const REPETICOES = 30;
const SEMENTES_DE_VIAGEM = Array.from({ length: REPETICOES }, (_, k) => 1001 + k);

interface Medida extends Record<string, number> {
  iniciadas: number;
  concluidas: number;
  emAndamento: number;
  panes: number;
  arriscadas: number;
  recargas: number;
  oportunistas: number;
  tempoMedioViagem: number;
  tempoMedioFila: number;
  utilizacao: number;
  maiorFila: number;
  filaMediaNoTempo: number;
  nosExpandidos: number;
}

function rodar(
  postos: number[],
  chegadasPorDia: number,
  sementeDeViagem: number,
  horasDeDemanda: number,
  horasTotais: number
): Medida {
  prepararMalha();
  colocarPostosEm(postos);
  Object.assign(Simulacao.configuracao, {
    algoritmo: 'estrela',
    criterio: 'peso',
    reserva: 10,
    limiarDeRecarga: 30,
    pesoDaFila: 0.35,
    chegadasAutomaticas: true,
    chegadasPorDia,
  });
  Simulacao.reiniciar();
  semear(sementeDeViagem); // a malha já está pronta: daqui em diante o sorteio é só das viagens

  const passos = Math.round(horasTotais / PASSO);
  for (let k = 0; k < passos; k++) {
    if (Simulacao.hora >= horasDeDemanda - 1e-9) Simulacao.configuracao.chegadasAutomaticas = false;
    Simulacao.avancar(PASSO);
  }

  const emAndamento = Simulacao.carros.filter(
    (c) => c.situacao === 'em rota' || c.situacao === 'na fila' || c.situacao === 'recarregando'
  ).length;
  const nosComPosto = Malha.nosComPosto();
  const utilizacao = nosComPosto.length
    ? nosComPosto.reduce((s, no) => s + Simulacao.utilizacaoDoPosto(no), 0) / nosComPosto.length
    : 0;
  const maiorFila = nosComPosto.reduce((m, no) => Math.max(m, no.posto!.maiorFila), 0);
  const filaMediaNoTempo = Estatisticas.historico.length
    ? Estatisticas.historico.reduce((s, a) => s + a.naFila, 0) / Estatisticas.historico.length
    : 0;
  const concluidas = Estatisticas.viagensConcluidas;

  return {
    iniciadas: Estatisticas.viagensIniciadas,
    concluidas,
    emAndamento,
    panes: Estatisticas.falhasPorPane,
    arriscadas: Estatisticas.saidasArriscadas,
    recargas: Estatisticas.recargasConcluidas,
    oportunistas: Estatisticas.recargasOportunistas,
    tempoMedioViagem: concluidas ? Estatisticas.somaTempoDeViagem / concluidas : NaN,
    tempoMedioFila: concluidas ? Estatisticas.somaTempoEmFila / concluidas : NaN,
    utilizacao,
    maiorFila,
    filaMediaNoTempo,
    nosExpandidos: Estatisticas.nosExpandidos,
  };
}

/* ---------- calibração dos pesos ---------- */

const dijkstra = AlgoritmosDeBusca.porId.dijkstra;
const criterioPeso = CriteriosDeCusto.porId.peso;

function custoMedioEntrePares(): number {
  const custos: number[] = [];
  for (let a = 0; a < Malha.nos.length; a++)
    for (let b = a + 1; b < Malha.nos.length; b++) custos.push(dijkstra.buscar(a, b, criterioPeso)!.custo);
  return media(custos);
}

Malha.gerar(MALHA.nos, MALHA.rotasExtras, MALHA.semente);
const pesosOriginais = Malha.arestas.map((a) => a.peso);
const custoMedioOriginal = custoMedioEntrePares();

function aplicarFator(fator: number): void {
  pesosOriginais.forEach((peso, indice) => Malha.definirPeso(indice, peso * fator));
}

let fatorDePeso = 1;
let melhorDiferenca = Infinity;
for (let f = 0.2; f <= 1.0001; f += 0.001) {
  aplicarFator(f);
  const diferenca = Math.abs(custoMedioEntrePares() - VIAGEM_MEDIA_ALVO_H);
  if (diferenca < melhorDiferenca - 1e-9) {
    melhorDiferenca = diferenca;
    fatorDePeso = f;
  }
}
aplicarFator(fatorDePeso);
const custoMedioCalibrado = custoMedioEntrePares();

/** Gera a malha 7 e aplica a calibração. É o que todo cenário usa. */
function prepararMalha(): void {
  Malha.gerar(MALHA.nos, MALHA.rotasExtras, MALHA.semente);
  aplicarFator(fatorDePeso);
}

/* ---------- estrutura da malha: grau e centralidade de cada nó ---------- */

prepararMalha();
const estrutura = Malha.nos.map((no) => {
  const custos = Malha.nos
    .filter((outro) => outro.indice !== no.indice)
    .map((outro) => dijkstra.buscar(no.indice, outro.indice, criterioPeso)!.custo);
  return {
    no: no.nome,
    indice: no.indice,
    grau: Malha.adjacencia[no.indice].length,
    custoMedioAosOutros: media(custos),
    excentricidade: Math.max(...custos),
    x: Math.round(no.x),
    y: Math.round(no.y),
  };
});
const arestas = Malha.arestas.map((a) => ({
  de: Malha.nos[a.de].nome,
  para: Malha.nos[a.para].nome,
  pesoOriginal: pesosOriginais[a.indice],
  peso: a.peso,
}));
const postosPadrao = (() => {
  Malha.configurarPostos(4);
  return Malha.nosComPosto().map((no) => no.indice);
})();

/* ---------- ensaio 1: posto único em cada nó ---------- */

const DEMANDA_1 = 12;
const ensaio1: Record<string, unknown>[] = [];
const brutos1: Record<string, unknown>[] = [];

function cenario1(nome: string, postos: number[]) {
  for (const janela of [
    { janela: '24 h', demanda: HORAS, total: HORAS },
    { janela: '24 h de demanda, acompanhadas até 240 h', demanda: HORAS, total: HORAS_LONGAS },
  ]) {
    const medidas = SEMENTES_DE_VIAGEM.map((s) => {
      const m = rodar(postos, DEMANDA_1, s, janela.demanda, janela.total);
      brutos1.push({ cenario: nome, janela: janela.janela, semente: s, ...m });
      return m;
    });
    ensaio1.push({
      cenario: nome,
      postos: postos.map((i) => Malha.nos[i].nome).join('+') || '-',
      janela: janela.janela,
      ...resumir(medidas),
    });
  }
}

cenario1('sem posto', []);
for (const no of estrutura) cenario1(`posto em ${no.no}`, [no.indice]);
cenario1('4 postos por grau (padrão)', postosPadrao);

/* ---------- ensaio 2: saturação ---------- */

const DEMANDAS = [6, 12, 24, 48, 96, 192, 384, 768];
const melhorNo = estrutura
  .map((e) => ({ indice: e.indice, concluidas: ensaio1.find((l) => l.cenario === `posto em ${e.no}` && l.janela !== '24 h')!.concluidas as number }))
  .sort((a, b) => b.concluidas - a.concluidas)[0].indice;

const ensaio2: Record<string, unknown>[] = [];
const brutos2: Record<string, unknown>[] = [];
for (const rede of [
  { nome: `1 posto em ${Malha.nos[melhorNo].nome}`, postos: [melhorNo] },
  { nome: '4 postos por grau (padrão)', postos: postosPadrao },
]) {
  for (const janela of [
    { janela: '24 h', total: HORAS },
    { janela: '240 h contínuas', total: HORAS_LONGAS },
  ])
    for (const demanda of DEMANDAS) {
      const medidas = SEMENTES_DE_VIAGEM.map((s) => {
        const m = rodar(rede.postos, demanda, s, janela.total, janela.total);
        brutos2.push({ rede: rede.nome, janela: janela.janela, chegadasPorDia: demanda, semente: s, ...m });
        return m;
      });
      ensaio2.push({ rede: rede.nome, janela: janela.janela, chegadasPorDia: demanda, ...resumir(medidas) });
    }
}

/* ---------- gravação ---------- */

writeFileSync(join(PASTA, 'malha7-estrutura.csv'), csv(estrutura));
writeFileSync(join(PASTA, 'malha7-arestas.csv'), csv(arestas));
writeFileSync(join(PASTA, 'ensaio1-posicao-do-posto.csv'), csv(ensaio1));
writeFileSync(join(PASTA, 'ensaio1-brutos.csv'), csv(brutos1));
writeFileSync(join(PASTA, 'ensaio2-saturacao.csv'), csv(ensaio2));
writeFileSync(join(PASTA, 'ensaio2-brutos.csv'), csv(brutos2));
writeFileSync(
  join(PASTA, 'resumo.json'),
  JSON.stringify({ malha: MALHA, horas: HORAS, passo: PASSO, repeticoes: REPETICOES, demandaEnsaio1: DEMANDA_1,
    calibracao: { alvoH: VIAGEM_MEDIA_ALVO_H, fatorDePeso, custoMedioOriginal, custoMedioCalibrado },
    postosPadrao: postosPadrao.map((i) => Malha.nos[i].nome), melhorNo: Malha.nos[melhorNo].nome,
    estrutura, ensaio1, ensaio2 }, null, 2)
);
const C1 = ['cenario','janela','concluidas','emAndamento','panes','arriscadas','recargas','oportunistas','tempoMedioViagem','tempoMedioFila','utilizacao','maiorFila'];
const C2 = ['rede','janela','chegadasPorDia','iniciadas','concluidas','emAndamento','panes','arriscadas','recargas','tempoMedioViagem','tempoMedioFila','utilizacao','maiorFila','filaMediaNoTempo'];
mostrar(estrutura as Record<string, unknown>[], ['no','grau','custoMedioAosOutros','excentricidade']);
console.log('calibração: fator', fatorDePeso.toFixed(3), 'custo médio entre pares', custoMedioOriginal.toFixed(2), '->', custoMedioCalibrado.toFixed(2), 'h');
console.log('pesos:', arestas.map((a) => `${a.de}${a.para}:${a.pesoOriginal}->${a.peso}`).join(' '));
console.log('postos padrão:', postosPadrao.map((i) => Malha.nos[i].nome).join('+'), ' melhor nó (janela longa):', Malha.nos[melhorNo].nome, '\n');
mostrar(ensaio1, C1);
mostrar(ensaio2, C2);
