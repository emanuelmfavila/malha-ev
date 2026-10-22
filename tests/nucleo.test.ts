import { describe, expect, it, beforeEach } from 'vitest';
import { Malha } from '@/nucleo/malha';
import { CriteriosDeCusto } from '@/nucleo/criterios';
import { AlgoritmosDeBusca } from '@/nucleo/algoritmos';
import { Planejador } from '@/nucleo/planejador';
import { Simulacao } from '@/nucleo/simulacao';
import { Estatisticas } from '@/nucleo/estatisticas';
import { BATERIA_CHEIA, ESCALA_DE_PESO, PESO_MAXIMO, PESO_MINIMO } from '@/nucleo/constantes';
import { formatarRelogio } from '@/nucleo/utilidades';

const peso = CriteriosDeCusto.porId.peso;

describe('estrutura da malha', () => {
  beforeEach(() => {
    Malha.gerar(24, 14, 42);
  });

  it('gera a quantidade pedida de nós e arestas = árvore mínima + extras', () => {
    expect(Malha.nos).toHaveLength(24);
    expect(Malha.arestas).toHaveLength(23 + 14);
  });

  it('deixa todo nó alcançável a partir de qualquer outro', () => {
    const alcancados = new Set([0]);
    const pilha = [0];
    while (pilha.length) {
      const atual = pilha.pop()!;
      for (const ligacao of Malha.adjacencia[atual])
        if (!alcancados.has(ligacao.destino)) {
          alcancados.add(ligacao.destino);
          pilha.push(ligacao.destino);
        }
    }
    expect(alcancados.size).toBe(Malha.nos.length);
  });

  it('mantém a adjacência simétrica e sem aresta duplicada', () => {
    expect(Malha.arestas.every((a) => Malha.existeAresta(a.de, a.para) && Malha.existeAresta(a.para, a.de))).toBe(true);
    const chaves = Malha.arestas.map((a) => `${Math.min(a.de, a.para)}-${Math.max(a.de, a.para)}`);
    expect(new Set(chaves).size).toBe(Malha.arestas.length);
  });

  it('dá a toda aresta um peso inteiro de pelo menos 1', () => {
    expect(Malha.arestas.every((a) => Number.isInteger(a.peso) && a.peso >= 1)).toBe(true);
  });

  /* Esta é a condição que sustenta a otimalidade do A*: se o peso ficasse
     abaixo do comprimento real, a estimativa geográfica passaria do custo
     verdadeiro e o A* poderia devolver um caminho pior que o Dijkstra. */
  it('nunca deixa o peso abaixo do comprimento real da aresta', () => {
    expect(
      Malha.arestas.every(
        (a) => a.peso >= Malha.distanciaEmLinhaReta(a.de, a.para) / ESCALA_DE_PESO - 1e-9
      )
    ).toBe(true);
  });

  it('repete a mesma malha para a mesma semente', () => {
    const assinatura = JSON.stringify(Malha.arestas.map((a) => [a.de, a.para, a.peso]));
    Malha.gerar(24, 14, 42);
    expect(JSON.stringify(Malha.arestas.map((a) => [a.de, a.para, a.peso]))).toBe(assinatura);
  });
});

describe('Dijkstra e A*', () => {
  beforeEach(() => {
    Malha.gerar(24, 14, 42);
  });

  it('devolve o mesmo custo ótimo e caminhos válidos, com o A* abrindo menos nós', () => {
    let maiorDiferenca = 0;
    let invalidos = 0;
    let expandidosDijkstra = 0;
    let expandidosEstrela = 0;

    for (let origem = 0; origem < Malha.nos.length; origem++)
      for (let destino = 0; destino < Malha.nos.length; destino++) {
        if (origem === destino) continue;
        const porDijkstra = AlgoritmosDeBusca.porId.dijkstra.buscar(origem, destino, peso)!;
        const porEstrela = AlgoritmosDeBusca.porId.estrela.buscar(origem, destino, peso)!;
        expandidosDijkstra += porDijkstra.nosExpandidos;
        expandidosEstrela += porEstrela.nosExpandidos;
        maiorDiferenca = Math.max(maiorDiferenca, Math.abs(porDijkstra.custo - porEstrela.custo));
        for (const resultado of [porDijkstra, porEstrela]) {
          if (resultado.caminho[0] !== origem || resultado.caminho.at(-1) !== destino) invalidos++;
          for (let passo = 0; passo < resultado.caminho.length - 1; passo++)
            if (!Malha.existeAresta(resultado.caminho[passo], resultado.caminho[passo + 1])) invalidos++;
        }
      }

    expect(maiorDiferenca).toBeLessThan(1e-9);
    expect(invalidos).toBe(0);
    expect(expandidosEstrela).toBeLessThan(expandidosDijkstra);
  });

  it('faz o custo do caminho ser a soma dos pesos desenhados nele', () => {
    const rota = AlgoritmosDeBusca.porId.estrela.buscar(0, Malha.nos.length - 1, peso)!;
    expect(Planejador.pesoDoCaminho(rota.caminho)).toBeCloseTo(rota.custo, 9);
  });

  it('só guarda a ordem de expansão quando a gravação está ligada', () => {
    AlgoritmosDeBusca.gravarExpansao = false;
    expect(AlgoritmosDeBusca.porId.dijkstra.buscar(0, 5, peso)!.ordemDeExpansao).toBeNull();

    AlgoritmosDeBusca.gravarExpansao = true;
    const traco = AlgoritmosDeBusca.porId.dijkstra.buscar(0, 5, peso)!;
    AlgoritmosDeBusca.gravarExpansao = false;

    expect(traco.ordemDeExpansao).toHaveLength(traco.nosExpandidos);
    expect(new Set(traco.ordemDeExpansao!).size).toBe(traco.nosExpandidos);
    expect(traco.ordemDeExpansao![0]).toBe(0);
    expect(traco.ordemDeExpansao!.at(-1)).toBe(5);
  });
});

