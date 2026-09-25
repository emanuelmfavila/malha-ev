import { AlgoritmosDeBusca } from './algoritmos';
import { CriteriosDeCusto } from './criterios';
import { Estatisticas } from './estatisticas';
import { Malha } from './malha';
import type { Carro, Configuracao, Plano, ResultadoDaBusca } from './tipos';

/* Memória do custo restante de cada posto até um destino. Vale enquanto a malha, os
   postos e o critério forem os mesmos; a assinatura detecta qualquer mudança. */
let memoriaDeRestante: { assinatura: string; porDestino: Map<number, Map<number, number>> } | null = null;

export const Planejador = {
  calcularCaminho(origem: number, destino: number, configuracao: Configuracao): ResultadoDaBusca | null {
    const criterio = CriteriosDeCusto.porId[configuracao.criterio];
    const algoritmo = AlgoritmosDeBusca.porId[configuracao.algoritmo];
    const resultado = algoritmo.buscar(origem, destino, criterio);
    if (resultado) Estatisticas.nosExpandidos += resultado.nosExpandidos;
    return resultado;
  },

  /** Soma dos pesos do caminho: o tempo de viagem em horas. Vezes o consumo por
      hora, é o gasto de bateria em pontos. */
  pesoDoCaminho(caminho: number[]): number {
    let total = 0;
    for (let passo = 0; passo < caminho.length - 1; passo++)
      total += Malha.arestaEntre(caminho[passo], caminho[passo + 1])!.peso;
    return total;
  },

  /* Custo restante de cada posto até o destino, permitindo encadear postos: um posto
     vale se de lá, com a bateria cheia menos a reserva, dá para chegar ao destino ou a
     outro posto que vale. É um Dijkstra ao contrário sobre o grafo dos postos, com a
     recarga somada em cada elo. Postos de onde o destino não é alcançável ficam de fora:
     sem isso o carro escolhe o posto "mais perto do destino" e passa a quicar entre dois
     postos para sempre, recarregando sem nunca avançar. Essas buscas não entram na
     estatística de nós expandidos, que mede só as rotas de fato planejadas. */
  custoRestanteDosPostos(destino: number, configuracao: Configuracao): Map<number, number> {
    const postos = Malha.nosComPosto();
    const assinatura =
      configuracao.criterio + '|' + configuracao.reserva + '|' + configuracao.bateriaCheia + '|' + configuracao.consumoPorHora + '|' +
      postos.map((no) => no.indice).join(',') + '|' +
      Malha.arestas.map((a) => a.peso).join(',');
    if (!memoriaDeRestante || memoriaDeRestante.assinatura !== assinatura)
      memoriaDeRestante = { assinatura, porDestino: new Map() };
    const pronto = memoriaDeRestante.porDestino.get(destino);
    if (pronto) return pronto;

    const criterio = CriteriosDeCusto.porId[configuracao.criterio];
    const buscar = (de: number, para: number) =>
      AlgoritmosDeBusca.porId.dijkstra.buscar(de, para, criterio)?.custo;
    // quantas horas de estrada cabem numa carga cheia, descontada a reserva
    const alcance = (configuracao.bateriaCheia - configuracao.reserva) / configuracao.consumoPorHora;
    const restante = new Map<number, number>();
    for (const no of postos) {
      const direto = buscar(no.indice, destino);
      if (direto !== undefined && direto <= alcance) restante.set(no.indice, direto);
    }
    const fechados = new Set<number>();
    for (;;) {
      let atual: number | null = null;
      for (const [indice, custo] of restante)
        if (!fechados.has(indice) && (atual === null || custo < restante.get(atual)!)) atual = indice;
      if (atual === null) break;
      fechados.add(atual);
      const viaAtual = restante.get(atual)! + Malha.nos[atual].posto!.horasDeRecarga;
      for (const no of postos) {
        if (fechados.has(no.indice)) continue;
        const ateAtual = buscar(no.indice, atual);
        if (ateAtual === undefined || ateAtual > alcance) continue;
        const custo = ateAtual + viaAtual;
        if (custo < (restante.get(no.indice) ?? Infinity)) restante.set(no.indice, custo);
      }
    }
    memoriaDeRestante.porDestino.set(destino, restante);
    return restante;
  },

  /* Decide o próximo trecho: direto quando a bateria alcança, senão pelo posto de
     melhor custo somado à espera provável na fila. Só entram postos de onde o destino
     é alcançável, direto ou por uma cadeia de outros postos. Se nenhum posto assim
     estiver ao alcance, sai mesmo assim e aceita parar na estrada. Depois de recarregar
     o carro planeja de novo, então viagens com várias paradas se resolvem um posto por vez.
     EXTENSÃO: trocar esta função basta para testar outra política, por exemplo
     recarga parcial ou preferência por postos vazios. */
  planejarProximoTrecho(carro: Carro, configuracao: Configuracao): Plano {
    const reserva = configuracao.reserva;
    const consumo = configuracao.consumoPorHora;
    const disponivel = carro.bateria - reserva; // pontos de bateria utilizáveis

    const rotaDireta = this.calcularCaminho(carro.noAtual, carro.noDestinoFinal, configuracao);
    if (!rotaDireta) return { viavel: false, motivo: 'rota', explicacao: { tipo: 'sem rota' } };

    const pesoDireto = this.pesoDoCaminho(rotaDireta.caminho); // horas
    const precisaDireto = pesoDireto * consumo; // pontos de bateria
    if (precisaDireto <= disponivel + 1e-9)
      return {
        viavel: true,
        caminho: rotaDireta.caminho,
        noDeRecarga: null,
        traco: rotaDireta.ordemDeExpansao,
        explicacao: {
          tipo: 'direto',
          precisa: precisaDireto,
          horas: pesoDireto,
          disponivel,
          reserva,
          bateria: carro.bateria,
          trechos: rotaDireta.caminho.length - 1,
        },
      };

    let melhorOpcao: {
      pontuacao: number;
      caminho: number[];
      noDeRecarga: number;
      traco: number[] | null;
      esperaEstimada: number;
      pesoAteOPosto: number;
    } | null = null;
    let postosAoAlcance = 0;
    const restante = this.custoRestanteDosPostos(carro.noDestinoFinal, configuracao);

    for (const noComPosto of Malha.nosComPosto()) {
      if (noComPosto.indice === carro.noAtual) continue;
      if (noComPosto.indice === carro.ultimoPostoUsado) continue; // evita ficar indo e voltando
      const doPostoAoDestino = restante.get(noComPosto.indice);
      if (doPostoAoDestino === undefined) continue; // de lá o destino não é alcançável

      const ateOPosto = this.calcularCaminho(carro.noAtual, noComPosto.indice, configuracao);
      if (!ateOPosto) continue;
      const pesoAteOPosto = this.pesoDoCaminho(ateOPosto.caminho);
      if (pesoAteOPosto * consumo > disponivel + 1e-9) continue;
      postosAoAlcance++;

      const posto = noComPosto.posto!;
      const carrosNoPosto = posto.fila.length + posto.vagasOcupadas.filter(Boolean).length;
      const esperaEstimada = Math.max(0, carrosNoPosto - posto.vagas + 1) * posto.horasDeRecarga;
      const pontuacao = ateOPosto.custo + doPostoAoDestino + esperaEstimada * configuracao.pesoDaFila;

      if (!melhorOpcao || pontuacao < melhorOpcao.pontuacao)
        melhorOpcao = {
          pontuacao,
          caminho: ateOPosto.caminho,
          noDeRecarga: noComPosto.indice,
          traco: ateOPosto.ordemDeExpansao,
          esperaEstimada,
          pesoAteOPosto,
        };
    }

    /* Nenhum posto ao alcance. O carro vai assim mesmo, pelo caminho mais curto:
       é melhor vê-lo parar no meio do mapa por falta de bateria do que ele nunca
       sair do lugar. Quem decide se isso é aceitável é quem está olhando. */
    if (!melhorOpcao)
      return {
        viavel: true,
        caminho: rotaDireta.caminho,
        noDeRecarga: null,
        traco: rotaDireta.ordemDeExpansao,
        explicacao: {
          tipo: 'arriscado',
          precisa: precisaDireto,
          horas: pesoDireto,
          disponivel,
          reserva,
          bateria: carro.bateria,
          trechos: rotaDireta.caminho.length - 1,
        },
      };

    return {
      viavel: true,
      caminho: melhorOpcao.caminho,
      noDeRecarga: melhorOpcao.noDeRecarga,
      traco: melhorOpcao.traco,
      explicacao: {
        tipo: 'desvio',
        precisa: precisaDireto,
        horas: pesoDireto,
        disponivel,
        reserva,
        bateria: carro.bateria,
        pesoAteOPosto: melhorOpcao.pesoAteOPosto,
        esperaEstimada: melhorOpcao.esperaEstimada,
        postosAoAlcance,
        posto: melhorOpcao.noDeRecarga,
      },
    };
  },
};
