import { aleatorio, inteiroEntre } from './aleatorio';
import {
  BATERIA_CHEIA,
  INTERVALO_DE_AMOSTRA_H,
  MAXIMO_DE_AMOSTRAS,
  MAXIMO_DE_ENTRADAS_NO_DIARIO,
} from './constantes';
import { Estatisticas } from './estatisticas';
import { Malha } from './malha';
import { Planejador } from './planejador';
import type { Carro, Configuracao, No, Plano, RetratoDaViagem, TipoDeEntrada } from './tipos';
import { criarEmissorDeEventos, formatar, limitar } from './utilidades';

export interface EventosDaSimulacao extends Record<string, unknown> {
  reiniciada: undefined;
  carroColocado: Carro;
  carroChegou: Carro;
  carroFalhou: Carro;
  recargaConcluida: { carro: Carro; no: No };
  rotaPlanejada: { carro: Carro; plano: Plano };
  novaViagem: Carro;
}

function retratoDaViagem(carro: Carro, hora: number): RetratoDaViagem {
  return {
    hora,
    horasEmFila: carro.horasEmFila,
    horasRecarregando: carro.horasRecarregando,
    bateriaGasta: carro.bateriaGasta,
    pesoPercorrido: carro.pesoPercorrido,
  };
}

/* O motor é um objeto mutável de propósito. Ele é dirigido por um laço de
   animação a 60 quadros por segundo com centenas de carros: passar isso por
   estado de React re-renderizaria a árvore inteira a cada quadro. A interface
   assina um retrato deste objeto algumas vezes por segundo, e só. */