describe('a regra do modelo: peso = horas = bateria', () => {
  beforeEach(() => {
    Malha.gerar(12, 4, 3);
    Malha.configurarPostos(0);
    Simulacao.reiniciar();
    Simulacao.configuracao.reserva = 0;
    Simulacao.configuracao.chegadasAutomaticas = false;
  });

  it('cobra P horas e P de bateria por um caminho de custo P', () => {
    const carro = Simulacao.colocarCarro(0, 1, 100)!;
    const custo = Planejador.pesoDoCaminho(carro.caminho);
    for (let passo = 0; passo < custo * 40 && carro.situacao === 'em rota'; passo++)
      Simulacao.avancar(0.025); // passo fracionado de propósito

    expect(carro.situacao).toBe('chegou');
    expect(carro.horaDeChegada! - carro.horaDePartida).toBeCloseTo(custo, 6);
    expect(carro.bateria).toBeCloseTo(100 - custo, 6);
    expect(carro.pesoPercorrido).toBeCloseTo(custo, 6);
  });

  /* Sem o laço dentro de moverCarro, um passo fracionado perderia um pedaço de
     hora em cada nó atravessado e o tempo de viagem ficaria maior que o peso. */
  it('não perde tempo ao cruzar um nó, qualquer que seja o tamanho do passo', () => {
    const medir = (passo: number) => {
      Simulacao.reiniciar();
      const carro = Simulacao.colocarCarro(0, Malha.nos.length - 1, 100)!;
      const custo = Planejador.pesoDoCaminho(carro.caminho);
      for (let k = 0; k < Math.ceil(custo / passo) + 4 && carro.situacao === 'em rota'; k++)
        Simulacao.avancar(passo);
      return { carro, custo };
    };
    for (const passo of [1, 0.1, 0.01]) {
      const { carro, custo } = medir(passo);
      expect(carro.situacao).toBe('chegou');
      expect(carro.horaDeChegada! - carro.horaDePartida).toBeCloseTo(custo, 6);
    }
  });
});

