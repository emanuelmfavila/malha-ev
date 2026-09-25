import { Malha } from '@/nucleo/malha';
import { Simulacao } from '@/nucleo/simulacao';
import type { Aresta, Carro, No } from '@/nucleo/tipos';
import { formatar, limitar } from '@/nucleo/utilidades';
import { Camera } from './camera';
import { CORES, corDaBateria, corDaSituacao } from './cores';

export interface Exibicao {
  pesos: boolean;
  rotas: boolean;
  nomes: boolean;
  transito: boolean;
}

export interface ExecucaoDeBusca {
  cor: string;
  nome: string;
  raio: number;
  ordem: number[];
  caminho: number[];
}

interface Busca {
  execucoes: ExecucaoDeBusca[];
  inicio: number;
  duracao: number;
  efemera: boolean;
}

interface Pulso {
  x: number;
  y: number;
  nascimento: number;
  cor: string;
}

export type Alvo =
  | { tipo: 'carro'; carro: Carro }
  | { tipo: 'no'; no: No }
  | { tipo: 'aresta'; aresta: Aresta }
  | null;

/** Distância de um ponto ao segmento, em pixels de tela. */
function distanciaAoSegmento(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const comprimentoAoQuadrado = dx * dx + dy * dy;
  if (comprimentoAoQuadrado === 0) return Math.hypot(px - x1, py - y1);
  const t = limitar(((px - x1) * dx + (py - y1) * dy) / comprimentoAoQuadrado, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/* Tudo que é só visual mora aqui: câmera, animação, camada de estudo da busca.
   Desenha lendo o motor direto, sem passar por estado do React, que é o que
   permite manter 60 quadros por segundo com centenas de carros. */
export class VistaDoMapa {
  camera = new Camera();
  segundos = 0;
  pulsos: Pulso[] = [];
  busca: Busca | null = null;
  alvoSobOMouse: Alvo = null;
  carroSelecionado: number | null = null;
  arestaSelecionada: Aresta | null = null;
  par: { origem: number | null; destino: number | null } = { origem: null, destino: null };
  exibicao: Exibicao = { pesos: true, rotas: true, nomes: true, transito: true };
  /** Quantos km vale uma unidade do mundo; com isso a vista desenha uma barra de escala. */
  kmPorUnidadeDeMundo: number | null = null;

  private arestasOcupadas = new Set<number>();

  criarPulso(x: number, y: number, cor: string): void {
    this.pulsos.push({ x, y, nascimento: this.segundos, cor });
  }

  mostrarBusca(execucoes: ExecucaoDeBusca[], opcoes?: Partial<Busca>): void {
    this.busca = {
      execucoes,
      inicio: this.segundos,
      duracao: 18,
      efemera: false,
      ...opcoes,
    };
  }

  posicaoDoCarro(carro: Carro): { x: number; y: number; angulo: number } {
    /* Quem ficou sem bateria para onde estava, no meio da aresta, e não volta
       para o nó anterior: é isso que dá para ver a pane acontecer no mapa. */
    const naEstrada =
      carro.arestaAtual !== null && carro.caminho.length > carro.indiceNoCaminho + 1;
    if (naEstrada && (carro.situacao === 'em rota' || carro.motivoDaFalha === 'bateria')) {
      const de = Malha.nos[carro.caminho[carro.indiceNoCaminho]];
      const para = Malha.nos[carro.caminho[carro.indiceNoCaminho + 1]];
      const fracao = limitar(carro.progressoNaAresta / carro.arestaAtual!.peso, 0, 1);
      return {
        x: de.x + (para.x - de.x) * fracao,
        y: de.y + (para.y - de.y) * fracao,
        angulo: Math.atan2(para.y - de.y, para.x - de.x),
      };
    }
    const no = Malha.nos[carro.noAtual];
    const posto = no.posto;
    if (carro.situacao === 'recarregando' && posto) return { x: no.x, y: no.y - 20, angulo: 0 };
    if (carro.situacao === 'na fila' && posto) {
      const lugar = Math.max(posto.fila.indexOf(carro.numero), 0);
      return { x: no.x + 26 + lugar * 11, y: no.y + 21, angulo: 0 };
    }
    return { x: no.x, y: no.y, angulo: 0 };
  }

  /** O que está debaixo do ponteiro. A ordem importa: carro ganha do nó, e o nó
      ganha da aresta, senão clicar perto de uma ponta pegaria a linha em vez do
      nó. */
  alvoEm(telaX: number, telaY: number): Alvo {
    const ponto = this.camera.paraMundo(telaX, telaY);
    for (const carro of Simulacao.carros) {
      const posicao = this.posicaoDoCarro(carro);
      if (Math.hypot(posicao.x - ponto.x, posicao.y - ponto.y) * this.camera.escala < 13)
        return { tipo: 'carro', carro };
    }
    for (const no of Malha.nos)
      if (Math.hypot(no.x - ponto.x, no.y - ponto.y) * this.camera.escala < 17) return { tipo: 'no', no };

    let maisPerto: Aresta | null = null;
    let menorDistancia = 10;                       // tolerância em pixels
    for (const aresta of Malha.arestas) {
      const de = Malha.nos[aresta.de];
      const para = Malha.nos[aresta.para];
      const distancia = distanciaAoSegmento(
        telaX, telaY,
        this.camera.paraTelaX(de.x), this.camera.paraTelaY(de.y),
        this.camera.paraTelaX(para.x), this.camera.paraTelaY(para.y)
      );
      if (distancia < menorDistancia) {
        menorDistancia = distancia;
        maisPerto = aresta;
      }
    }
    return maisPerto ? { tipo: 'aresta', aresta: maisPerto } : null;
  }

  /* ------------------------------- desenho -------------------------------- */
  desenhar(contexto: CanvasRenderingContext2D, segundosDoQuadro: number): void {
    this.segundos += segundosDoQuadro;

    this.arestasOcupadas.clear();
    for (const carro of Simulacao.carros)
      if (carro.situacao === 'em rota' && carro.arestaAtual)
        this.arestasOcupadas.add(carro.arestaAtual.indice);

    const { larguraCss, alturaCss } = this.camera;
    contexto.clearRect(0, 0, larguraCss, alturaCss);
    this.fundo(contexto);
    this.arestas(contexto);
    if (this.exibicao.rotas) this.rotas(contexto);
    this.camadaDeBusca(contexto);
    this.nos(contexto);
    this.parEscolhido(contexto);
    this.carros(contexto);
    this.pulsosNaTela(contexto);
    this.vinheta(contexto);
    this.barraDeEscala(contexto);
  }

  /** Barra de escala em km, no canto superior direito, só em mapas com escala real. */
  private barraDeEscala(contexto: CanvasRenderingContext2D): void {
    const kmPorUnidade = this.kmPorUnidadeDeMundo;
    if (!kmPorUnidade) return;
    const pixelsPorKm = this.camera.escala / kmPorUnidade;
    const opcoes = [10, 20, 50, 100, 200, 500];
    const km = opcoes.find((k) => k * pixelsPorKm >= 70) ?? 500;
    const largura = km * pixelsPorKm;
    const direita = this.camera.larguraCss - 24;
    const y = 180;
    contexto.strokeStyle = 'rgba(200,214,230,.7)';
    contexto.lineWidth = 1.5;
    contexto.beginPath();
    contexto.moveTo(direita - largura, y - 5);
    contexto.lineTo(direita - largura, y);
    contexto.lineTo(direita, y);
    contexto.lineTo(direita, y - 5);
    contexto.stroke();
    contexto.fillStyle = '#8ea0b5';
    contexto.font = '600 10.5px Inter, system-ui, sans-serif';
    contexto.textAlign = 'center';
    contexto.fillText(`${km} km`, direita - largura / 2, y - 9);
  }

  private fundo(contexto: CanvasRenderingContext2D): void {
    const { larguraCss, alturaCss, escala } = this.camera;
    const ceu = contexto.createLinearGradient(0, 0, 0, alturaCss);
    ceu.addColorStop(0, '#0a1119');
    ceu.addColorStop(1, '#06090e');
    contexto.fillStyle = ceu;
    contexto.fillRect(0, 0, larguraCss, alturaCss);

    // grade presa ao mundo: ao mover ou aproximar dá para sentir a escala
    let espacamento = 50 * escala;
    while (espacamento < 22) espacamento *= 2;
    const inicioX = this.camera.paraTelaX(0) % espacamento;
    const inicioY = this.camera.paraTelaY(0) % espacamento;
    contexto.fillStyle = 'rgba(126,158,190,.06)';
    for (let x = inicioX; x < larguraCss; x += espacamento)
      for (let y = inicioY; y < alturaCss; y += espacamento) contexto.fillRect(x, y, 1.2, 1.2);

    const brilho = contexto.createRadialGradient(
      larguraCss / 2, alturaCss * 0.42, 20,
      larguraCss / 2, alturaCss * 0.42, Math.max(larguraCss, alturaCss) * 0.7
    );
    brilho.addColorStop(0, 'rgba(92,196,232,.07)');
    brilho.addColorStop(1, 'rgba(0,0,0,0)');
    contexto.fillStyle = brilho;
    contexto.fillRect(0, 0, larguraCss, alturaCss);
  }

  private vinheta(contexto: CanvasRenderingContext2D): void {
    const { larguraCss, alturaCss } = this.camera;
    const sombra = contexto.createRadialGradient(
      larguraCss / 2, alturaCss / 2, Math.min(larguraCss, alturaCss) * 0.34,
      larguraCss / 2, alturaCss / 2, Math.max(larguraCss, alturaCss) * 0.78
    );
    sombra.addColorStop(0, 'rgba(0,0,0,0)');
    sombra.addColorStop(1, 'rgba(0,0,0,.42)');
    contexto.fillStyle = sombra;
    contexto.fillRect(0, 0, larguraCss, alturaCss);
  }

  private arestas(contexto: CanvasRenderingContext2D): void {
    const camera = this.camera;
    /* A grossura vem do peso: aresta cara é mais grossa e mais clara. Assim o
       custo de um caminho já se lê no desenho, antes de somar os números. */
    const maiorPeso = Math.max(1, ...Malha.arestas.map((a) => a.peso));
    contexto.lineCap = 'round';

    for (const aresta of Malha.arestas) {
      const de = Malha.nos[aresta.de];
      const para = Malha.nos[aresta.para];
      const x1 = camera.paraTelaX(de.x);
      const y1 = camera.paraTelaY(de.y);
      const x2 = camera.paraTelaX(para.x);
      const y2 = camera.paraTelaY(para.y);
      const caro = aresta.peso / maiorPeso;
      const emFoco =
        this.arestaSelecionada === aresta ||
        (this.alvoSobOMouse?.tipo === 'aresta' && this.alvoSobOMouse.aresta === aresta);
      const largura = (1.5 + caro * 2.4) * (emFoco ? 1.6 : 1);

      contexto.strokeStyle = '#0e161f';
      contexto.lineWidth = largura + 3.4;
      contexto.beginPath();
      contexto.moveTo(x1, y1);
      contexto.lineTo(x2, y2);
      contexto.stroke();

      const asfalto = contexto.createLinearGradient(x1, y1, x2, y2);
      const claro = `rgb(${Math.round(38 + caro * 30)},${Math.round(52 + caro * 36)},${Math.round(70 + caro * 44)})`;
      asfalto.addColorStop(0, '#1e2b39');
      asfalto.addColorStop(0.5, claro);
      asfalto.addColorStop(1, '#1e2b39');
      contexto.strokeStyle = emFoco ? CORES.gelo : asfalto;
      contexto.lineWidth = largura;
      contexto.beginPath();
      contexto.moveTo(x1, y1);
      contexto.lineTo(x2, y2);
      contexto.stroke();

      if (this.exibicao.transito && this.arestasOcupadas.has(aresta.indice)) {
        contexto.strokeStyle = 'rgba(92,196,232,.34)';
        contexto.lineWidth = Math.max(largura * 0.55, 1.1);
        contexto.setLineDash([2.5, 11]);
        contexto.lineDashOffset = -this.segundos * 46;
        contexto.beginPath();
        contexto.moveTo(x1, y1);
        contexto.lineTo(x2, y2);
        contexto.stroke();
        contexto.setLineDash([]);
        contexto.lineDashOffset = 0;
      }

      if ((this.exibicao.pesos || emFoco) && camera.escala > 0.34) {
        const meioX = (x1 + x2) / 2;
        const meioY = (y1 + y2) / 2;
        contexto.font = `600 ${emFoco ? 12 : 11}px ui-monospace, monospace`;
        contexto.textAlign = 'center';
        contexto.textBaseline = 'middle';
        contexto.fillStyle = emFoco ? 'rgba(10,26,36,.96)' : 'rgba(8,13,20,.9)';
        contexto.strokeStyle = emFoco ? CORES.gelo : '#2b3a4c';
        contexto.lineWidth = emFoco ? 1.6 : 1;
        contexto.beginPath();
        contexto.arc(meioX, meioY, emFoco ? 11 : 9, 0, Math.PI * 2);
        contexto.fill();
        contexto.stroke();
        contexto.fillStyle = emFoco ? CORES.gelo : '#93a6bb';
        contexto.fillText(String(aresta.peso), meioX, meioY + 0.5);
        contexto.textBaseline = 'alphabetic';
      }
    }
  }

  private rotas(contexto: CanvasRenderingContext2D): void {
    const camera = this.camera;
    for (const carro of Simulacao.carros) {
      const emMovimento =
        carro.situacao === 'em rota' || carro.situacao === 'na fila' || carro.situacao === 'recarregando';
      if (!emMovimento || carro.caminho.length < 2) continue;
      const destacada = this.carroSelecionado === carro.numero;

      contexto.strokeStyle = destacada ? 'rgba(92,196,232,.95)' : `hsla(${carro.matiz},68%,62%,.2)`;
      contexto.lineWidth = destacada ? 2.8 : 1.5;
      contexto.setLineDash(destacada ? [9, 7] : [4, 6]);
      contexto.lineDashOffset = -this.segundos * 24;
      contexto.beginPath();
      for (let passo = carro.indiceNoCaminho; passo < carro.caminho.length; passo++) {
        const no = Malha.nos[carro.caminho[passo]];
        const x = camera.paraTelaX(no.x);
        const y = camera.paraTelaY(no.y);
        if (passo === carro.indiceNoCaminho) contexto.moveTo(x, y);
        else contexto.lineTo(x, y);
      }
      contexto.stroke();
      contexto.setLineDash([]);
      contexto.lineDashOffset = 0;

      if (destacada && carro.noDeRecargaPlanejado !== null) {
        const parada = Malha.nos[carro.noDeRecargaPlanejado];
        contexto.strokeStyle = CORES.ambar;
        contexto.lineWidth = 1.6;
        contexto.setLineDash([3, 4]);
        contexto.beginPath();
        contexto.arc(camera.paraTelaX(parada.x), camera.paraTelaY(parada.y), 21, 0, Math.PI * 2);
        contexto.stroke();
        contexto.setLineDash([]);
      }
    }
  }

  /** Origem e destino escolhidos ficam sempre marcados: é o par que o botão
      "Colocar carro" e a comparação de buscas vão usar. */
  private parEscolhido(contexto: CanvasRenderingContext2D): void {
    const marcar = (indice: number | null, cor: string, rotulo: string) => {
      if (indice === null || !Malha.nos[indice]) return;
      const no = Malha.nos[indice];
      const x = this.camera.paraTelaX(no.x);
      const y = this.camera.paraTelaY(no.y);
      const respiro = 1 + Math.sin(this.segundos * 2.2) * 0.08;
      contexto.strokeStyle = cor;
      contexto.lineWidth = 1.8;
      contexto.beginPath();
      contexto.arc(x, y, 18 * respiro, 0, Math.PI * 2);
      contexto.stroke();
      contexto.globalAlpha = 0.3;
      contexto.beginPath();
      contexto.arc(x, y, 24 * respiro, 0, Math.PI * 2);
      contexto.stroke();
      contexto.globalAlpha = 1;
      contexto.fillStyle = cor;
      contexto.font = '600 9.5px Inter, system-ui, sans-serif';
      contexto.textAlign = 'center';
      contexto.fillText(rotulo, x, y - 26);
    };
    /* Com um carro selecionado o mapa mostra a rota dele, não o par que serve
       para criar carros novos: é a rota daquele carro que está sendo editada. */
    const carro =
      this.carroSelecionado === null ? undefined : Simulacao.carrosPorNumero.get(this.carroSelecionado);
    marcar(carro ? carro.noDeOrigem : this.par.origem, CORES.menta, 'ORIGEM');
    marcar(carro ? carro.noDestinoFinal : this.par.destino, CORES.gelo, 'DESTINO');
  }

  /** Camada de estudo: mostra quais nós cada algoritmo precisou abrir, na ordem
      em que abriu. É o que faz a diferença entre Dijkstra e A* ficar visível. */
  private camadaDeBusca(contexto: CanvasRenderingContext2D): void {
    const busca = this.busca;
    if (!busca) return;
    const decorrido = this.segundos - busca.inicio;
    if (decorrido > busca.duracao) {
      this.busca = null;
      return;
    }
    const camera = this.camera;
    const maiorOrdem = Math.max(1, ...busca.execucoes.map((e) => e.ordem.length));
    const passo = 1.7 / maiorOrdem; // mesmo ritmo nos dois: quem abre menos termina antes

    for (const execucao of busca.execucoes) {
      for (let posicao = 0; posicao < execucao.ordem.length; posicao++) {
        const nascimento = posicao * passo;
        if (decorrido < nascimento) break;
        const idade = Math.min((decorrido - nascimento) / 0.34, 1);
        const no = Malha.nos[execucao.ordem[posicao]];
        const x = camera.paraTelaX(no.x);
        const y = camera.paraTelaY(no.y);
        const raio = execucao.raio * (0.45 + 0.55 * idade);

        contexto.fillStyle = execucao.cor;
        contexto.globalAlpha = 0.05 + (1 - idade) * 0.16;
        contexto.beginPath();
        contexto.arc(x, y, raio + 4, 0, Math.PI * 2);
        contexto.fill();

        contexto.strokeStyle = execucao.cor;
        contexto.globalAlpha = 0.24 + (1 - idade) * 0.55;
        contexto.lineWidth = 1.5;
        contexto.beginPath();
        contexto.arc(x, y, raio, 0, Math.PI * 2);
        contexto.stroke();
        contexto.globalAlpha = 1;
      }

      if (decorrido > execucao.ordem.length * passo && execucao.caminho.length) {
        contexto.strokeStyle = execucao.cor;
        contexto.globalAlpha = 0.85;
        contexto.lineWidth = 2.6;
        contexto.beginPath();
        execucao.caminho.forEach((indice, ordem) => {
          const no = Malha.nos[indice];
          const x = camera.paraTelaX(no.x);
          const y = camera.paraTelaY(no.y);
          if (ordem) contexto.lineTo(x, y);
          else contexto.moveTo(x, y);
        });
        contexto.stroke();
        contexto.globalAlpha = 1;
      }
    }
  }

  private nos(contexto: CanvasRenderingContext2D): void {
    const camera = this.camera;
    for (const no of Malha.nos) {
      const x = camera.paraTelaX(no.x);
      const y = camera.paraTelaY(no.y);
      const sobOMouse = this.alvoSobOMouse?.tipo === 'no' && this.alvoSobOMouse.no === no;

      if (no.posto) {
        const ocupacao = no.posto.vagasOcupadas.filter(Boolean).length / no.posto.vagas;
        const aureola = contexto.createRadialGradient(x, y, 2, x, y, 30);
        aureola.addColorStop(0, `rgba(240,168,72,${0.1 + ocupacao * 0.28})`);
        aureola.addColorStop(1, 'rgba(240,168,72,0)');
        contexto.fillStyle = aureola;
        contexto.beginPath();
        contexto.arc(x, y, 30, 0, Math.PI * 2);
        contexto.fill();

        contexto.fillStyle = '#0b111a';
        contexto.strokeStyle = CORES.ambar;
        contexto.lineWidth = 1.7;
        contexto.beginPath();
        contexto.rect(x - 7, y - 7, 14, 14);
        contexto.fill();
        contexto.stroke();

        // raio, o símbolo de recarga
        contexto.fillStyle = CORES.ambar;
        contexto.beginPath();
        contexto.moveTo(x + 1.4, y - 4.6);
        contexto.lineTo(x - 2.8, y + 0.5);
        contexto.lineTo(x - 0.2, y + 0.5);
        contexto.lineTo(x - 1.4, y + 4.6);
        contexto.lineTo(x + 2.8, y - 0.7);
        contexto.lineTo(x + 0.2, y - 0.7);
        contexto.closePath();
        contexto.fill();

        if (no.posto.fila.length) {
          const largura = 22 + String(no.posto.fila.length).length * 5;
          contexto.fillStyle = 'rgba(240,168,72,.16)';
          contexto.strokeStyle = CORES.ambar;
          contexto.lineWidth = 1;
          contexto.beginPath();
          contexto.rect(x + 15, y - 21, largura, 13);
          contexto.fill();
          contexto.stroke();
          contexto.fillStyle = CORES.ambar;
          contexto.font = '600 9.5px ui-monospace, monospace';
          contexto.textAlign = 'center';
          contexto.fillText('fila ' + no.posto.fila.length, x + 15 + largura / 2, y - 11.5);
        }
      } else {
        contexto.fillStyle = '#0d1520';
        contexto.strokeStyle = sobOMouse ? '#9fb1c6' : '#43576e';
        contexto.lineWidth = 1.5;
        contexto.beginPath();
        contexto.rect(x - 5, y - 5, 10, 10);
        contexto.fill();
        contexto.stroke();
      }

      if (sobOMouse) {
        contexto.strokeStyle = 'rgba(150,168,190,.55)';
        contexto.lineWidth = 1;
        contexto.beginPath();
        contexto.arc(x, y, 23, 0, Math.PI * 2);
        contexto.stroke();
      }
      if (this.exibicao.nomes && camera.escala > 0.3) {
        contexto.fillStyle = '#8ea0b5';
        contexto.font = `600 ${no.nome.length > 4 ? 10.5 : 11.5}px Inter, system-ui, sans-serif`;
        contexto.textAlign = 'center';
        contexto.fillText(no.nome, x, y + (no.posto ? 24 : 20));
      }
    }
  }

  private carros(contexto: CanvasRenderingContext2D): void {
    const camera = this.camera;
    // nenhum carro é apagado: quem chegou fica parado no nó até o reinício
    for (const carro of Simulacao.carros) {
      const posicao = this.posicaoDoCarro(carro);
      const x = camera.paraTelaX(posicao.x);
      const y = camera.paraTelaY(posicao.y);
      const cor = corDaSituacao(carro.situacao);
      const destacado = this.carroSelecionado === carro.numero;
      const parado = Simulacao.estaSemViagem(carro);

      if (carro.situacao === 'em rota') {
        // rastro curto atrás do carro, dá a leitura do sentido de marcha
        const traseiraX = x - Math.cos(posicao.angulo) * 17;
        const traseiraY = y - Math.sin(posicao.angulo) * 17;
        const rastro = contexto.createLinearGradient(x, y, traseiraX, traseiraY);
        rastro.addColorStop(0, cor + 'b0');
        rastro.addColorStop(1, cor + '00');
        contexto.strokeStyle = rastro;
        contexto.lineWidth = 3.4;
        contexto.lineCap = 'round';
        contexto.beginPath();
        contexto.moveTo(x, y);
        contexto.lineTo(traseiraX, traseiraY);
        contexto.stroke();

        contexto.fillStyle = cor;
        contexto.globalAlpha = 0.12;
        contexto.beginPath();
        contexto.arc(x, y, 12, 0, Math.PI * 2);
        contexto.fill();
        contexto.globalAlpha = 1;
      }

      const fracao = carro.bateria / Simulacao.configuracao.bateriaCheia;
      contexto.strokeStyle = 'rgba(255,255,255,.13)';
      contexto.lineWidth = 2.7;
      contexto.beginPath();
      contexto.arc(x, y, 8.5, 0, Math.PI * 2);
      contexto.stroke();
      contexto.strokeStyle = corDaBateria(fracao);
      contexto.lineWidth = 2.7;
      contexto.beginPath();
      contexto.arc(x, y, 8.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(fracao, 0.001));
      contexto.stroke();

      if (carro.situacao === 'recarregando') {
        const pulso = (Math.sin(this.segundos * 3.4) + 1) / 2;
        contexto.strokeStyle = CORES.ambar;
        contexto.globalAlpha = 0.25 + pulso * 0.45;
        contexto.lineWidth = 1.4;
        contexto.beginPath();
        contexto.arc(x, y, 12 + pulso * 3, 0, Math.PI * 2);
        contexto.stroke();
        contexto.globalAlpha = 1;
      }

      contexto.save();
      contexto.translate(x, y);
      contexto.rotate(posicao.angulo || 0);
      contexto.fillStyle = cor;
      contexto.beginPath();
      contexto.moveTo(4.8, 0);
      contexto.lineTo(-3.4, 3.1);
      contexto.lineTo(-1.8, 0);
      contexto.lineTo(-3.4, -3.1);
      contexto.closePath();
      contexto.fill();
      contexto.restore();

      if (destacado) {
        contexto.strokeStyle = '#ffffff';
        contexto.lineWidth = 1.2;
        contexto.beginPath();
        contexto.arc(x, y, 14, 0, Math.PI * 2);
        contexto.stroke();
        contexto.fillStyle = '#ffffff';
        contexto.font = '600 10px ui-monospace, monospace';
        contexto.textAlign = 'center';
        contexto.fillText(carro.nome, x, y - 19);
        // bateria em número, para não depender de ler o anel
        contexto.font = '600 10.5px ui-monospace, monospace';
        contexto.fillStyle = corDaBateria(fracao);
        contexto.fillText(formatar(carro.bateria, 0), x, y + 26);
      }
      if (parado) {
        // anel fino de "estacionado", para separar de quem ainda está rodando
        contexto.strokeStyle = CORES.menta;
        contexto.globalAlpha = 0.45;
        contexto.lineWidth = 1;
        contexto.beginPath();
        contexto.arc(x, y, 12.5, 0, Math.PI * 2);
        contexto.stroke();
        contexto.globalAlpha = 1;
      }
      if (carro.situacao === 'falhou') {
        contexto.strokeStyle = CORES.ameixa;
        contexto.lineWidth = 1.5;
        contexto.beginPath();
        contexto.moveTo(x - 9, y - 9);
        contexto.lineTo(x + 9, y + 9);
        contexto.moveTo(x + 9, y - 9);
        contexto.lineTo(x - 9, y + 9);
        contexto.stroke();
      }
    }
  }

  private pulsosNaTela(contexto: CanvasRenderingContext2D): void {
    const duracao = 1.1;
    this.pulsos = this.pulsos.filter((pulso) => this.segundos - pulso.nascimento < duracao);
    for (const pulso of this.pulsos) {
      const avanco = (this.segundos - pulso.nascimento) / duracao;
      contexto.strokeStyle = pulso.cor;
      contexto.globalAlpha = (1 - avanco) * 0.75;
      contexto.lineWidth = 2;
      contexto.beginPath();
      contexto.arc(
        this.camera.paraTelaX(pulso.x),
        this.camera.paraTelaY(pulso.y),
        8 + avanco * 28,
        0,
        Math.PI * 2
      );
      contexto.stroke();
      contexto.globalAlpha = 1;
    }
  }
}
