/* Junta as partes do ensaio 4 (uma por cidade, de `npm run ensaio:regiao -- --ensaios=4 --nos=...`)
   num CSV só e no JSON que a tela /graficos lê.

   Rodar:  node ensaios/juntar-ensaio4.mjs [--dias=7 --repeticoes=30 --passo=10 --saturacao=90] */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PASTA = join(import.meta.dirname ?? new URL('.', import.meta.url).pathname, 'resultados');
const PARTES = join(PASTA, 'regiao-ensaio4-partes');
const argumentos = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));

// mesma ordem das cidades em src/nucleo/regiaoSudeste.ts
const ORDEM = ['SP', 'JUN', 'CAM', 'SOR', 'SAN', 'SJC', 'TAU', 'PIR', 'RIB', 'BAU', 'SCA', 'ARA', 'RES', 'VRE', 'RIO', 'PET', 'JDF'];
const siglas = ORDEM.filter((s) => readdirSync(PARTES).includes(`${s}.csv`));

function juntar(sufixo) {
  const arquivos = siglas.map((s) => readFileSync(join(PARTES, `${s}${sufixo}.csv`), 'utf8').trim().split('\n'));
  return [arquivos[0][0], ...arquivos.flatMap((linhas) => linhas.slice(1))].join('\n') + '\n';
}

const resumo = juntar('');
writeFileSync(join(PASTA, 'regiao-ensaio4-saturacao-por-no.csv'), resumo);
writeFileSync(join(PASTA, 'regiao-ensaio4-brutos.csv'), juntar('-brutos'));

const [cabecalho, ...linhas] = resumo.trim().split('\n').map((l) => l.split(','));
// só o que a tela /graficos usa: média e desvio de cada métrica do menu
const CAMPOS = ['tempoMedioFilaMin', 'concluidas', 'panesPorCem', 'utilizacao', 'filaMedia', 'recargas', 'tempoMedioViagemH'];
const fica = (campo) => ['posto', 'carrosPorDia'].includes(campo) || CAMPOS.includes(campo.replace(/_dp$/, ''));
const arredondar = (v) => Math.round(v * 1000) / 1000;
const sigla = Object.fromEntries(siglas.map((s) => [readFileSync(join(PARTES, `${s}.csv`), 'utf8').split('\n')[1].split(',')[0], s]));
writeFileSync(join(PASTA, 'regiao-ensaio4.json'), JSON.stringify({
  dias: Number(argumentos.dias ?? 7),
  repeticoes: Number(argumentos.repeticoes ?? 30),
  passo: Number(argumentos.passo ?? 10),
  saturacao: Number(argumentos.saturacao ?? 90),
  linhas: linhas.map((celulas) => Object.fromEntries(cabecalho.map((campo, i) => [campo, celulas[i]]).filter(([campo]) => fica(campo)).map(([campo, v]) =>
    campo === 'posto' ? [campo, v] : [campo, v === '' ? null : arredondar(Number(v))]
  ))).map((l) => ({ sigla: sigla[l.posto], ...l })),
}));
console.log(`${siglas.length} cidades, ${linhas.length} degraus`);
