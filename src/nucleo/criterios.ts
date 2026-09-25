import { Malha } from './malha';
import type { Criterio } from './tipos';

/* Hoje existe um critério só: o peso da aresta, que é ao mesmo tempo o tempo de
   viagem e o gasto de bateria. O registro fica aqui de propósito.
   EXTENSÃO: registre um segundo critério e o seletor reaparece sozinho na
   interface, que decide mostrá-lo quando a lista tem mais de um item. */
export const CriteriosDeCusto = {
  lista: [] as Criterio[],
  porId: {} as Record<string, Criterio>,
  registrar(criterio: Criterio): void {
    this.porId[criterio.id] = criterio;
    this.lista.push(criterio);
  },
};

CriteriosDeCusto.registrar({
  id: 'peso',
  nome: 'Peso da aresta',
  custoDaAresta: (aresta) => aresta.peso,
  /* Distância em linha reta vezes a menor razão peso/comprimento da malha.
     Continua admissível depois de qualquer edição de peso, que é o que garante
     que o A* siga devolvendo o mesmo caminho ótimo do Dijkstra. */
  estimativaAteDestino: (deIndice, paraIndice) =>
    Malha.distanciaEmLinhaReta(deIndice, paraIndice) * Malha.menorRazaoDePeso,
});