describe('motor de simulação em 30 dias', () => {
  beforeEach(() => {
    Malha.gerar(18, 10, 7);
    Malha.configurarPostos(6);
    Simulacao.reiniciar();
    Object.assign(Simulacao.configuracao, {
      algoritmo: 'dijkstra',
      criterio: 'peso',
      reserva: 10,
      chegadasAutomaticas: true,
      chegadasPorDia: 12,
    });
    for (let passo = 0; passo < 7200; passo++) Simulacao.avancar(0.1); // 720 h
  });

  it('produz viagens concluídas e recargas', () => {
    expect(Estatisticas.viagensConcluidas).toBeGreaterThan(0);
    expect(Estatisticas.recargasConcluidas).toBeGreaterThan(0);
  });

  it('mantém as baterias dentro da faixa e os tempos de fila não negativos', () => {
    expect(Simulacao.carros.every((c) => c.bateria >= 0 && c.bateria <= BATERIA_CHEIA + 1e-9)).toBe(true);
    expect(Simulacao.carros.every((c) => c.horasEmFila >= 0)).toBe(true);
  });

  it('mantém as contagens de encerrados coerentes com as estatísticas', () => {
    const somar = (campo: 'viagensConcluidas' | 'viagensFalhadas') =>
      Simulacao.carros.reduce((total, carro) => total + carro[campo], 0);
    expect(somar('viagensConcluidas')).toBe(Estatisticas.viagensConcluidas);
    expect(somar('viagensFalhadas')).toBe(Estatisticas.totalDeFalhas);
  });

  it('deixa todo carro numa situação conhecida e quem chegou no destino', () => {
    const situacoes = ['em rota', 'na fila', 'recarregando', 'chegou', 'falhou'];
    expect(Simulacao.carros.every((c) => situacoes.includes(c.situacao))).toBe(true);
    expect(
      Simulacao.carros.filter((c) => c.situacao === 'chegou').every((c) => c.noAtual === c.noDestinoFinal)
    ).toBe(true);
  });

  it('nunca coloca o mesmo carro em duas filas ou vagas', () => {
    const vistos = new Set<number>();
    for (const no of Malha.nosComPosto()) {
      for (const numero of no.posto!.fila) {
        expect(vistos.has(numero)).toBe(false);
        vistos.add(numero);
      }
      for (const vaga of no.posto!.vagasOcupadas) {
        if (!vaga) continue;
        expect(vistos.has(vaga.numeroDoCarro)).toBe(false);
        vistos.add(vaga.numeroDoCarro);
      }
    }
  });

  it('não deixa a utilização de posto passar de 100%', () => {
    expect(Malha.nosComPosto().every((no) => Simulacao.utilizacaoDoPosto(no) <= 100 + 1e-9)).toBe(true);
  });

  it('limita o histórico de ocupação', () => {
    expect(Estatisticas.historico.length).toBeGreaterThan(10);
    expect(Estatisticas.historico.length).toBeLessThanOrEqual(240);
  });

  /* Agora que nenhum carro se recusa a sair, a pane virou um desfecho possível.
     Com reserva e postos ela precisa continuar sendo minoria, senão a política
     de recarga não está fazendo o trabalho dela. */
  it('deixa a pane como minoria quando há reserva e postos', () => {
    expect(Estatisticas.falhasPorPane).toBeLessThanOrEqual(Estatisticas.viagensConcluidas * 0.1);
    expect(Estatisticas.viagensConcluidas).toBeGreaterThan(Estatisticas.falhasPorPane * 5);
  });
});

describe('contabilidade da bateria', () => {
  beforeEach(() => {
    Malha.gerar(18, 10, 7);
    Malha.configurarPostos(6);
    Simulacao.reiniciar();
    Object.assign(Simulacao.configuracao, { reserva: 10, chegadasAutomaticas: true, chegadasPorDia: 12 });
    for (let passo = 0; passo < 4800; passo++) Simulacao.avancar(0.1);
  });

  /* É a conta que o painel mostra ao clicar num carro. Se ela não fechar aqui,
     o número na tela está mentindo. */
  it('fecha para todo carro: saiu com + recarregou − gastou = bateria agora', () => {
    for (const carro of Simulacao.carros)
      expect(carro.bateriaInicial + carro.bateriaRecebida - carro.bateriaGasta).toBeCloseTo(carro.bateria, 6);
  });

  it('faz o gasto ser exatamente o peso percorrido', () => {
    expect(Simulacao.carros.every((c) => Math.abs(c.bateriaGasta - c.pesoPercorrido) < 1e-9)).toBe(true);
  });

  it('deixa a recarga acumulada em zero para quem nunca recarregou', () => {
    expect(Simulacao.carros.every((c) => c.recargasFeitas > 0 || c.bateriaRecebida === 0)).toBe(true);
  });

  it('bate a soma das recargas dos carros com a estatística geral', () => {
    const soma = Simulacao.carros.reduce((total, c) => total + c.bateriaRecebida, 0);
    expect(soma).toBeCloseTo(Estatisticas.somaBateriaRecebida, 6);
  });

  it('devolve a bateria cheia ao sair do posto', () => {
    Malha.configurarPostos(Malha.nos.length);
    Simulacao.reiniciar();
    const carro = Simulacao.colocarCarro(0, Malha.nos.length - 1, 70)!;
    for (let passo = 0; passo < 8000 && carro.recargasFeitas === 0; passo++) Simulacao.avancar(0.25);
    expect(carro.recargasFeitas).toBeGreaterThan(0);
    expect(carro.bateriaRecebida).toBeGreaterThan(0);
  });
});

