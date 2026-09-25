/* Cenário de região: corredor Sudeste (interior de SP, Vale do Paraíba, Rio e
   Juiz de Fora). Dados puros, sem React e sem DOM: a interface e os ensaios em
   lote montam a mesma malha a partir daqui.

   O peso de cada rodovia é o tempo de viagem em horas. A bateria cai 24 pontos
   por hora, então a bateria cheia de 100 pontos dá 4 h 10 de estrada, cerca de
   330 km a 80 km/h, a autonomia de um elétrico comum em rodovia. A recarga
   rápida (DC, até encher) leva 50 min. Reserva de 10 pontos = 25 min de estrada.

   Os tempos de estrada são aproximações de viagem em condições normais e devem
   ser conferidos antes de publicar; trocar a região é trocar as duas tabelas. */

import { Malha } from './malha';
import type { No } from './tipos';

/** Pontos de bateria por hora de estrada: 100 pontos = 4 h 10 de autonomia. */
export const CONSUMO_NA_REGIAO = 24;
export const RECARGA_RAPIDA_MIN = 50;
export const RECARGA_RAPIDA_H = RECARGA_RAPIDA_MIN / 60;
export const VAGAS_NA_REGIAO = 4;

export const horas = (minutos: number): number => minutos / 60;

export interface Cidade {
  sigla: string;
  nome: string;
  /** população em milhares (Censo 2022, aproximado) */
  pop: number;
  lat: number;
  lon: number;
}

export const CIDADES: Cidade[] = [
  { sigla: 'SP',  nome: 'São Paulo',           pop: 11451, lat: -23.55, lon: -46.63 },
  { sigla: 'JUN', nome: 'Jundiaí',             pop: 443,   lat: -23.19, lon: -46.88 },
  { sigla: 'CAM', nome: 'Campinas',            pop: 1139,  lat: -22.91, lon: -47.06 },
  { sigla: 'SOR', nome: 'Sorocaba',            pop: 723,   lat: -23.50, lon: -47.46 },
  { sigla: 'SAN', nome: 'Santos',              pop: 418,   lat: -23.96, lon: -46.33 },
  { sigla: 'SJC', nome: 'São José dos Campos', pop: 697,   lat: -23.19, lon: -45.88 },
  { sigla: 'TAU', nome: 'Taubaté',             pop: 279,   lat: -23.03, lon: -45.56 },
  { sigla: 'PIR', nome: 'Piracicaba',          pop: 423,   lat: -22.73, lon: -47.65 },
  { sigla: 'RIB', nome: 'Ribeirão Preto',      pop: 699,   lat: -21.18, lon: -47.81 },
  { sigla: 'BAU', nome: 'Bauru',               pop: 380,   lat: -22.31, lon: -49.06 },
  { sigla: 'SCA', nome: 'São Carlos',          pop: 254,   lat: -22.02, lon: -47.89 },
  { sigla: 'ARA', nome: 'Araraquara',          pop: 242,   lat: -21.79, lon: -48.18 },
  { sigla: 'RES', nome: 'Resende',             pop: 132,   lat: -22.47, lon: -44.45 },
  { sigla: 'VRE', nome: 'Volta Redonda',       pop: 261,   lat: -22.52, lon: -44.10 },
  { sigla: 'RIO', nome: 'Rio de Janeiro',      pop: 6211,  lat: -22.91, lon: -43.17 },
  { sigla: 'PET', nome: 'Petrópolis',          pop: 279,   lat: -22.51, lon: -43.18 },
  { sigla: 'JDF', nome: 'Juiz de Fora',        pop: 541,   lat: -21.76, lon: -43.35 },
];

/** [de, para, minutos de estrada em condições normais] */
export const ESTRADAS: [string, string, number][] = [
  ['SP', 'JUN', 55],   ['JUN', 'CAM', 40],  ['SP', 'CAM', 80],   ['SP', 'SOR', 85],
  ['SOR', 'CAM', 75],  ['SP', 'SAN', 65],   ['SP', 'SJC', 85],   ['SJC', 'TAU', 40],
  ['CAM', 'SJC', 110], ['CAM', 'PIR', 65],  ['CAM', 'SCA', 110], ['PIR', 'SCA', 105],
  ['SCA', 'ARA', 35],  ['ARA', 'RIB', 80],  ['CAM', 'RIB', 160], ['SCA', 'BAU', 115],
  ['SOR', 'BAU', 180], ['TAU', 'RES', 105], ['RES', 'VRE', 40],  ['VRE', 'RIO', 115],
  ['RIO', 'PET', 75],  ['PET', 'JDF', 105],
];

const cidadePorNome = new Map(CIDADES.map((c) => [c.nome, c]));
export const indicePorSigla = new Map(CIDADES.map((c, i) => [c.sigla, i]));

