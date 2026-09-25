export const CORES = {
  gelo: '#5cc4e8',     // carro em rota
  ambar: '#f0a848',    // fila e recarga
  ameixa: '#cc6ba2',   // falha
  menta: '#6ed7a5',    // viagem concluída
  violeta: '#9d8bf7',  // busca do Dijkstra
  clara: '#dde7f1',
} as const;

export function corDaSituacao(situacao: string): string {
  if (situacao === 'falhou') return CORES.ameixa;
  if (situacao === 'chegou') return CORES.menta;
  if (situacao === 'na fila' || situacao === 'recarregando') return CORES.ambar;
  return CORES.gelo;
}

export function corDaBateria(fracao: number): string {
  return fracao < 0.2 ? CORES.ameixa : fracao < 0.45 ? CORES.ambar : CORES.menta;
}