export const Simulacao = {
  carros: [] as Carro[],
  carrosPorNumero: new Map<number, Carro>(),
  hora: 0,
  emExecucao: false,
  proximoNumero: 1,
  acumuladorDeChegadas: 0,
  acumuladorDeAmostra: 0,
  eventos: criarEmissorDeEventos<EventosDaSimulacao>(),

  /** Sorteio de viagem do cenário (origem, destino, bateria). Null = uniforme. */
  sortearViagem: null as ((sortear: () => number) => { origem: number; destino: number; bateria: number }) | null,

  configuracao: {
    algoritmo: 'estrela',
    criterio: 'peso',
    bateriaCheia: BATERIA_CHEIA,
    reserva: 10,          // pontos de bateria guardados como margem
    limiarDeRecarga: 30,  // passou num posto abaixo disso, para e enche
    pesoDaFila: 0.35,   // quanto a espera prevista pesa na escolha do posto
    chegadasAutomaticas: false,
    chegadasPorDia: 12,
    horasPorSegundo: 4,
  } as Configuracao,

  reiniciar(): void {
    this.carros = [];
    this.carrosPorNumero.clear();
    this.hora = 0;
    this.proximoNumero = 1;
    this.acumuladorDeChegadas = 0;
    this.acumuladorDeAmostra = 0;
    for (const no of Malha.nosComPosto()) {
      Object.assign(no.posto!, {
        vagasOcupadas: new Array(no.posto!.vagas).fill(null),
        fila: [],
        horasDeVagaOcupada: 0,
        recargasConcluidas: 0,
        maiorFila: 0,
      });
    }
    Estatisticas.zerar();
    this.eventos.emitir('reiniciada', undefined);
  },

  /** Todo carro é igual: bateria de 100 pontos, um ponto gasto por unidade de
      peso. A única coisa que muda de um para o outro é de onde sai, para onde
      vai e com quanta bateria começa. */
  colocarCarro(noDeOrigem: number | null, noDeDestino: number | null, bateriaInicial: number): Carro | null {
    if (noDeOrigem === null || noDeDestino === null) return null;
    if (noDeOrigem === noDeDestino) return null;

    const bateria = limitar(bateriaInicial, 0, this.configuracao.bateriaCheia);
    const carro: Carro = {
      numero: this.proximoNumero++,
      nome: 'C' + String(this.proximoNumero - 1).padStart(2, '0'),
      bateria,
      bateriaInicial: bateria,
      bateriaRecebida: 0,
      bateriaGasta: 0,
      noDeOrigem,
      noAtual: noDeOrigem,
      noDestinoFinal: noDeDestino,
      noDeRecargaPlanejado: null,
      ultimoPostoUsado: -1,
      caminho: [],
      indiceNoCaminho: 0,
      arestaAtual: null,
      progressoNaAresta: 0,
      situacao: 'em rota',
      motivoDaFalha: null,
      horaDePartida: this.hora,
      horaDeChegada: null,
      horasEmFila: 0,
      horasRecarregando: 0,
      horaDeEntradaNaFila: 0,
      pesoPercorrido: 0,
      recargasFeitas: 0,
      matiz: (this.proximoNumero * 67) % 360,
      diario: [],
      viagensConcluidas: 0,
      viagensFalhadas: 0,
      inicioDaViagem: {
        hora: this.hora,
        horasEmFila: 0,
        horasRecarregando: 0,
        bateriaGasta: 0,
        pesoPercorrido: 0,
      },
    };
    this.carros.push(carro);
    this.carrosPorNumero.set(carro.numero, carro);
    Estatisticas.viagensIniciadas++;
    this.anotar(
      carro,
      'partida',
      `Sai de <b>${Malha.nos[noDeOrigem].nome}</b> para <b>${Malha.nos[noDeDestino].nome}</b> ` +
        `com <b>${formatar(carro.bateria, 0)}</b> de bateria.`
    );
    this.planejarRota(carro);
    this.eventos.emitir('carroColocado', carro);
    return carro;
  },

  /** Manda um carro que já parou para um destino novo, a partir de onde ele
      está, sem tirar ele da malha. A bateria e o histórico continuam de onde
      pararam: só os contadores da viagem recomeçam. */
  despacharNovamente(carro: Carro, noDeDestino: number): boolean {
    const paradoNumNo = carro.situacao === 'chegou' || carro.motivoDaFalha === 'rota';
    if (!paradoNumNo || carro.noAtual === noDeDestino) return false;

    carro.noDeOrigem = carro.noAtual;
    carro.noDestinoFinal = noDeDestino;
    carro.noDeRecargaPlanejado = null;
    carro.ultimoPostoUsado = -1;
    carro.caminho = [];
    carro.indiceNoCaminho = 0;
    carro.arestaAtual = null;
    carro.progressoNaAresta = 0;
    carro.situacao = 'em rota';
    carro.motivoDaFalha = null;
    carro.horaDePartida = this.hora;
    carro.horaDeChegada = null;
    carro.inicioDaViagem = retratoDaViagem(carro, this.hora);
    Estatisticas.viagensIniciadas++;

    this.anotar(
      carro,
      'partida',
      `Nova viagem: sai de <b>${Malha.nos[carro.noDeOrigem].nome}</b> para ` +
        `<b>${Malha.nos[noDeDestino].nome}</b> com <b>${formatar(carro.bateria, 0)}</b> de bateria.`
    );
    this.planejarRota(carro);
    this.eventos.emitir('novaViagem', carro);
    return true;
  },

  /** A origem só pode mudar enquanto o carro ainda não saiu do lugar nesta
      viagem. Depois que ele pegou a estrada, mexer na origem seria teletransporte. */
  podeMudarOrigem(carro: Carro): boolean {
    if (carro.situacao === 'na fila' || carro.situacao === 'recarregando') return false;
    if (carro.motivoDaFalha === 'bateria') return false; // parado no meio da estrada
    if (carro.situacao === 'chegou' || carro.situacao === 'falhou') return true;
    return carro.pesoPercorrido - carro.inicioDaViagem.pesoPercorrido < 1e-9;
  },

  /** Está parado num nó, sem viagem em curso: origem e destino no mesmo lugar. */
  estaSemViagem(carro: Carro): boolean {
    return carro.situacao === 'chegou' && carro.noAtual === carro.noDestinoFinal;
  },

  /** Põe o carro noutro nó de partida e recomeça a viagem de lá. */
  reposicionar(carro: Carro, noDeOrigem: number): boolean {
    if (!this.podeMudarOrigem(carro)) return false;
    if (noDeOrigem === carro.noDestinoFinal) return false;
    if (noDeOrigem === carro.noAtual && carro.situacao === 'em rota') return false;

    carro.noDeOrigem = noDeOrigem;
    carro.noAtual = noDeOrigem;
    carro.caminho = [];
    carro.indiceNoCaminho = 0;
    carro.arestaAtual = null;
    carro.progressoNaAresta = 0;
    carro.noDeRecargaPlanejado = null;
    carro.ultimoPostoUsado = -1;
    carro.situacao = 'em rota';
    carro.motivoDaFalha = null;
    carro.horaDePartida = this.hora;
    carro.horaDeChegada = null;
    carro.inicioDaViagem = retratoDaViagem(carro, this.hora);
    Estatisticas.viagensIniciadas++;

    this.anotar(
      carro,
      'partida',
      `Passa a sair de <b>${Malha.nos[noDeOrigem].nome}</b>, rumo a ` +
        `<b>${Malha.nos[carro.noDestinoFinal].nome}</b>, com <b>${formatar(carro.bateria, 0)}</b> de bateria.`
    );
    this.planejarRota(carro);
    return true;
  },

  /* Troca o destino de um carro que já está na malha. Cada situação pede um
     tratamento: quem já chegou começa viagem nova, quem está no meio de uma
     aresta termina ela antes de replanejar, e quem está na fila sai dela,
     porque a parada foi escolhida para um destino que não vale mais. */
  redirecionar(carro: Carro, noDeDestino: number): boolean {
    if (carro.motivoDaFalha === 'bateria') return false; // sem bateria, não anda mais
    if (carro.situacao === 'chegou' || carro.situacao === 'falhou')
      return this.despacharNovamente(carro, noDeDestino);
    if (noDeDestino === carro.noDestinoFinal) return false;
    if (noDeDestino === carro.noAtual && carro.progressoNaAresta === 0) return false;

    const nomeDoDestino = Malha.nos[noDeDestino].nome;
    carro.noDestinoFinal = noDeDestino;
    carro.noDeRecargaPlanejado = null;

    if (carro.situacao === 'na fila') {
      const posto = Malha.nos[carro.noAtual].posto;
      const lugar = posto ? posto.fila.indexOf(carro.numero) : -1;
      if (posto && lugar >= 0) posto.fila.splice(lugar, 1);
      carro.horasEmFila += this.hora - carro.horaDeEntradaNaFila;
      carro.situacao = 'em rota';
      carro.arestaAtual = null;
      carro.progressoNaAresta = 0;
      this.anotar(carro, 'rota', `Destino passa a ser <b>${nomeDoDestino}</b>: sai da fila e replaneja.`);
      this.planejarRota(carro);
      return true;
    }

    if (carro.situacao === 'recarregando') {
      this.anotar(
        carro,
        'rota',
        `Destino passa a ser <b>${nomeDoDestino}</b>. Replaneja quando a recarga terminar.`
      );
      return true;
    }

    if (carro.progressoNaAresta === 0) {
      carro.arestaAtual = null;
      this.anotar(carro, 'rota', `Destino passa a ser <b>${nomeDoDestino}</b>, replaneja daqui mesmo.`);
      this.planejarRota(carro);
      return true;
    }

    // no meio de uma aresta: termina o trecho atual e replaneja no nó seguinte
    const proximo = carro.caminho[carro.indiceNoCaminho + 1];
    carro.caminho = [carro.caminho[carro.indiceNoCaminho], proximo];
    carro.indiceNoCaminho = 0;
    this.anotar(
      carro,
      'rota',
      `Destino passa a ser <b>${nomeDoDestino}</b>. Já está na estrada: replaneja ao chegar em ` +
        `<b>${Malha.nos[proximo].nome}</b>.`
    );
    return true;
  },

  /** Uma linha do diário do carro. Guarda pouco de propósito: é para leitura
      humana no painel, não é fonte de estatística. */
  anotar(carro: Carro, tipo: TipoDeEntrada, texto: string): void {
    carro.diario.push({ hora: this.hora, tipo, texto });
    if (carro.diario.length > MAXIMO_DE_ENTRADAS_NO_DIARIO) carro.diario.shift();
  },

  planejarRota(carro: Carro): void {
    if (carro.noAtual === carro.noDestinoFinal) return this.registrarChegada(carro);
    const plano = Planejador.planejarProximoTrecho(carro, this.configuracao);

    if (!plano.viavel) {
      carro.situacao = 'falhou';
      carro.motivoDaFalha = 'rota';
      carro.horaDeChegada = this.hora;
      carro.viagensFalhadas++;
      Estatisticas.falhasPorRota++;
      this.anotar(
        carro,
        'falha',
        `Não existe caminho no grafo até <b>${Malha.nos[carro.noDestinoFinal].nome}</b>.`
      );
      this.eventos.emitir('carroFalhou', carro);
      return;
    }

    carro.caminho = plano.caminho!;
    carro.indiceNoCaminho = 0;
    carro.noDeRecargaPlanejado = plano.noDeRecarga ?? null;
    carro.arestaAtual = Malha.arestaEntre(plano.caminho![0], plano.caminho![1]) ?? null;
    carro.progressoNaAresta = 0;
    carro.situacao = 'em rota';

    const detalhe = plano.explicacao;
    if (detalhe.tipo === 'direto') {
      this.anotar(
        carro,
        'rota',
        `Caminho até <b>${Malha.nos[carro.noDestinoFinal].nome}</b> por ${detalhe.trechos} ` +
          `${detalhe.trechos === 1 ? 'aresta' : 'arestas'} custa <b>${formatar(detalhe.precisa!, 0)}</b>. ` +
          `Tem <b>${formatar(detalhe.bateria!, 0)}</b> de bateria, menos <b>${formatar(detalhe.reserva!, 0)}</b> ` +
          `de reserva sobram <b>${formatar(detalhe.disponivel!, 0)}</b>. Cabe, então segue direto.`
      );
    } else if (detalhe.tipo === 'arriscado') {
      Estatisticas.saidasArriscadas++;
      this.anotar(
        carro,
        'desvio',
        `O caminho até <b>${Malha.nos[carro.noDestinoFinal].nome}</b> custa ` +
          `<b>${formatar(detalhe.precisa!, 0)}</b> e só há <b>${formatar(detalhe.disponivel!, 0)}</b> ` +
          `de bateria utilizável, e nenhum posto ao alcance leva ao destino. <b>Sai assim mesmo</b> e deve parar ` +
          `na estrada antes de chegar.`
      );
    } else if (detalhe.tipo === 'desvio') {
      this.anotar(
        carro,
        'desvio',
        `O caminho direto custa <b>${formatar(detalhe.precisa!, 0)}</b> e só há ` +
          `<b>${formatar(detalhe.disponivel!, 0)}</b> utilizáveis. Entre ${detalhe.postosAoAlcance} ` +
          `${detalhe.postosAoAlcance === 1 ? 'posto ao alcance' : 'postos ao alcance'} escolhe ` +
          `<b>${Malha.nos[detalhe.posto!].nome}</b>, a <b>${formatar(detalhe.pesoAteOPosto!, 0)}</b> de distância, ` +
          `com espera prevista de <b>${formatar(detalhe.esperaEstimada!, 0)} h</b>.`
      );
    }
    this.eventos.emitir('rotaPlanejada', { carro, plano });
  },

  /* As médias são por viagem, não por carro: como o mesmo carro pode fazer
     várias, cada chegada soma só o que aconteceu desde a largada desta. */
  /* Chegar não tira o carro da malha: ele fica parado no nó, e aquele nó vira a
     origem da próxima viagem. Enquanto ninguém escolher um destino novo, origem
     e destino apontam para o mesmo lugar, que é como "sem viagem" se representa. */
  registrarChegada(carro: Carro): void {
    carro.situacao = 'chegou';
    carro.horaDeChegada = this.hora;
    carro.noDeOrigem = carro.noAtual;
    carro.viagensConcluidas++;
    const inicio = carro.inicioDaViagem;
    const nestaViagem = {
      tempo: this.hora - carro.horaDePartida,
      fila: carro.horasEmFila - inicio.horasEmFila,
      recarga: carro.horasRecarregando - inicio.horasRecarregando,
      bateria: carro.bateriaGasta - inicio.bateriaGasta,
      peso: carro.pesoPercorrido - inicio.pesoPercorrido,
    };
    this.anotar(
      carro,
      'chegada',
      `Chega em <b>${Malha.nos[carro.noDestinoFinal].nome}</b> depois de ` +
        `<b>${formatar(nestaViagem.tempo, 0)} h</b>, tendo percorrido ` +
        `peso <b>${formatar(nestaViagem.peso, 0)}</b> nesta viagem.`
    );
    Estatisticas.viagensConcluidas++;
    Estatisticas.somaTempoDeViagem += nestaViagem.tempo;
    Estatisticas.somaTempoEmFila += nestaViagem.fila;
    Estatisticas.somaBateriaGasta += nestaViagem.bateria;
    Estatisticas.somaPesoPercorrido += nestaViagem.peso;
    Estatisticas.somaTempoRecarregando += nestaViagem.recarga;
    this.eventos.emitir('carroChegou', carro);
  },

  registrarPaneNaEstrada(carro: Carro): void {
    carro.situacao = 'falhou';
    carro.motivoDaFalha = 'bateria';
    carro.horaDeChegada = this.hora;
    const proximo = carro.caminho[carro.indiceNoCaminho + 1] ?? carro.noAtual;
    this.anotar(
      carro,
      'falha',
      `Bateria zerou entre <b>${Malha.nos[carro.caminho[carro.indiceNoCaminho]].nome}</b> e ` +
        `<b>${Malha.nos[proximo].nome}</b>.`
    );
    carro.viagensFalhadas++;
    Estatisticas.falhasPorPane++;
    this.eventos.emitir('carroFalhou', carro);
  },

  /* Uma hora de relógio move o carro uma unidade de peso e gasta um ponto de
     bateria. É a regra inteira do movimento.

     O laço existe para que a hora nunca se perca ao cruzar um nó: sobrou tempo
     depois de terminar uma aresta, o resto já entra na aresta seguinte. Sem
     isso, um passo fracionado engoliria um pedaço de hora em cada nó e o peso
     deixaria de ser exatamente o tempo de viagem. */
  moverCarro(carro: Carro, horas: number): void {
    let restante = horas;
    for (let guarda = 0; guarda < 1000; guarda++) {
      if (carro.situacao !== 'em rota' || restante <= 1e-12) return;
      const aresta = carro.arestaAtual;
      if (!aresta) {
        this.aoChegarNoNo(carro);
        if (carro.situacao !== 'em rota' || !carro.arestaAtual) return;
        continue;
      }

      const avanco = Math.min(restante, aresta.peso - carro.progressoNaAresta);
      carro.progressoNaAresta += avanco;
      carro.pesoPercorrido += avanco;
      carro.bateriaGasta += avanco;
      carro.bateria -= avanco;
      restante -= avanco;

      if (carro.bateria <= 1e-9) {
        carro.bateria = 0;
        return this.registrarPaneNaEstrada(carro);
      }
      if (carro.progressoNaAresta >= aresta.peso - 1e-9) {
        carro.indiceNoCaminho++;
        carro.noAtual = carro.caminho[carro.indiceNoCaminho];
        carro.progressoNaAresta = 0;
        carro.arestaAtual = null;
        this.aoChegarNoNo(carro);
      }
    }
  },

  aoChegarNoNo(carro: Carro): void {
    if (carro.noAtual === carro.noDestinoFinal) return this.registrarChegada(carro);

    const posto = Malha.nos[carro.noAtual].posto;

    if (carro.noDeRecargaPlanejado === carro.noAtual) {
      if (!posto) {
        // o posto foi removido durante a viagem
        carro.noDeRecargaPlanejado = null;
        return this.planejarRota(carro);
      }
      this.entrarNaFila(carro, Malha.nos[carro.noAtual], false);
      return;
    }

    /* Parada oportunista: passou num posto com a bateria no fim, para e enche,
       mesmo que a parada não estivesse no plano. A comparação com a bateria
       cheia evita que um carro recém-carregado volte para a fila do posto
       seguinte, e é o que impede o laço infinito com limiares altos. */
    if (
      posto &&
      this.configuracao.limiarDeRecarga > 0 &&
      carro.bateria < this.configuracao.bateriaCheia &&
      carro.bateria <= this.configuracao.limiarDeRecarga
    ) {
      carro.noDeRecargaPlanejado = carro.noAtual;
      this.entrarNaFila(carro, Malha.nos[carro.noAtual], true);
      return;
    }

    if (carro.indiceNoCaminho < carro.caminho.length - 1) {
      carro.arestaAtual =
        Malha.arestaEntre(carro.caminho[carro.indiceNoCaminho], carro.caminho[carro.indiceNoCaminho + 1]) ?? null;
      return;
    }
    this.planejarRota(carro); // fim do trecho planejado, calcula o próximo
  },

  /** Põe o carro na fila de um posto e anota no diário por que ele parou. */
  entrarNaFila(carro: Carro, no: No, oportunista: boolean): void {
    const posto = no.posto!;
    carro.situacao = 'na fila';
    carro.horaDeEntradaNaFila = this.hora;
    posto.fila.push(carro.numero);
    posto.maiorFila = Math.max(posto.maiorFila, posto.fila.length);
    if (oportunista) Estatisticas.recargasOportunistas++;

    const ocupadas = posto.vagasOcupadas.filter(Boolean).length;
    const lugar =
      posto.fila.length === 1 && ocupadas < posto.vagas
        ? 'A vaga estava livre.'
        : `É o <b>${posto.fila.length}º</b> da fila.`;

    this.anotar(
      carro,
      'fila',
      oportunista
        ? `Passa pelo posto <b>${no.nome}</b> com só <b>${formatar(carro.bateria, 0)}</b> de bateria: ` +
            `para para encher, mesmo sem estar no plano. ${lugar}`
        : `Chega no posto <b>${no.nome}</b> com <b>${formatar(carro.bateria, 0)}</b> de bateria. ${lugar}`
    );
  },

  atenderPosto(no: No, horas: number): void {
    const posto = no.posto!;

    for (let vaga = 0; vaga < posto.vagasOcupadas.length; vaga++) {
      const emAtendimento = posto.vagasOcupadas[vaga];
      if (!emAtendimento) continue;
      emAtendimento.horasRestantes -= horas;
      const carro = this.carrosPorNumero.get(emAtendimento.numeroDoCarro);
      if (carro) carro.horasRecarregando += horas;

      if (emAtendimento.horasRestantes <= 0) {
        posto.vagasOcupadas[vaga] = null;
        posto.recargasConcluidas++;
        Estatisticas.recargasConcluidas++;
        if (carro) {
          const cheia = this.configuracao.bateriaCheia;
          const recebido = Math.max(0, cheia - carro.bateria);
          carro.bateria = cheia; // sempre até encher, sem exceção
          carro.bateriaRecebida += recebido;
          Estatisticas.somaBateriaRecebida += recebido;
          carro.recargasFeitas++;
          carro.ultimoPostoUsado = no.indice;
          carro.noDeRecargaPlanejado = null;
          this.anotar(
            carro,
            'recarga',
            `Recarga terminada em <b>${no.nome}</b>: entrou com <b>${formatar(cheia - recebido, 0)}</b>, ` +
              `recebeu <b>+${formatar(recebido, 0)}</b> e saiu com <b>${cheia}</b>. Replaneja o trecho seguinte.`
          );
          this.eventos.emitir('recargaConcluida', { carro, no });
          this.planejarRota(carro);
        }
      }
    }

    while (posto.fila.length) {
      const vagaLivre = posto.vagasOcupadas.indexOf(null);
      if (vagaLivre < 0) break;
      const numeroDoCarro = posto.fila.shift()!;
      const carro = this.carrosPorNumero.get(numeroDoCarro);
      if (!carro) continue;
      const esperou = this.hora - carro.horaDeEntradaNaFila;
      carro.horasEmFila += esperou;
      carro.situacao = 'recarregando';
      posto.vagasOcupadas[vagaLivre] = { numeroDoCarro, horasRestantes: posto.horasDeRecarga };
      this.anotar(
        carro,
        'recarga',
        `Entra na vaga de <b>${no.nome}</b> depois de <b>${formatar(esperou, 0)} h</b> de fila. ` +
          `A recarga leva <b>${posto.horasDeRecarga} h</b>.`
      );
    }

    posto.horasDeVagaOcupada += posto.vagasOcupadas.filter(Boolean).length * horas;
  },

  gerarViagemAleatoria(): void {
    if (Malha.nos.length < 2) return;
    if (this.sortearViagem) {
      const viagem = this.sortearViagem(aleatorio);
      this.colocarCarro(viagem.origem, viagem.destino, viagem.bateria);
      return;
    }
    const origem = inteiroEntre(0, Malha.nos.length - 1);
    let destino = inteiroEntre(0, Malha.nos.length - 1);
    if (destino === origem) destino = (destino + 1) % Malha.nos.length;
    this.colocarCarro(origem, destino, inteiroEntre(40, 100));
  },

  /** Chamar sempre que a rede de postos mudar com carros já em campo:
      quem estava em fila, recarregando ou a caminho de um posto que sumiu
      recebe um plano novo em vez de ficar parado para sempre. */
  reconciliarComPostos(): void {
    const emAtendimento = new Set<number>();
    for (const no of Malha.nosComPosto()) {
      no.posto!.fila.forEach((numero) => emAtendimento.add(numero));
      no.posto!.vagasOcupadas.forEach((vaga) => vaga && emAtendimento.add(vaga.numeroDoCarro));
    }
    for (const carro of this.carros) {
      const paradoNoPosto = carro.situacao === 'na fila' || carro.situacao === 'recarregando';
      const destinoDeRecargaSumiu =
        carro.noDeRecargaPlanejado !== null && !Malha.nos[carro.noDeRecargaPlanejado].posto;
      if ((paradoNoPosto && !emAtendimento.has(carro.numero)) || destinoDeRecargaSumiu) {
        carro.noDeRecargaPlanejado = null;
        this.planejarRota(carro);
      }
    }
  },

  /** Chamar depois de mexer no peso de uma aresta: quem já estava rodando nela
      pode ter progresso além do novo peso. Só o progresso é aparado, o gasto de
      bateria fica como está, porque aquela energia já foi realmente consumida. */
  reconciliarComPesos(): void {
    for (const carro of this.carros) {
      if (carro.situacao !== 'em rota' || !carro.arestaAtual) continue;
      if (carro.progressoNaAresta > carro.arestaAtual.peso)
        carro.progressoNaAresta = carro.arestaAtual.peso;
    }
  },

  registrarAmostra(): void {
    Estatisticas.historico.push({
      hora: this.hora,
      emRota: this.contarPorSituacao('em rota'),
      naFila: this.totalNaFila(),
      recarregando: this.totalRecarregando(),
    });
    if (Estatisticas.historico.length > MAXIMO_DE_AMOSTRAS) Estatisticas.historico.shift();
  },

  /** Um passo de tempo, em horas. Não desenha nada, o que permite rodar em lote. */
  avancar(horas: number): void {
    this.hora += horas;
    for (const no of Malha.nosComPosto()) this.atenderPosto(no, horas);
    for (const carro of this.carros) this.moverCarro(carro, horas);

    if (this.configuracao.chegadasAutomaticas) {
      this.acumuladorDeChegadas += horas;
      const intervaloEntreChegadas = 24 / this.configuracao.chegadasPorDia;
      while (this.acumuladorDeChegadas >= intervaloEntreChegadas) {
        this.acumuladorDeChegadas -= intervaloEntreChegadas;
        this.gerarViagemAleatoria();
      }
    }

    this.acumuladorDeAmostra += horas;
    if (this.acumuladorDeAmostra >= INTERVALO_DE_AMOSTRA_H) {
      this.acumuladorDeAmostra = 0;
      this.registrarAmostra();
    }
  },

  contarPorSituacao(situacao: Carro['situacao']): number {
    return this.carros.filter((carro) => carro.situacao === situacao).length;
  },
  totalNaFila(): number {
    return Malha.nosComPosto().reduce((soma, no) => soma + no.posto!.fila.length, 0);
  },
  totalRecarregando(): number {
    return Malha.nosComPosto().reduce(
      (soma, no) => soma + no.posto!.vagasOcupadas.filter(Boolean).length,
      0
    );
  },
  utilizacaoDoPosto(no: No): number {
    if (this.hora <= 0) return 0;
    return limitar((no.posto!.horasDeVagaOcupada / (no.posto!.vagas * this.hora)) * 100, 0, 100);
  },
};
