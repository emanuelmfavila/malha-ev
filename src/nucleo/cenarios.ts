/* Registro de cenários: de onde vem a malha, como são os postos e em que escala
   o relógio deve ser lido. EXTENSÃO: registre outro cenário aqui e ele aparece
   sozinho no seletor da interface. */

import { HORAS_DE_RECARGA, VAGAS_POR_POSTO } from './constantes';
import { Malha } from './malha';
import {
  CIDADES,
  ESTRADAS,
  KM_POR_UNIDADE_DE_MUNDO,
  MINUTOS_POR_UNIDADE,
  RECARGA_RAPIDA_MIN,
  VAGAS_NA_REGIAO,
  cidadeDoNo,
  montarRegiaoSudeste,
  sortearViagemNaRegiao,
  unidades,
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
  /** Quanto vale uma unidade do modelo em minutos reais; null = a unidade é a hora. */
  minutosPorUnidade: number | null;
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
  resumo: 'Nós espalhados por semente, ligados por árvore mínima e rotas extras. Peso = horas = bateria.',
  aleatoria: true,
  postos: { vagas: VAGAS_POR_POSTO, horasDeRecarga: HORAS_DE_RECARGA, quantidadePadrao: 4 },
  minutosPorUnidade: null,
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
    `o Rio e Juiz de Fora, nas posições reais. Cada unidade vale ${MINUTOS_POR_UNIDADE} min: a bateria ` +
    `de 100 dá 4 h 10 de estrada, a recarga rápida leva ${RECARGA_RAPIDA_MIN} min e cada posto tem ` +
    `${VAGAS_NA_REGIAO} vagas. Ajuste tudo isso em Configurações.`,
  aleatoria: false,
  postos: { vagas: VAGAS_NA_REGIAO, horasDeRecarga: unidades(RECARGA_RAPIDA_MIN), quantidadePadrao: CIDADES.length },
  minutosPorUnidade: MINUTOS_POR_UNIDADE,
  kmPorUnidadeDeMundo: KM_POR_UNIDADE_DE_MUNDO,
  montar: () => montarRegiaoSudeste(),
  nomeCompleto: (no) => cidadeDoNo(no)?.nome ?? no.nome,
  sortearViagem: sortearViagemNaRegiao,
};

export const Cenarios = {
  lista: [aleatoria, sudeste] as Cenario[],
  porId: { aleatoria, sudeste } as Record<string, Cenario>,
};