/** A cidade de um nó da região (o nome do nó é o nome da cidade). */
export function cidadeDoNo(no: No): Cidade | undefined {
  return cidadePorNome.get(no.nome);
}

/* Projeção equirretangular: 1° de latitude = 111 km e 1° de longitude = 111 km
   × cos(latitude média). A mesma escala nos dois eixos mantém as proporções
   reais do mapa; a região é centrada no mundo de 1000 × 680 com margem. */
const KM_POR_GRAU = 111;
const LAT_MEDIA = CIDADES.reduce((s, c) => s + c.lat, 0) / CIDADES.length;
const COS_LAT = Math.cos((LAT_MEDIA * Math.PI) / 180);
const lonMin = Math.min(...CIDADES.map((c) => c.lon));
const lonMax = Math.max(...CIDADES.map((c) => c.lon));
const latMin = Math.min(...CIDADES.map((c) => c.lat));
const latMax = Math.max(...CIDADES.map((c) => c.lat));
const LARGURA_KM = (lonMax - lonMin) * KM_POR_GRAU * COS_LAT;
const ALTURA_KM = (latMax - latMin) * KM_POR_GRAU;
const MARGEM = 60;
/** Quantas unidades do mundo (pixels de referência) vale um quilômetro. */
export const UNIDADES_DE_MUNDO_POR_KM = Math.min((1000 - 2 * MARGEM) / LARGURA_KM, (680 - 2 * MARGEM) / ALTURA_KM);
export const KM_POR_UNIDADE_DE_MUNDO = 1 / UNIDADES_DE_MUNDO_POR_KM;

export function posicaoNoMundo(c: { lat: number; lon: number }): { x: number; y: number } {
  const x = (c.lon - lonMin) * KM_POR_GRAU * COS_LAT * UNIDADES_DE_MUNDO_POR_KM;
  const y = (latMax - c.lat) * KM_POR_GRAU * UNIDADES_DE_MUNDO_POR_KM;
  const sobraX = (1000 - LARGURA_KM * UNIDADES_DE_MUNDO_POR_KM) / 2;
  const sobraY = (680 - ALTURA_KM * UNIDADES_DE_MUNDO_POR_KM) / 2;
  return { x: sobraX + x, y: sobraY + y };
}

/** Monta a malha da região no lugar da malha aleatória. As coordenadas vêm da
    projeção acima; elas orientam o desenho e a heurística do A*, que continua
    admissível com qualquer geometria porque usa a menor razão peso/comprimento
    da malha. O nome do nó é o nome da cidade. */
export function montarRegiaoSudeste(): void {
  Malha.nos = CIDADES.map((c, indice) => ({
    indice,
    ...posicaoNoMundo(c),
    nome: c.nome,
    posto: null,
  }));
  Malha.arestas = [];
  Malha.adjacencia = Malha.nos.map(() => []);
  for (const [de, para, minutos] of ESTRADAS) {
    const aresta = Malha.conectar(indicePorSigla.get(de)!, indicePorSigla.get(para)!);
    Malha.definirPeso(aresta.indice, horas(minutos));
  }
}

/* ---------- demanda ---------- */

/** Peso de cada hora do dia nas partidas: picos de manhã e de fim de tarde. */
export const PERFIL_HORARIO = [0.2, 0.1, 0.1, 0.1, 0.2, 0.5, 1.0, 1.6, 1.6, 1.3, 1.1, 1.0,
                               1.0, 1.0, 1.1, 1.3, 1.6, 1.7, 1.4, 1.0, 0.7, 0.5, 0.4, 0.3];

/** Origem e destino sorteados com peso = raiz da população, para as capitais
    não engolirem o resto. */
const PESO_DA_CIDADE = CIDADES.map((c) => Math.sqrt(c.pop));

export function sortearCidade(sortear: () => number, excluir = -1): number {
  const total = PESO_DA_CIDADE.reduce((s, p, i) => (i === excluir ? s : s + p), 0);
  let alvo = sortear() * total;
  for (let i = 0; i < PESO_DA_CIDADE.length; i++) {
    if (i === excluir) continue;
    alvo -= PESO_DA_CIDADE[i];
    if (alvo <= 0) return i;
  }
  return PESO_DA_CIDADE.length - 1;
}

/** 70% dos carros saem de casa com 80 a 100% (recarga doméstica); 30% com 40 a 80%. */
export function sortearBateria(sortear: () => number): number {
  return Math.round(sortear() < 0.7 ? 80 + sortear() * 20 : 40 + sortear() * 40);
}

export function sortearViagemNaRegiao(sortear: () => number): { origem: number; destino: number; bateria: number } {
  const origem = sortearCidade(sortear);
  return { origem, destino: sortearCidade(sortear, origem), bateria: sortearBateria(sortear) };
}
