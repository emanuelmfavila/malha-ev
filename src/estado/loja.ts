'use client';

import { create } from 'zustand';
import { AlgoritmosDeBusca } from '@/nucleo/algoritmos';
import { CriteriosDeCusto } from '@/nucleo/criterios';
import { Estatisticas } from '@/nucleo/estatisticas';
import { Cenarios } from '@/nucleo/cenarios';
import { Malha } from '@/nucleo/malha';
import { Simulacao } from '@/nucleo/simulacao';
import { formatarDuracao, formatarRelogio } from '@/nucleo/utilidades';
import { VistaDoMapa, type Exibicao } from '@/mapa/vista';
import { CORES } from '@/mapa/cores';

/* A vista é um objeto vivo, fora do React: o laço de animação escreve nela a
   60 quadros por segundo. O React só a lê quando precisa desenhar um painel. */
export const vista = new VistaDoMapa();

export interface Ocorrencia {
  hora: number;
  mensagem: string;
}

export interface LinhaDaComparacao {
  id: string;
  nome: string;
  cor: string;
  nosExpandidos: number;
  custo: number;
  arestas: number;
}

export interface Comparacao {
  linhas: LinhaDaComparacao[];
  mesmoCusto: boolean;
  economia: number;
  menor: number;
  maior: number;
  origem: string;
  destino: string;
}

interface Loja {
  /* O tique é o batimento da interface. O motor roda a 60 quadros por segundo,
     mas os painéis só re-renderizam quando este número muda, algumas vezes por
     segundo. É o que impede a árvore do React de virar gargalo. */
  tique: number;
  bater: () => void;

  emExecucao: boolean;
  /** Qual cenário montou a malha: aleatória ou uma região real. */
  cenario: string;
  quantidadeDeNos: number;
  rotasExtras: number;
  semente: number;
  quantidadeDePostos: number;
  /** Bateria, consumo, vagas e tempo de recarga: começam nos padrões do cenário. */
  bateriaCheia: number;
  consumoPorHora: number;
  vagasPorPosto: number;
  horasDeRecarga: number;
  /** Quanto a espera prevista na fila pesa na escolha do posto. */
  pesoDaFila: number;
  /** O painel de regras (engrenagem) está aberto. */
  regrasAbertas: boolean;
  horasPorSegundo: number;
  chegadasAutomaticas: boolean;
  chegadasPorDia: number;
  algoritmo: string;
  criterio: string;
  reserva: number;
  limiarDeRecarga: number;
  recalcularAoTrocar: boolean;
  bateriaInicial: number;
  quantidadeDeCarros: number;
  par: { origem: number | null; destino: number | null };
  /* Qual das duas pontas o próximo clique no mapa preenche. Vale tanto para o
     par que cria carros novos quanto para a rota do carro selecionado. */
  campoAtivo: 'origem' | 'destino';
  carroSelecionado: number | null;
  arestaSelecionada: number | null;
  exibicao: Exibicao;
  ocorrencias: Ocorrencia[];
  comparacao: Comparacao | null;

  registrarOcorrencia: (mensagem: string) => void;
  alternarExecucao: () => void;
  avancarUmaHora: () => void;
  reiniciar: () => void;
  gerarMalha: () => void;
  escolherCenario: (id: string) => void;
  abrirRegras: (aberto: boolean) => void;
  sortearSemente: () => void;
  aplicarPostos: (silencioso?: boolean) => void;
  definirCampo: <C extends keyof Loja>(campo: C, valor: Loja[C]) => void;
  definirAlgoritmo: (id: string) => void;
  definirExibicao: (chave: keyof Exibicao, valor: boolean) => void;
  escolherNo: (indice: number) => void;
  definirCampoAtivo: (campo: 'origem' | 'destino') => void;
  colocarCarro: () => void;
  carrosAleatorios: () => void;
  selecionarAresta: (indice: number | null) => void;
  definirPesoDaAresta: (indice: number, peso: number) => void;
  limparEncerrados: () => void;
  selecionarCarro: (numero: number | null) => void;
  compararAlgoritmos: () => void;
  exportarDados: () => void;
}