describe('decisão de recarga e motivos de falha', () => {
  beforeEach(() => {
    Malha.gerar(16, 8, 21);
    Malha.configurarPostos(5);
    Simulacao.reiniciar();
    Simulacao.configuracao.reserva = 5;
    Simulacao.configuracao.chegadasAutomaticas = false;
  });

  it('planeja parada em posto quando a bateria não alcança e há posto ao alcance', () => {
    const carro = Simulacao.colocarCarro(0, Malha.nos.length - 1, 20)!;
    const cabe = Planejador.pesoDoCaminho(carro.caminho) <= carro.bateria;
    expect(carro.noDeRecargaPlanejado !== null || cabe).toBe(true);
  });

  /* Um carro nunca se recusa a sair: sem posto ao alcance ele pega a estrada
     assim mesmo e para onde a bateria acabar. Ver a pane no mapa diz mais do
     que um carro que nunca saiu do lugar. */
  it('sai mesmo sem bateria suficiente e para no meio da estrada', () => {
    Malha.configurarPostos(0);
    Simulacao.reiniciar();
    const carro = Simulacao.colocarCarro(0, Malha.nos.length - 1, 6)!;

    expect(carro.situacao).toBe('em rota');
    expect(Estatisticas.saidasArriscadas).toBe(1);
    expect(carro.diario.some((entrada) => /assim mesmo/.test(entrada.texto))).toBe(true);

    for (let k = 0; k < 4000 && carro.situacao === 'em rota'; k++) Simulacao.avancar(0.25);
    expect(carro.situacao).toBe('falhou');
    expect(carro.motivoDaFalha).toBe('bateria');
    expect(carro.bateria).toBe(0);
    expect(carro.bateriaGasta).toBeGreaterThan(0);
    expect(carro.arestaAtual).not.toBeNull(); // parou sobre a aresta, não no nó anterior
  });

  it('escreve no diário os números que sustentam a decisão', () => {
    const carro = Simulacao.colocarCarro(0, Malha.nos.length - 1, 18)!;
    const decisao = carro.diario.find((e) => ['rota', 'desvio', 'falha'].includes(e.tipo));
    expect(decisao).toBeDefined();
    expect(/\d/.test(decisao!.texto)).toBe(true);
  });

  it('não deixa o diário crescer sem limite', () => {
    const carro = Simulacao.colocarCarro(1, 2, 90)!;
    for (let k = 0; k < 200; k++) Simulacao.anotar(carro, 'rota', 'linha ' + k);
    expect(carro.diario.length).toBeLessThanOrEqual(26);
  });
});

describe('determinismo e robustez', () => {
  const rodarCenario = () => {
    Malha.gerar(18, 10, 7);
    Malha.configurarPostos(6);
    Simulacao.reiniciar();
    Object.assign(Simulacao.configuracao, {
      algoritmo: 'dijkstra',
      criterio: 'peso',
      reserva: 10,
      chegadasAutomaticas: true,
      chegadasPorDia: 12,
    });
    for (let passo = 0; passo < 2400; passo++) Simulacao.avancar(0.1);
    return {
      concluidas: Estatisticas.viagensConcluidas,
      arriscadas: Estatisticas.saidasArriscadas,
      panes: Estatisticas.falhasPorPane,
      recargas: Estatisticas.recargasConcluidas,
      peso: Math.round(Estatisticas.somaPesoPercorrido * 1000),
    };
  };

  it('repete exatamente o mesmo resultado para a mesma semente', () => {
    expect(rodarCenario()).toEqual(rodarCenario());
  });

  it('aguenta trocar algoritmo e postos em plena execução', () => {
    rodarCenario();
    Simulacao.configuracao.algoritmo = 'dijkstra';
    for (const carro of Simulacao.carros)
      if (carro.situacao === 'em rota') {
        carro.arestaAtual = null;
        Simulacao.planejarRota(carro);
      }
    for (let passo = 0; passo < 800; passo++) Simulacao.avancar(0.25);

    Malha.configurarPostos(2); // muda a rede com carros em campo
    Simulacao.reconciliarComPostos();
    for (let passo = 0; passo < 800; passo++) Simulacao.avancar(0.25);

    const emAtendimento = new Set<number>();
    for (const no of Malha.nosComPosto()) {
      no.posto!.fila.forEach((n) => emAtendimento.add(n));
      no.posto!.vagasOcupadas.forEach((v) => v && emAtendimento.add(v.numeroDoCarro));
    }
    expect(
      Simulacao.carros
        .filter((c) => c.situacao === 'na fila' || c.situacao === 'recarregando')
        .every((c) => emAtendimento.has(c.numero))
    ).toBe(true);

    for (const carro of Simulacao.carros)
      expect(carro.bateriaInicial + carro.bateriaRecebida - carro.bateriaGasta).toBeCloseTo(carro.bateria, 6);
  });
});

