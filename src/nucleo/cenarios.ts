/* Registro de cenários: de onde vem a malha, como são os postos e em que escala
   o relógio deve ser lido. EXTENSÃO: registre outro cenário aqui e ele aparece
   sozinho no seletor da interface. */

import { BATERIA_CHEIA, CONSUMO_POR_HORA, HORAS_DE_RECARGA, VAGAS_POR_POSTO } from './constantes';
import { Malha } from './malha';
import {
  CIDADES,
  CONSUMO_NA_REGIAO,
  ESTRADAS,
  KM_POR_UNIDADE_DE_MUNDO,
  RECARGA_RAPIDA_H,
  RECARGA_RAPIDA_MIN,
  VAGAS_NA_REGIAO,
  cidadeDoNo,
  montarRegiaoSudeste,
  sortearViagemNaRegiao,
} from './regiaoSudeste';
import type { No } from './tipos';

export interface ParametrosDaMalha {
  quantidadeDeNos: number;
  rotasExtras: number;
  semente: number;
}

export interface Viagem {
  origem: number;
  destino: number;
  bateria: number;
}

export interface Cenario {
  id: string;
  nome: string;
  resumo: string;
  /** Usa os controles de nós, rotas extras e semente. */
  aleatoria: boolean;
  postos: { vagas: number; horasDeRecarga: number; quantidadePadrao: number };
  /** Bateria cheia em pontos e consumo em pontos por hora de viagem. */
  bateriaCheia: number;
  consumoPorHora: number;
  /** Quantos km vale uma unidade de coordenada do mapa; null = mapa sem escala real. */
  kmPorUnidadeDeMundo: number | null;
  montar(parametros: ParametrosDaMalha): void;
  nomeCompleto(no: No): string;
  /** Como sortear uma viagem automática; null = origem, destino e bateria uniformes. */
  sortearViagem: ((sortear: () => number) => Viagem) | null;
}

const aleatoria: Cenario = {
  id: 'aleatoria',
  nome: 'Malha aleatória',
  resumo:
    'Nós espalhados por semente, ligados por árvore mínima e rotas extras. O peso é o tempo em horas ' +
    'e a bateria cai 1 ponto por hora, então peso = horas = bateria.',
  aleatoria: true,
  postos: { vagas: VAGAS_POR_POSTO, horasDeRecarga: HORAS_DE_RECARGA, quantidadePadrao: 4 },
  bateriaCheia: BATERIA_CHEIA,
  consumoPorHora: CONSUMO_POR_HORA,
  kmPorUnidadeDeMundo: null,
  montar: ({ quantidadeDeNos, rotasExtras, semente }) => {
    Malha.gerar(quantidadeDeNos, rotasExtras, semente);
  },
  nomeCompleto: (no) => `Nó ${no.nome}`,
  sortearViagem: null,
};

const sudeste: Cenario = {
  id: 'sudeste',
  nome: 'Região: corredor Sudeste',
  resumo:
    `${CIDADES.length} cidades e ${ESTRADAS.length} rodovias entre o interior de SP, o Vale do Paraíba, ` +
    `o Rio e Juiz de Fora, nas posições reais. O peso de cada rodovia é o tempo em horas; a bateria cai ` +
    `${CONSUMO_NA_REGIAO} pontos por hora, então 100 pontos dão 4 h 10 de estrada. Recarga rápida de ` +
    `${RECARGA_RAPIDA_MIN} min, ${VAGAS_NA_REGIAO} vagas por posto. Ajuste tudo isso em Configurações.`,
  aleatoria: false,
  postos: { vagas: VAGAS_NA_REGIAO, horasDeRecarga: RECARGA_RAPIDA_H, quantidadePadrao: CIDADES.length },
  bateriaCheia: BATERIA_CHEIA,
  consumoPorHora: CONSUMO_NA_REGIAO,
  kmPorUnidadeDeMundo: KM_POR_UNIDADE_DE_MUNDO,
  montar: () => montarRegiaoSudeste(),
  nomeCompleto: (no) => cidadeDoNo(no)?.nome ?? no.nome,
  sortearViagem: sortearViagemNaRegiao,
};

export const Cenarios = {
  lista: [aleatoria, sudeste] as Cenario[],
  porId: { aleatoria, sudeste } as Record<string, Cenario>,
};