export const usarLoja = create<Loja>((definir, ler) => ({
  tique: 0,
  bater: () => definir((estado) => ({ tique: estado.tique + 1 })),

  emExecucao: false,
  cenario: 'aleatoria',
  quantidadeDeNos: 14,
  rotasExtras: 6,
  semente: 7,
  quantidadeDePostos: 4,
  bateriaCheia: Cenarios.porId.aleatoria.bateriaCheia,
  consumoPorHora: Cenarios.porId.aleatoria.consumoPorHora,
  vagasPorPosto: Cenarios.porId.aleatoria.postos.vagas,
  horasDeRecarga: Cenarios.porId.aleatoria.postos.horasDeRecarga,
  pesoDaFila: Simulacao.configuracao.pesoDaFila,
  regrasAbertas: false,
  horasPorSegundo: 4,
  chegadasAutomaticas: false,
  chegadasPorDia: 12,
  algoritmo: 'dijkstra',
  criterio: 'peso',
  reserva: 10,
  limiarDeRecarga: 30,
  recalcularAoTrocar: false,
  bateriaInicial: 100,
  quantidadeDeCarros: 1,
  par: { origem: null, destino: null },
  campoAtivo: 'destino',
  carroSelecionado: null,
  arestaSelecionada: null,
  exibicao: { pesos: true, rotas: true, nomes: true, transito: true },
  ocorrencias: [],
  comparacao: null,

  registrarOcorrencia(mensagem) {
    definir((estado) => ({
      ocorrencias: [...estado.ocorrencias, { hora: Simulacao.hora, mensagem }].slice(-60),
    }));
  },

  alternarExecucao() {
    const emExecucao = !ler().emExecucao;
    Simulacao.emExecucao = emExecucao;
    definir({ emExecucao });
  },

  avancarUmaHora() {
    Simulacao.avancar(1);
    ler().bater();
  },

  reiniciar() {
    Simulacao.reiniciar();
    vista.pulsos = [];
    vista.busca = null;
    vista.carroSelecionado = null;
    definir({ carroSelecionado: null, comparacao: null });
    ler().registrarOcorrencia('Simulação reiniciada.');
    ler().bater();
  },

  gerarMalha() {
    const estado = ler();
    const cenario = Cenarios.porId[estado.cenario];
    cenario.montar(estado);
    Malha.configurarPostos(
      Math.min(estado.quantidadeDePostos, Malha.nos.length),
      estado.vagasPorPosto,
      estado.horasDeRecarga
    );
    Simulacao.sortearViagem = cenario.sortearViagem;
    Simulacao.configuracao.bateriaCheia = estado.bateriaCheia;
    Simulacao.configuracao.consumoPorHora = estado.consumoPorHora;
    vista.kmPorUnidadeDeMundo = cenario.kmPorUnidadeDeMundo;
    Simulacao.reiniciar();

    const par = { origem: 0, destino: Malha.nos.length - 1 };
    vista.par = par;
    vista.carroSelecionado = null;
    vista.arestaSelecionada = null;
    vista.busca = null;
    vista.pulsos = [];
    AlgoritmosDeBusca.gravarExpansao = false;
    definir({
      par,
      campoAtivo: 'destino',
      carroSelecionado: null,
      arestaSelecionada: null,
      comparacao: null,
    });

    const pesos = Malha.arestas.map((a) => a.peso);
    estado.registrarOcorrencia(
      `${cenario.aleatoria ? 'Malha gerada' : cenario.nome}: ${Malha.nos.length} nós, ${Malha.arestas.length} arestas, ` +
        `pesos de ${formatarDuracao(Math.min(...pesos))} a ${formatarDuracao(Math.max(...pesos))}, ` +
        `bateria de ${estado.bateriaCheia} a ${estado.consumoPorHora} por hora ` +
        `(${formatarDuracao(estado.bateriaCheia / estado.consumoPorHora)} de autonomia).`
    );
    estado.bater();
  },

  /** Troca o cenário e monta a malha dele, com a quantidade padrão de postos. */
  escolherCenario(id) {
    const cenario = Cenarios.porId[id];
    if (!cenario) return;
    definir({
      cenario: id,
      quantidadeDePostos: cenario.postos.quantidadePadrao,
      vagasPorPosto: cenario.postos.vagas,
      horasDeRecarga: cenario.postos.horasDeRecarga,
      bateriaCheia: cenario.bateriaCheia,
      consumoPorHora: cenario.consumoPorHora,
      bateriaInicial: cenario.bateriaCheia,
    });
    ler().gerarMalha();
    vista.camera.enquadrar();
  },

  abrirRegras(aberto) {
    definir({ regrasAbertas: aberto });
  },

  sortearSemente() {
    definir({ semente: Math.floor(Math.random() * 9999) + 1 });
    ler().gerarMalha();
  },

  aplicarPostos(silencioso = false) {
    const { quantidadeDePostos, vagasPorPosto, horasDeRecarga } = ler();
    Malha.configurarPostos(quantidadeDePostos, vagasPorPosto, horasDeRecarga);
    Simulacao.reconciliarComPostos();
    if (!silencioso)
      ler().registrarOcorrencia(
        `${Malha.nosComPosto().length} postos ativos, ${vagasPorPosto} ` +
          `${vagasPorPosto === 1 ? 'vaga' : 'vagas'} cada, recarga de ` +
          `${formatarDuracao(horasDeRecarga)}.`
      );
    ler().bater();
  },

  definirCampo(campo, valor) {
    definir({ [campo]: valor } as Partial<Loja>);
    if (campo === 'horasPorSegundo') Simulacao.configuracao.horasPorSegundo = valor as number;
    if (campo === 'chegadasPorDia') Simulacao.configuracao.chegadasPorDia = valor as number;
    if (campo === 'chegadasAutomaticas') Simulacao.configuracao.chegadasAutomaticas = valor as boolean;
    if (campo === 'reserva') Simulacao.configuracao.reserva = valor as number;
    if (campo === 'limiarDeRecarga') Simulacao.configuracao.limiarDeRecarga = valor as number;
    if (campo === 'bateriaCheia') {
      Simulacao.configuracao.bateriaCheia = valor as number;
      if (ler().bateriaInicial > (valor as number)) definir({ bateriaInicial: valor as number });
    }
    if (campo === 'consumoPorHora') Simulacao.configuracao.consumoPorHora = valor as number;
    if (campo === 'pesoDaFila') Simulacao.configuracao.pesoDaFila = valor as number;
    if (campo === 'quantidadeDePostos') ler().aplicarPostos(true);
    /* Vagas e tempo de recarga valem para os postos que já existem: reconfigura
       na hora, e quem estava na fila ou na vaga é replanejado. */
    if (campo === 'vagasPorPosto' || campo === 'horasDeRecarga') ler().aplicarPostos(true);
    ler().bater();
  },

  definirAlgoritmo(id) {
    Simulacao.configuracao.algoritmo = id;
    definir({ algoritmo: id });
    if (ler().recalcularAoTrocar)
      for (const carro of Simulacao.carros)
        if (carro.situacao === 'em rota') {
          carro.arestaAtual = null;
          Simulacao.planejarRota(carro);
        }
    ler().bater();
  },

  definirExibicao(chave, valor) {
    const exibicao = { ...ler().exibicao, [chave]: valor };
    vista.exibicao = exibicao;
    definir({ exibicao });
  },

  definirCampoAtivo(campo) {
    definir({ campoAtivo: campo });
  },

  /* Um clique no mapa preenche a ponta que está ativa. Com um carro selecionado
     ele mexe na rota daquele carro, e a mudança vale na hora; sem seleção, mexe
     no par que serve para criar carros novos. */
  escolherNo(indice) {
    const { carroSelecionado, campoAtivo, registrarOcorrencia, bater } = ler();

    if (carroSelecionado !== null) {
      const carro = Simulacao.carrosPorNumero.get(carroSelecionado);
      if (!carro) return;
      const nome = Malha.nos[indice].nome;

      if (campoAtivo === 'origem') {
        if (!Simulacao.reposicionar(carro, indice))
          return registrarOcorrencia(
            `${carro.nome}: a origem só muda com o carro parado num nó e diferente do destino.`
          );
        registrarOcorrencia(`${carro.nome} passa a sair de ${nome}.`);
        definir({ campoAtivo: 'destino' });
      } else {
        if (!Simulacao.redirecionar(carro, indice))
          return registrarOcorrencia(`${carro.nome}: esse já é o destino, ou o carro não anda mais.`);
        registrarOcorrencia(`${carro.nome} passa a ir para ${nome}.`);
      }
      bater();
      return;
    }

    const par = { ...ler().par };
    if (campoAtivo === 'origem') {
      par.origem = indice;
      if (par.destino === indice) par.destino = null;
      definir({ campoAtivo: 'destino' });
    } else {
      if (indice === par.origem)
        return registrarOcorrencia('Origem e destino precisam ser diferentes.');
      par.destino = indice;
    }
    vista.par = par;
    definir({ par });
  },

  colocarCarro() {
    const { par, bateriaInicial, quantidadeDeCarros, registrarOcorrencia, bater } = ler();
    if (par.origem === null || par.destino === null)
      return registrarOcorrencia('Clique num nó para a origem e noutro para o destino.');

    let colocados = 0;
    for (let k = 0; k < quantidadeDeCarros; k++)
      if (Simulacao.colocarCarro(par.origem, par.destino, bateriaInicial)) colocados++;

    if (!colocados) return registrarOcorrencia('Origem e destino precisam ser diferentes.');
    if (colocados > 1)
      registrarOcorrencia(
        `${colocados} carros colocados em ${Malha.nos[par.origem].nome} → ${Malha.nos[par.destino].nome}.`
      );
    bater();
  },


  carrosAleatorios() {
    for (let k = 0; k < 5; k++) Simulacao.gerarViagemAleatoria();
    ler().bater();
  },

  selecionarAresta(indice) {
    const atual = ler().arestaSelecionada;
    const novo = atual === indice ? null : indice;
    vista.arestaSelecionada = novo === null ? null : Malha.arestas[novo];
    definir({ arestaSelecionada: novo });
  },

  /* Mexer no peso muda de uma vez o tempo de viagem e o gasto de bateria da
     aresta. Quem já estava rodando nela tem o progresso aparado, e as rotas são
     refeitas se o usuário pediu para recalcular. */
  definirPesoDaAresta(indice, peso) {
    const novo = Malha.definirPeso(indice, peso);
    Simulacao.reconciliarComPesos();
    if (ler().recalcularAoTrocar)
      for (const carro of Simulacao.carros)
        if (carro.situacao === 'em rota' && carro.progressoNaAresta === 0) {
          carro.arestaAtual = null;
          Simulacao.planejarRota(carro);
        }
    const aresta = Malha.arestas[indice];
    if (aresta)
      ler().registrarOcorrencia(
        `Aresta ${Malha.nos[aresta.de].nome}–${Malha.nos[aresta.para].nome} agora custa ${novo}.`
      );
    ler().bater();
  },

  limparEncerrados() {
    Simulacao.carros = Simulacao.carros.filter(
      (carro) => carro.situacao !== 'chegou' && carro.situacao !== 'falhou'
    );
    Simulacao.carrosPorNumero.clear();
    Simulacao.carros.forEach((carro) => Simulacao.carrosPorNumero.set(carro.numero, carro));
    if (!Simulacao.carrosPorNumero.has(ler().carroSelecionado ?? -1)) ler().selecionarCarro(null);
    ler().bater();
  },

  /** Com um carro selecionado a busca passa a gravar a ordem de expansão, para
      poder animar a decisão dele. Sem ninguém selecionado, esse custo some. */
  selecionarCarro(numero) {
    const atual = ler().carroSelecionado;
    const novo = atual === numero ? null : numero;
    vista.carroSelecionado = novo;
    AlgoritmosDeBusca.gravarExpansao = novo !== null;
    if (novo === null) vista.busca = null;
    // ao pegar um carro, o clique seguinte mexe no destino dele
    definir({ carroSelecionado: novo, campoAtivo: 'destino', arestaSelecionada: null });
    vista.arestaSelecionada = null;
    ler().bater();
  },

  /* Roda cada algoritmo registrado no mesmo par origem-destino e acende no mapa
     os nós que cada um abriu. É a forma mais direta de ver por que o A* custa
     menos: mesmo caminho ótimo, muito menos nó visitado. */
  compararAlgoritmos() {
    const { par, registrarOcorrencia, carroSelecionado, bater } = ler();
    if (par.origem === null || par.destino === null || par.origem === par.destino)
      return registrarOcorrencia('Escolha uma origem e um destino diferentes para comparar.');

    const criterio = CriteriosDeCusto.porId[Simulacao.configuracao.criterio];
    AlgoritmosDeBusca.gravarExpansao = true;
    const execucoes = AlgoritmosDeBusca.lista
      .map((algoritmo) => ({ algoritmo, resultado: algoritmo.buscar(par.origem!, par.destino!, criterio) }))
      .filter((item) => item.resultado);
    AlgoritmosDeBusca.gravarExpansao = carroSelecionado !== null;

    if (!execucoes.length) return registrarOcorrencia('Não há caminho entre os nós escolhidos.');

    vista.mostrarBusca(
      execucoes.map((item, ordem) => ({
        cor: item.algoritmo.cor,
        nome: item.algoritmo.nomeCurto,
        raio: 16 - ordem * 5.5,
        ordem: item.resultado!.ordemDeExpansao ?? [],
        caminho: item.resultado!.caminho,
      }))
    );

    const custos = execucoes.map((item) => item.resultado!.custo);
    const expandidos = execucoes.map((item) => item.resultado!.nosExpandidos);
    const menor = Math.min(...expandidos);
    const maior = Math.max(...expandidos);

    definir({
      comparacao: {
        linhas: execucoes.map((item) => ({
          id: item.algoritmo.id,
          nome: item.algoritmo.nomeCurto,
          cor: item.algoritmo.cor,
          nosExpandidos: item.resultado!.nosExpandidos,
          custo: item.resultado!.custo,
          arestas: item.resultado!.caminho.length - 1,
        })),
        mesmoCusto: Math.max(...custos) - Math.min(...custos) < 1e-9,
        economia: maior ? (1 - menor / maior) * 100 : 0,
        menor,
        maior,
        origem: Malha.nos[par.origem].nome,
        destino: Malha.nos[par.destino].nome,
      },
    });
    registrarOcorrencia(
      `Busca de ${Malha.nos[par.origem].nome} a ${Malha.nos[par.destino].nome}: ` +
        execucoes.map((i) => `${i.algoritmo.nomeCurto} ${i.resultado!.nosExpandidos}`).join(', ') +
        ' nós abertos.'
    );
    bater();
  },

  exportarDados() {
    const dados = {
      cenario: ler().cenario,
      modelo: { regra: 'peso da aresta = horas de viagem; bateria gasta = horas × consumo por hora' },
      configuracao: {
        ...Simulacao.configuracao,
        nos: Malha.nos.length,
        arestas: Malha.arestas.length,
        postos: Malha.nosComPosto().length,
        horasSimuladas: Simulacao.hora,
      },
      resultados: { ...Estatisticas, historico: undefined },
      arestas: Malha.arestas.map((a) => ({
        de: Malha.nos[a.de].nome,
        para: Malha.nos[a.para].nome,
        peso: a.peso,
      })),
      postos: Malha.nosComPosto().map((no) => ({
        no: no.nome,
        recargasConcluidas: no.posto!.recargasConcluidas,
        maiorFila: no.posto!.maiorFila,
        utilizacaoPercentual: Simulacao.utilizacaoDoPosto(no),
      })),
      carros: Simulacao.carros.map((carro) => ({
        nome: carro.nome,
        situacao: carro.situacao,
        origem: Malha.nos[carro.noDeOrigem].nome,
        destino: Malha.nos[carro.noDestinoFinal].nome,
        bateriaInicial: carro.bateriaInicial,
        bateriaRecebida: carro.bateriaRecebida,
        bateriaGasta: carro.bateriaGasta,
        bateriaAgora: carro.bateria,
        pesoPercorrido: carro.pesoPercorrido,
        horasDeViagem: (carro.horaDeChegada ?? Simulacao.hora) - carro.horaDePartida,
        horasEmFila: carro.horasEmFila,
        recargasFeitas: carro.recargasFeitas,
        diario: carro.diario.map((entrada) => ({
          hora: formatarRelogio(entrada.hora),
          tipo: entrada.tipo,
          texto: entrada.texto.replace(/<[^>]+>/g, ''),
        })),
      })),
    };
    const arquivo = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const endereco = URL.createObjectURL(arquivo);
    const ancora = document.createElement('a');
    ancora.href = endereco;
    ancora.download = 'malha-ev.json';
    ancora.click();
    URL.revokeObjectURL(endereco);
  },
}));

/** Duração em horas escrita para gente: "55 min", "2 h 10". */
export const duracao = (horas: number) => formatarDuracao(horas);

export const CORES_DO_DIARIO: Record<string, string> = {
  partida: CORES.gelo,
  rota: CORES.gelo,
  desvio: CORES.ambar,
  fila: CORES.ambar,
  recarga: CORES.ambar,
  chegada: CORES.menta,
  falha: CORES.ameixa,
};
