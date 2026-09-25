import { Simulacao } from '@/nucleo/simulacao';
import { AlgoritmosDeBusca } from '@/nucleo/algoritmos';
import { CORES } from '@/mapa/cores';
import { vista } from './loja';

/** Subdivide o avanço para não pular arestas curtas. */
export const PASSO_MAXIMO_H = 0.1;

export function avancarSimulacao(segundosReais: number): void {
  if (!Simulacao.emExecucao) return;
  let restante = segundosReais * Simulacao.configuracao.horasPorSegundo;
  while (restante > 0) {
    const passo = Math.min(restante, PASSO_MAXIMO_H);
    Simulacao.avancar(passo);
    restante -= passo;
  }
}

/* Assinaturas feitas uma vez só, no carregamento do módulo. Ficam fora de
   qualquer efeito do React para não duplicarem no modo estrito. */
let ligado = false;
export function ligarEventosDaVista(): void {
  if (ligado) return;
  ligado = true;

  const pulsarNoCarro = (carro: Parameters<typeof vista.posicaoDoCarro>[0], cor: string) => {
    const posicao = vista.posicaoDoCarro(carro);
    vista.criarPulso(posicao.x, posicao.y, cor);
  };

  Simulacao.eventos.quando('carroChegou', (carro) => pulsarNoCarro(carro, CORES.menta));
  Simulacao.eventos.quando('carroFalhou', (carro) => pulsarNoCarro(carro, CORES.ameixa));
  Simulacao.eventos.quando('recargaConcluida', ({ no }) => vista.criarPulso(no.x, no.y, CORES.ambar));

  /* Quando o carro acompanhado replaneja, a busca que produziu a rota nova
     aparece no mapa. É o momento em que dá para ver a decisão sendo tomada. */
  Simulacao.eventos.quando('rotaPlanejada', ({ carro, plano }) => {
    if (vista.carroSelecionado !== carro.numero || !plano.traco) return;
    const algoritmo = AlgoritmosDeBusca.porId[Simulacao.configuracao.algoritmo];
    vista.mostrarBusca(
      [
        {
          cor: algoritmo.cor,
          nome: algoritmo.nomeCurto,
          raio: 13,
          ordem: plano.traco,
          caminho: plano.caminho ?? [],
        },
      ],
      { efemera: true, duracao: 5 }
    );
  });
}
