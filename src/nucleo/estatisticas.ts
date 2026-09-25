export interface Amostra {
  hora: number;
  emRota: number;
  naFila: number;
  recarregando: number;
}

export const Estatisticas = {
  /** Toda vez que um carro é despachado para um destino (colocado, redespachado
      ou reposicionado), concluída ou não ainda. Base dos percentuais do
      detalhamento: quem ainda está em rota/fila/recarga entra aqui, então o
      total não bate 100% antes de tudo terminar. */
  viagensIniciadas: 0,
  viagensConcluidas: 0,
  falhasPorPane: 0,      // a bateria zerou no meio da estrada
  falhasPorRota: 0,      // não existe caminho no grafo
  /* Não é falha: conta as viagens que saíram sabendo que a bateria não dava e
     que não havia posto no caminho. Serve para ler quantas panes eram previsíveis. */
  saidasArriscadas: 0,
  recargasConcluidas: 0,
  /** Quantas dessas foram paradas oportunistas, fora do plano de rota. */
  recargasOportunistas: 0,
  somaTempoDeViagem: 0,
  somaTempoEmFila: 0,
  somaBateriaGasta: 0,
  somaBateriaRecebida: 0,
  somaPesoPercorrido: 0,
  somaTempoRecarregando: 0,
  nosExpandidos: 0,
  historico: [] as Amostra[],

  zerar(): void {
    Object.assign(this, {
      viagensIniciadas: 0,
      viagensConcluidas: 0,
      falhasPorPane: 0,
      falhasPorRota: 0,
      saidasArriscadas: 0,
      recargasConcluidas: 0,
      recargasOportunistas: 0,
      somaTempoDeViagem: 0,
      somaTempoEmFila: 0,
      somaBateriaGasta: 0,
      somaBateriaRecebida: 0,
      somaPesoPercorrido: 0,
      somaTempoRecarregando: 0,
      nosExpandidos: 0,
      historico: [],
    });
  },

  get totalDeFalhas(): number {
    return this.falhasPorPane + this.falhasPorRota;
  },
  get viagensEncerradas(): number {
    return this.viagensConcluidas + this.totalDeFalhas;
  },
};
