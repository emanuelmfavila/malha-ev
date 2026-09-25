import { FilaDePrioridade } from './filaDePrioridade';
import { Malha } from './malha';
import type { Algoritmo, Criterio, ResultadoDaBusca } from './tipos';

export const AlgoritmosDeBusca = {
  lista: [] as Algoritmo[],
  porId: {} as Record<string, Algoritmo>,
  /* Ligado só quando alguém está olhando: com isso a busca guarda a ordem em que
     abriu cada nó, que é o que a animação de comparação desenha. Desligado, o
     custo extra some e o motor roda em lote na velocidade de sempre. */
  gravarExpansao: false,
  registrar(algoritmo: Algoritmo): void {
    this.porId[algoritmo.id] = algoritmo;
    this.lista.push(algoritmo);
  },
};

function reconstruirCaminho(anterior: Int32Array, origem: number, destino: number): number[] | null {
  if (origem === destino) return [origem];
  if (anterior[destino] === -1) return null;
  const caminho = [destino];
  let atual = destino;
  while (atual !== origem) {
    atual = anterior[atual];
    if (atual === -1) return null;
    caminho.push(atual);
  }
  return caminho.reverse();
}

/* Dijkstra e A* são a mesma busca; a única diferença é a prioridade com que um
   nó entra na fila. Escrever as duas a partir de uma função só deixa isso
   explícito e impede que elas divirjam por descuido. */
function buscarComPrioridade(
  origem: number,
  destino: number,
  criterio: Criterio,
  estimar: (indice: number) => number
): ResultadoDaBusca | null {
  const total = Malha.nos.length;
  const custoAcumulado = new Float64Array(total).fill(Infinity);
  const anterior = new Int32Array(total).fill(-1);
  const finalizado = new Uint8Array(total);
  const fila = new FilaDePrioridade<number>();
  const ordemDeExpansao = AlgoritmosDeBusca.gravarExpansao ? ([] as number[]) : null;
  let nosExpandidos = 0;

  custoAcumulado[origem] = 0;
  fila.inserir(origem, estimar(origem));
  while (fila.tamanho) {
    const { valor: atual } = fila.remover();
    if (finalizado[atual]) continue;
    finalizado[atual] = 1;
    nosExpandidos++;
    ordemDeExpansao?.push(atual);
    if (atual === destino) break;
    for (const { destino: vizinho, aresta } of Malha.adjacencia[atual]) {
      const novoCusto = custoAcumulado[atual] + criterio.custoDaAresta(aresta);
      if (novoCusto < custoAcumulado[vizinho]) {
        custoAcumulado[vizinho] = novoCusto;
        anterior[vizinho] = atual;
        fila.inserir(vizinho, novoCusto + estimar(vizinho));
      }
    }
  }
  const caminho = reconstruirCaminho(anterior, origem, destino);
  return caminho
    ? { caminho, custo: custoAcumulado[destino], nosExpandidos, ordemDeExpansao }
    : null;
}

/** Abre os nós em ordem crescente de custo a partir da origem, sem olhar onde
    fica o destino: por isso a mancha de nós abertos cresce em círculo. */
AlgoritmosDeBusca.registrar({
  id: 'dijkstra',
  nome: 'Dijkstra',
  nomeCurto: 'Dijkstra',
  resumo: 'Cresce igual para todo lado, não sabe onde fica o destino.',
  cor: '#9d8bf7',
  buscar: (origem, destino, criterio) =>
    buscarComPrioridade(origem, destino, criterio, () => 0),
});

/** Mesma busca, guiada pela distância em linha reta até o destino. A estimativa
    nunca passa do custo real, então o caminho continua ótimo, só que a mancha
    de nós abertos se estica na direção do destino em vez de virar círculo. */
AlgoritmosDeBusca.registrar({
  id: 'estrela',
  nome: 'A* com estimativa geográfica',
  nomeCurto: 'A*',
  resumo: 'Mesma garantia de ótimo, só que puxada na direção do destino.',
  cor: '#5cc4e8',
  buscar: (origem, destino, criterio) =>
    buscarComPrioridade(origem, destino, criterio, (indice) =>
      criterio.estimativaAteDestino(indice, destino)
    ),
});