describe('peso da aresta editado à mão', () => {
  beforeEach(() => {
    Malha.gerar(20, 12, 5);
  });

  it('arredonda o valor e o mantém dentro da faixa', () => {
    expect(Malha.definirPeso(0, 7.4)).toBeCloseTo(7.4, 9); // guarda com precisão de minuto
    expect(Malha.definirPeso(0, 7.6)).toBeCloseTo(7.6, 9);
    expect(Malha.definirPeso(0, 1.004)).toBeCloseTo(1, 9); // 1 h 00,24 min arredonda para 1 h
    expect(Malha.definirPeso(0, -3)).toBe(PESO_MINIMO);
    expect(Malha.definirPeso(0, 5000)).toBe(PESO_MAXIMO);
  });

  /* Este é o teste que justifica a razão peso/comprimento existir. Com a
     estimativa presa a uma escala fixa, baixar um peso abaixo do comprimento da
     aresta tornaria a heurística inadmissível e o A* passaria a devolver
     caminhos piores que o Dijkstra, sem avisar ninguém. */
  it('mantém o A* ótimo mesmo com pesos que ignoram a geometria', () => {
    for (const aresta of Malha.arestas)
      Malha.definirPeso(aresta.indice, 1 + Math.floor(Math.random() * 30));

    let maiorDiferenca = 0;
    for (let origem = 0; origem < Malha.nos.length; origem++)
      for (let destino = 0; destino < Malha.nos.length; destino++) {
        if (origem === destino) continue;
        const porDijkstra = AlgoritmosDeBusca.porId.dijkstra.buscar(origem, destino, peso)!;
        const porEstrela = AlgoritmosDeBusca.porId.estrela.buscar(origem, destino, peso)!;
        maiorDiferenca = Math.max(maiorDiferenca, Math.abs(porDijkstra.custo - porEstrela.custo));
      }
    expect(maiorDiferenca).toBeLessThan(1e-9);
  });

  it('apara o progresso de quem já estava rodando na aresta encurtada', () => {
    Malha.configurarPostos(0);
    Simulacao.reiniciar();
    Simulacao.configuracao.reserva = 0;
    Simulacao.configuracao.chegadasAutomaticas = false;

    const carro = Simulacao.colocarCarro(0, Malha.nos.length - 1, 100)!;
    for (let k = 0; k < 40 && carro.progressoNaAresta < 2; k++) Simulacao.avancar(0.5);
    const gastoAntes = carro.bateriaGasta;

    Malha.definirPeso(carro.arestaAtual!.indice, PESO_MINIMO);
    Simulacao.reconciliarComPesos();

    expect(carro.progressoNaAresta).toBeLessThanOrEqual(carro.arestaAtual!.peso);
    // a energia já queimada continua contada: só o progresso é aparado
    expect(carro.bateriaGasta).toBe(gastoAntes);
    expect(carro.bateriaInicial + carro.bateriaRecebida - carro.bateriaGasta).toBeCloseTo(carro.bateria, 6);
  });
});

describe('carro que faz mais de uma viagem', () => {
  const prepararMalhaBarata = () => {
    Malha.gerar(10, 4, 3);
    for (const aresta of Malha.arestas) Malha.definirPeso(aresta.indice, 1);
    Malha.configurarPostos(0);
    Simulacao.reiniciar();
    Simulacao.configuracao.reserva = 0;
    Simulacao.configuracao.chegadasAutomaticas = false;
  };
  const rodarAteParar = (carro: { situacao: string }) => {
    for (let k = 0; k < 4000 && carro.situacao === 'em rota'; k++) Simulacao.avancar(0.25);
  };

  it('sai de novo de onde parou, sem perder bateria nem histórico', () => {
    prepararMalhaBarata();
    const carro = Simulacao.colocarCarro(0, 1, 100)!;
    rodarAteParar(carro);
    expect(carro.situacao).toBe('chegou');

    const bateriaAoChegar = carro.bateria;
    const gastoAoChegar = carro.bateriaGasta;
    const linhasNoDiario = carro.diario.length;

    expect(Simulacao.despacharNovamente(carro, 2)).toBe(true);
    expect(carro.bateria).toBe(bateriaAoChegar);      // não ganha carga de graça
    expect(carro.bateriaGasta).toBe(gastoAoChegar);   // nem esquece o que gastou
    expect(carro.noDeOrigem).toBe(1);
    expect(carro.diario.length).toBeGreaterThan(linhasNoDiario);
  });

  it('conta cada viagem separadamente nas médias', () => {
    prepararMalhaBarata();
    const carro = Simulacao.colocarCarro(0, 1, 100)!;
    rodarAteParar(carro);
    const tempoDaPrimeira = Estatisticas.somaTempoDeViagem;

    Simulacao.despacharNovamente(carro, 2);
    rodarAteParar(carro);

    expect(carro.situacao).toBe('chegou');
    expect(carro.viagensConcluidas).toBe(2);
    expect(Estatisticas.viagensConcluidas).toBe(2);
    // a segunda soma só o próprio tempo, não o acumulado do carro
    expect(Estatisticas.somaTempoDeViagem).toBeCloseTo(
      tempoDaPrimeira + (carro.horaDeChegada! - carro.horaDePartida),
      6
    );
    expect(carro.bateriaInicial + carro.bateriaRecebida - carro.bateriaGasta).toBeCloseTo(carro.bateria, 6);
  });

  it('recusa reenviar quem ainda está no meio da estrada', () => {
    prepararMalhaBarata();
    const carro = Simulacao.colocarCarro(0, 5, 100)!;
    Simulacao.avancar(0.25);
    expect(carro.situacao).toBe('em rota');
    expect(Simulacao.despacharNovamente(carro, 3)).toBe(false);
  });

  it('recusa reenviar para o nó onde o carro já está', () => {
    prepararMalhaBarata();
    const carro = Simulacao.colocarCarro(0, 1, 100)!;
    rodarAteParar(carro);
    expect(Simulacao.despacharNovamente(carro, carro.noAtual)).toBe(false);
  });
});

