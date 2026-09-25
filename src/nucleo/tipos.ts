/* Tipos compartilhados por todo o núcleo.

   REGRA ÚNICA DO MODELO
     Uma aresta de peso P custa exatamente P horas de relógio e P pontos de
     bateria. Não existe velocidade, relevo nem consumo por carro: todo carro é
     igual, com bateria de 100 pontos. É o que faz o custo de um caminho ser a
     soma dos números desenhados nele. */

export interface VagaOcupada {
  numeroDoCarro: number;
  horasRestantes: number;
}

export interface Posto {
  vagas: number;
  horasDeRecarga: number;
  vagasOcupadas: (VagaOcupada | null)[];
  fila: number[];
  horasDeVagaOcupada: number;
  recargasConcluidas: number;
  maiorFila: number;
}

export interface No {
  indice: number;
  x: number;
  y: number;
  nome: string;
  posto: Posto | null;
}

export interface Aresta {
  indice: number;
  de: number;
  para: number;
  peso: number;
}

export interface Ligacao {
  destino: number;
  aresta: Aresta;
}

export type SituacaoDoCarro = 'em rota' | 'na fila' | 'recarregando' | 'chegou' | 'falhou';
export type MotivoDaFalha = 'rota' | 'bateria' | null;
export type TipoDeEntrada = 'partida' | 'rota' | 'desvio' | 'fila' | 'recarga' | 'chegada' | 'falha';

export interface EntradaDoDiario {
  hora: number;
  tipo: TipoDeEntrada;
  texto: string;
}

/* Um carro pode fazer várias viagens sem sair da malha. Os números da bateria
   são acumulados a vida inteira, então a estatística de cada viagem sai da
   diferença entre agora e este retrato, tirado na largada. */
export interface RetratoDaViagem {
  hora: number;
  horasEmFila: number;
  horasRecarregando: number;
  bateriaGasta: number;
  pesoPercorrido: number;
}

export interface Carro {
  numero: number;
  nome: string;

  /* Contabilidade da bateria. A invariante que os testes defendem é
     bateriaInicial + bateriaRecebida - bateriaGasta === bateria. */
  bateria: number;
  bateriaInicial: number;
  bateriaRecebida: number;
  bateriaGasta: number;

  noDeOrigem: number;
  noAtual: number;
  noDestinoFinal: number;
  noDeRecargaPlanejado: number | null;
  ultimoPostoUsado: number;

  caminho: number[];
  indiceNoCaminho: number;
  arestaAtual: Aresta | null;
  progressoNaAresta: number;

  situacao: SituacaoDoCarro;
  motivoDaFalha: MotivoDaFalha;

  horaDePartida: number;
  horaDeChegada: number | null;
  horasEmFila: number;
  horasRecarregando: number;
  horaDeEntradaNaFila: number;

  pesoPercorrido: number;
  recargasFeitas: number;
  matiz: number;
  diario: EntradaDoDiario[];

  /** Quantas viagens este carro já fechou, e quantas terminaram mal. */
  viagensConcluidas: number;
  viagensFalhadas: number;
  inicioDaViagem: RetratoDaViagem;
}

export interface Criterio {
  id: string;
  nome: string;
  custoDaAresta(aresta: Aresta): number;
  /** Precisa ser admissível: nunca maior que o custo real até o destino,
      senão o A* deixa de garantir o caminho ótimo. */
  estimativaAteDestino(deIndice: number, paraIndice: number): number;
}

export interface ResultadoDaBusca {
  caminho: number[];
  custo: number;
  nosExpandidos: number;
  /** Só vem preenchido quando a gravação está ligada, para animar a busca. */
  ordemDeExpansao: number[] | null;
}

export interface Algoritmo {
  id: string;
  nome: string;
  nomeCurto: string;
  resumo: string;
  cor: string;
  buscar(origem: number, destino: number, criterio: Criterio): ResultadoDaBusca | null;
}

export interface Configuracao {
  algoritmo: string;
  criterio: string;
  /** Capacidade da bateria em pontos de peso: quanto de estrada cabe numa carga. */
  bateriaCheia: number;
  reserva: number;
  /** Passou num posto com a bateria neste nível ou abaixo, para e recarrega,
      mesmo que a parada não estivesse no plano. Zero desliga a regra. */
  limiarDeRecarga: number;
  pesoDaFila: number;
  chegadasAutomaticas: boolean;
  chegadasPorDia: number;
  horasPorSegundo: number;
}

export type TipoDeExplicacao = 'direto' | 'desvio' | 'arriscado' | 'sem rota';

export interface Explicacao {
  tipo: TipoDeExplicacao;
  precisa?: number;
  disponivel?: number;
  reserva?: number;
  bateria?: number;
  trechos?: number;
  pesoAteOPosto?: number;
  esperaEstimada?: number;
  postosAoAlcance?: number;
  posto?: number;
}

export interface Plano {
  viavel: boolean;
  motivo?: Exclude<MotivoDaFalha, null>;
  caminho?: number[];
  noDeRecarga?: number | null;
  traco?: number[] | null;
  explicacao: Explicacao;
}