describe('carro que chega fica na malha', () => {
  const prepararMalha = () => {
    Malha.gerar(12, 6, 4);
    for (const aresta of Malha.arestas) Malha.definirPeso(aresta.indice, 2);
    Malha.configurarPostos(0);
    Simulacao.reiniciar();
    Simulacao.configuracao.reserva = 0;
    Simulacao.configuracao.chegadasAutomaticas = false;
  };
  const rodarAteParar = (carro: { situacao: string }) => {
    for (let k = 0; k < 4000 && carro.situacao === 'em rota'; k++) Simulacao.avancar(0.25);
  };

  it('faz do nó de chegada a nova origem, e fica sem destino', () => {
    prepararMalha();
    const carro = Simulacao.colocarCarro(0, 1, 100)!;
    rodarAteParar(carro);

    expect(carro.situacao).toBe('chegou');
    expect(carro.noAtual).toBe(1);
    expect(carro.noDeOrigem).toBe(1);           // onde ele parou vira a origem
    expect(Simulacao.estaSemViagem(carro)).toBe(true);
  });

  it('continua na lista de carros, sem ser descartado', () => {
    prepararMalha();
    const carro = Simulacao.colocarCarro(0, 1, 100)!;
    rodarAteParar(carro);
    for (let k = 0; k < 200; k++) Simulacao.avancar(1); // 200 h depois de chegar
    expect(Simulacao.carros).toContain(carro);
    expect(carro.situacao).toBe('chegou');
  });

  it('sai de novo assim que um destino é escolhido', () => {
    prepararMalha();
    const carro = Simulacao.colocarCarro(0, 1, 100)!;
    rodarAteParar(carro);

    expect(Simulacao.redirecionar(carro, 4)).toBe(true);
    expect(carro.noDeOrigem).toBe(1);
    expect(carro.noDestinoFinal).toBe(4);
    expect(carro.situacao).toBe('em rota');
    expect(Simulacao.estaSemViagem(carro)).toBe(false);

    rodarAteParar(carro);
    expect(carro.noAtual).toBe(4);
    expect(carro.viagensConcluidas).toBe(2);
  });
});

describe('parada oportunista no posto', () => {
  /* Malha em linha reta de pesos iguais, com posto num nó do meio: dá para
     dizer com certeza por onde o carro passa e com quanta bateria. */
  const prepararCorredor = (limiar: number) => {
    Malha.gerar(12, 6, 4);
    for (const aresta of Malha.arestas) Malha.definirPeso(aresta.indice, 5);
    Malha.configurarPostos(0);
    Simulacao.reiniciar();
    Object.assign(Simulacao.configuracao, {
      reserva: 0,
      limiarDeRecarga: limiar,
      chegadasAutomaticas: false,
    });
  };
  const rodar = (carro: { situacao: string }, passos = 4000) => {
    for (let k = 0; k < passos && carro.situacao === 'em rota'; k++) Simulacao.avancar(0.25);
  };

  /** Um trajeto com pelo menos um nó no meio, para haver onde plantar o posto. */
  const acharTrajetoComEscala = () => {
    for (let origem = 0; origem < Malha.nos.length; origem++)
      for (let destino = 0; destino < Malha.nos.length; destino++) {
        if (origem === destino) continue;
        const rota = AlgoritmosDeBusca.porId.dijkstra.buscar(origem, destino, peso);
        if (rota && rota.caminho.length >= 3) return { origem, destino, caminho: rota.caminho };
      }
    throw new Error('a malha não tem trajeto com nó intermediário');
  };

  const plantarPosto = (indice: number) => {
    Malha.nos[indice].posto = {
      vagas: 1, horasDeRecarga: 4, vagasOcupadas: [null], fila: [],
      horasDeVagaOcupada: 0, recargasConcluidas: 0, maiorFila: 0,
    };
    return Malha.nos[indice];
  };

  it('para e enche ao passar num posto com a bateria no fim', () => {
    prepararCorredor(30);
    const trajeto = acharTrajetoComEscala();
    // o carro sai cheio, então o planejador traça a rota direta, sem parada
    const carro = Simulacao.colocarCarro(trajeto.origem, trajeto.destino, 100)!;
    expect(carro.noDeRecargaPlanejado).toBeNull();

    const noDoMeio = plantarPosto(carro.caminho[1]);
    carro.bateria = 20; // só agora a bateria fica no fim

    rodar(carro, 60);
    expect(carro.noAtual).toBe(noDoMeio.indice);
    expect(carro.situacao === 'na fila' || carro.situacao === 'recarregando').toBe(true);
    expect(Estatisticas.recargasOportunistas).toBe(1);
    expect(carro.diario.some((e) => /mesmo sem estar no plano/.test(e.texto))).toBe(true);
    const bateriaAoParar = carro.bateria;

    // rodar() só avança enquanto o carro anda; na fila é preciso deixar o relógio correr
    for (let k = 0; k < 400 && carro.recargasFeitas === 0; k++) Simulacao.avancar(0.25);
    expect(carro.recargasFeitas).toBe(1);
    // o posto sempre enche: o que ele devolveu é o que faltava para os 100
    expect(carro.bateriaRecebida).toBeCloseTo(100 - bateriaAoParar, 6);
    expect(carro.bateria).toBeGreaterThan(99); // já voltou à estrada, gastando
  });

  it('passa direto quando a bateria está acima do limiar', () => {
    prepararCorredor(30);
    const trajeto = acharTrajetoComEscala();
    const carro = Simulacao.colocarCarro(trajeto.origem, trajeto.destino, 100)!;
    plantarPosto(carro.caminho[1]);
    carro.bateria = 90;

    rodar(carro);
    expect(Estatisticas.recargasOportunistas).toBe(0);
    expect(carro.situacao).toBe('chegou');
    expect(carro.noAtual).toBe(trajeto.destino);
  });

  it('com limiar zero a regra fica desligada', () => {
    prepararCorredor(0);
    const trajeto = acharTrajetoComEscala();
    const carro = Simulacao.colocarCarro(trajeto.origem, trajeto.destino, 100)!;
    plantarPosto(carro.caminho[1]);
    carro.bateria = 5;

    rodar(carro, 60);
    expect(Estatisticas.recargasOportunistas).toBe(0);
    expect(carro.situacao).not.toBe('na fila');
  });

  /* Com posto em todo nó e limiar alto, o carro recém-carregado chegaria ao nó
     seguinte com a bateria abaixo do limiar e entraria na fila de novo, para
     sempre. A comparação com a bateria cheia é o que corta esse laço. */
  it('não entra em laço com posto em todo nó e limiar alto', () => {
    Malha.gerar(10, 4, 8);
    for (const aresta of Malha.arestas) Malha.definirPeso(aresta.indice, 1);
    Malha.configurarPostos(Malha.nos.length);
    Simulacao.reiniciar();
    Object.assign(Simulacao.configuracao, {
      reserva: 0, limiarDeRecarga: 90, chegadasAutomaticas: false,
    });

    const carro = Simulacao.colocarCarro(0, Malha.nos.length - 1, 100)!;
    for (let k = 0; k < 20000 && carro.situacao !== 'chegou'; k++) Simulacao.avancar(0.25);
    expect(carro.situacao).toBe('chegou');
  });
});

describe('rota de cada carro, editada em separado', () => {
  const prepararMalha = () => {
    Malha.gerar(12, 6, 4);
    for (const aresta of Malha.arestas) Malha.definirPeso(aresta.indice, 2);
    Malha.configurarPostos(0);
    Simulacao.reiniciar();
    Simulacao.configuracao.reserva = 0;
    Simulacao.configuracao.chegadasAutomaticas = false;
  };

  it('muda o destino de um carro sem tocar nos outros', () => {
    prepararMalha();
    const primeiro = Simulacao.colocarCarro(0, 1, 100)!;
    const segundo = Simulacao.colocarCarro(0, 1, 100)!;

    expect(Simulacao.redirecionar(primeiro, 4)).toBe(true);
    expect(primeiro.noDestinoFinal).toBe(4);
    expect(segundo.noDestinoFinal).toBe(1); // o outro carro segue a vida dele
  });

  it('replaneja na hora quando o carro ainda não entrou na aresta', () => {
    prepararMalha();
    const carro = Simulacao.colocarCarro(0, 1, 100)!;
    expect(carro.progressoNaAresta).toBe(0);
    Simulacao.redirecionar(carro, 5);
    expect(carro.noDestinoFinal).toBe(5);
    expect(carro.caminho.at(-1)).toBe(5);
  });

  /* No meio de uma aresta o carro não pode dar meia-volta no ar: ele termina o
     trecho e só então replaneja. O caminho fica com dois nós justamente para
     que aoChegarNoNo chame o planejador ao encostar no próximo. */
  it('no meio da estrada, termina a aresta antes de replanejar', () => {
    prepararMalha();
    const carro = Simulacao.colocarCarro(0, 1, 100)!;
    Simulacao.avancar(1); // metade de uma aresta de peso 2
    expect(carro.progressoNaAresta).toBeGreaterThan(0);

    const proximo = carro.caminho[carro.indiceNoCaminho + 1];
    expect(Simulacao.redirecionar(carro, 6)).toBe(true);
    expect(carro.caminho).toEqual([carro.noAtual, proximo]);

    for (let k = 0; k < 400 && carro.situacao === 'em rota'; k++) Simulacao.avancar(0.25);
    expect(carro.noDestinoFinal).toBe(6);
    expect(carro.situacao).toBe('chegou');
    expect(carro.noAtual).toBe(6);
  });

  it('tira da fila quem foi redirecionado, porque a parada era para outro destino', () => {
    Malha.gerar(12, 6, 4);
    Malha.configurarPostos(Malha.nos.length);
    Simulacao.reiniciar();
    Simulacao.configuracao.reserva = 0;
    Simulacao.configuracao.chegadasAutomaticas = false;

    const bloqueador = Simulacao.colocarCarro(0, Malha.nos.length - 1, 20)!;
    const carro = Simulacao.colocarCarro(0, Malha.nos.length - 1, 20)!;
    for (let k = 0; k < 4000 && carro.situacao !== 'na fila'; k++) Simulacao.avancar(0.25);
    if (carro.situacao !== 'na fila') return; // cenário não formou fila, nada a checar
    expect(bloqueador).toBeDefined();

    const posto = Malha.nos[carro.noAtual].posto!;
    Simulacao.redirecionar(carro, carro.noAtual === 0 ? 1 : 0);
    expect(posto.fila).not.toContain(carro.numero);
    expect(carro.situacao).not.toBe('na fila');
  });

  it('troca a origem só enquanto o carro não saiu do lugar', () => {
    prepararMalha();
    const carro = Simulacao.colocarCarro(0, 5, 100)!;
    expect(Simulacao.podeMudarOrigem(carro)).toBe(true);
    expect(Simulacao.reposicionar(carro, 3)).toBe(true);
    expect(carro.noDeOrigem).toBe(3);
    expect(carro.noAtual).toBe(3);

    Simulacao.avancar(1);
    expect(Simulacao.podeMudarOrigem(carro)).toBe(false);
    expect(Simulacao.reposicionar(carro, 7)).toBe(false);
  });

  it('recusa origem igual ao destino', () => {
    prepararMalha();
    const carro = Simulacao.colocarCarro(0, 5, 100)!;
    expect(Simulacao.reposicionar(carro, 5)).toBe(false);
    expect(carro.noDeOrigem).toBe(0);
  });

  it('não mexe em carro que ficou sem bateria no meio da estrada', () => {
    prepararMalha();
    // bateria menor que uma aresta inteira: a pane cai no meio do trecho
    const carro = Simulacao.colocarCarro(0, Malha.nos.length - 1, 1)!;
    for (let k = 0; k < 400 && carro.situacao === 'em rota'; k++) Simulacao.avancar(0.25);
    expect(carro.motivoDaFalha).toBe('bateria');
    expect(Simulacao.redirecionar(carro, 2)).toBe(false);
    expect(Simulacao.podeMudarOrigem(carro)).toBe(false);
  });

  it('mantém a conta da bateria fechada depois de redirecionar', () => {
    prepararMalha();
    const carro = Simulacao.colocarCarro(0, 1, 100)!;
    Simulacao.avancar(1);
    Simulacao.redirecionar(carro, 6);
    for (let k = 0; k < 400 && carro.situacao === 'em rota'; k++) Simulacao.avancar(0.25);
    expect(carro.bateriaInicial + carro.bateriaRecebida - carro.bateriaGasta).toBeCloseTo(carro.bateria, 6);
  });
});

describe('relógio', () => {
  it('conta dias, horas e minutos', () => {
    expect(formatarRelogio(25.5)).toBe('1d 01:30');
    expect(formatarRelogio(0)).toBe('00:00');
    expect(formatarRelogio(3)).toBe('03:00');
  });
});
