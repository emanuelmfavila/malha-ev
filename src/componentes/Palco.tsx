'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import { Malha } from '@/nucleo/malha';
import { Simulacao } from '@/nucleo/simulacao';
import { Estatisticas } from '@/nucleo/estatisticas';
import { PESO_MAXIMO, PESO_MINIMO } from '@/nucleo/constantes';
import { Cenarios, type Cenario } from '@/nucleo/cenarios';
import { formatar, formatarDuracao } from '@/nucleo/utilidades';
import { CORES } from '@/mapa/cores';
import type { Aresta } from '@/nucleo/tipos';
import type { Alvo } from '@/mapa/vista';
import { avancarSimulacao, ligarEventosDaVista } from '@/estado/laco';
import { usarLoja, vista } from '@/estado/loja';
import estilos from '@/estilos/painel.module.css';

interface Balao {
  x: number;
  y: number;
  titulo: string;
  linhas: [string, string][];
}

/* Editor do peso da aresta. Como o peso é ao mesmo tempo o tempo de viagem e o
   gasto de bateria, mudar este número muda as duas coisas de uma vez, e é o que
   a legenda embaixo lembra. */
const EditorDePeso = forwardRef<
  HTMLDivElement,
  { aresta: Aresta; cenario: Cenario; aoMudar: (peso: number) => void; aoFechar: () => void }
>(function EditorDePeso({ aresta, cenario, aoMudar, aoFechar }, ref) {
  return (
    <div ref={ref} className={estilos.editorDeAresta}>
      <div className={estilos.tituloDoEditor}>
        <b>
          {Malha.nos[aresta.de].nome} – {Malha.nos[aresta.para].nome}
        </b>
        <button type="button" onClick={aoFechar} title="Fechar">×</button>
      </div>
      <div className={estilos.controleDoPeso}>
        <button
          type="button"
          onClick={() => aoMudar(aresta.peso - 1)}
          disabled={aresta.peso <= PESO_MINIMO}
        >
          −
        </button>
        <input
          type="number"
          min={PESO_MINIMO}
          max={PESO_MAXIMO}
          value={aresta.peso}
          onChange={(evento) => aoMudar(Number(evento.target.value))}
        />
        <button
          type="button"
          onClick={() => aoMudar(aresta.peso + 1)}
          disabled={aresta.peso >= PESO_MAXIMO}
        >
          +
        </button>
      </div>
      <div className={estilos.notaDoEditor}>
        {formatarDuracao(aresta.peso, cenario.minutosPorUnidade)} de viagem e {aresta.peso} de bateria
      </div>
    </div>
  );
});

function descreverAlvo(alvo: Exclude<Alvo, null>, cenario: Cenario): { titulo: string; linhas: [string, string][] } {
  const escala = cenario.minutosPorUnidade;
  if (alvo.tipo === 'carro') {
    const carro = alvo.carro;
    return {
      titulo: carro.nome,
      linhas: [
        ['situação', carro.situacao],
        ['bateria agora', `${formatar(carro.bateria, 1)} / ${Simulacao.configuracao.bateriaCheia}`],
        ['saiu com', formatar(carro.bateriaInicial, 0)],
        ['já gastou', `− ${formatar(carro.bateriaGasta, 1)}`],
        ['já recarregou', `+ ${formatar(carro.bateriaRecebida, 1)}`],
        ['recargas', String(carro.recargasFeitas)],
        ['destino', cenario.nomeCompleto(Malha.nos[carro.noDestinoFinal])],
      ],
    };
  }
  if (alvo.tipo === 'aresta') {
    const { aresta } = alvo;
    return {
      titulo: escala
        ? `${cenario.nomeCompleto(Malha.nos[aresta.de])} – ${cenario.nomeCompleto(Malha.nos[aresta.para])}`
        : `Aresta ${Malha.nos[aresta.de].nome} – ${Malha.nos[aresta.para].nome}`,
      linhas: [
        ['peso', String(aresta.peso)],
        ['tempo de viagem', formatarDuracao(aresta.peso, escala)],
        ['gasto de bateria', String(aresta.peso)],
        ['clique', 'para mudar o peso'],
      ],
    };
  }

  const no = alvo.no;
  const linhas: [string, string][] = [
    ['arestas', String(Malha.adjacencia[no.indice].length)],
    ['pesos', Malha.adjacencia[no.indice].map((l) => l.aresta.peso).join(' ')],
  ];
  if (no.posto) {
    const ocupadas = no.posto.vagasOcupadas.filter(Boolean).length;
    linhas.push([
      no.posto.vagas === 1 ? 'vaga' : 'vagas',
      no.posto.vagas === 1 ? (ocupadas ? 'ocupada' : 'livre') : `${ocupadas} de ${no.posto.vagas} ocupadas`,
    ]);
    linhas.push(['fila agora', String(no.posto.fila.length)]);
    linhas.push(['recargas feitas', String(no.posto.recargasConcluidas)]);
    linhas.push(['utilização', `${formatar(Simulacao.utilizacaoDoPosto(no), 0)}%`]);
  } else {
    linhas.push(['posto', 'não']);
  }
  return { titulo: cenario.nomeCompleto(no), linhas };
}

export function Palco() {
  const telaRef = useRef<HTMLCanvasElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const arrastoRef = useRef<{ x: number; y: number; moveu: boolean } | null>(null);
  const [balao, definirBalao] = useState<Balao | null>(null);

  const bater = usarLoja((estado) => estado.bater);
  const escolherNo = usarLoja((estado) => estado.escolherNo);
  const selecionarCarro = usarLoja((estado) => estado.selecionarCarro);
  const selecionarAresta = usarLoja((estado) => estado.selecionarAresta);
  const definirPesoDaAresta = usarLoja((estado) => estado.definirPesoDaAresta);
  const arestaSelecionada = usarLoja((estado) => estado.arestaSelecionada);
  const carroSelecionado = usarLoja((estado) => estado.carroSelecionado);
  const campoAtivo = usarLoja((estado) => estado.campoAtivo);
  const comparacao = usarLoja((estado) => estado.comparacao);
  const cenario = Cenarios.porId[usarLoja((estado) => estado.cenario)];
  usarLoja((estado) => estado.tique); // re-renderiza as etiquetas no ritmo do motor

  /* Um laço de animação só, dono do tempo e do desenho. Ele avança o motor e
     pinta o canvas a 60 quadros por segundo, mas só acorda o React quatro vezes
     por segundo, que é o suficiente para os painéis e o que mantém a interface
     leve com centenas de carros em campo. */
  useEffect(() => {
    ligarEventosDaVista();
    const tela = telaRef.current;
    const contexto = tela?.getContext('2d');
    if (!tela || !contexto) return;

    const ajustarTamanho = () => {
      const area = tela.parentElement!.getBoundingClientRect();
      const densidade = window.devicePixelRatio || 1;
      tela.width = area.width * densidade;
      tela.height = area.height * densidade;
      contexto.setTransform(densidade, 0, 0, densidade, 0, 0);
      vista.camera.redimensionar(area.width, area.height);
    };
    ajustarTamanho();
    const observador = new ResizeObserver(ajustarTamanho);
    observador.observe(tela.parentElement!);

    let anterior = performance.now();
    let acumulador = 0;
    let pedido = requestAnimationFrame(function quadro(instante: number) {
      const segundos = Math.min((instante - anterior) / 1000, 0.1);
      anterior = instante;
      avancarSimulacao(segundos);
      if (Simulacao.emExecucao) {
        acumulador += segundos;
        if (acumulador > 0.25) {
          acumulador = 0;
          bater();
        }
      }
      vista.desenhar(contexto, segundos);

      /* O editor de peso é HTML, mas precisa ficar grudado no meio da aresta
         mesmo enquanto o mapa é arrastado. Reposicionar aqui, direto no DOM,
         evita disparar estado do React sessenta vezes por segundo. */
      const editor = editorRef.current;
      const aresta = vista.arestaSelecionada;
      if (editor && aresta) {
        const de = Malha.nos[aresta.de];
        const para = Malha.nos[aresta.para];
        editor.style.left = `${(vista.camera.paraTelaX(de.x) + vista.camera.paraTelaX(para.x)) / 2}px`;
        editor.style.top = `${(vista.camera.paraTelaY(de.y) + vista.camera.paraTelaY(para.y)) / 2 + 18}px`;
      }
      pedido = requestAnimationFrame(quadro);
    });

    return () => {
      cancelAnimationFrame(pedido);
      observador.disconnect();
    };
  }, [bater]);

  const coordenadas = (evento: React.MouseEvent) => {
    const area = telaRef.current!.getBoundingClientRect();
    return { x: evento.clientX - area.left, y: evento.clientY - area.top };
  };

  const etiquetas: [string, number][] = [
    ['Em rota', Simulacao.contarPorSituacao('em rota')],
    ['Na fila', Simulacao.totalNaFila()],
    ['Recarregando', Simulacao.totalRecarregando()],
    ['Chegaram', Estatisticas.viagensConcluidas],
    ['Falharam', Estatisticas.totalDeFalhas],
  ];

  return (
    <main className={estilos.palco}>
      <canvas
        ref={telaRef}
        className={estilos.telaDoMapa}
        onMouseDown={(evento) => {
          arrastoRef.current = { x: evento.clientX, y: evento.clientY, moveu: false };
        }}
        onMouseUp={() => {
          arrastoRef.current = null;
        }}
        onMouseLeave={() => {
          vista.alvoSobOMouse = null;
          definirBalao(null);
        }}
        onWheel={(evento) => {
          const { x, y } = coordenadas(evento);
          vista.camera.aplicarZoom(evento.deltaY < 0 ? 1.14 : 1 / 1.14, x, y);
        }}
        onMouseMove={(evento) => {
          const arrasto = arrastoRef.current;
          if (arrasto && evento.buttons & 1) {
            vista.camera.arrastar(evento.clientX - arrasto.x, evento.clientY - arrasto.y);
            arrasto.x = evento.clientX;
            arrasto.y = evento.clientY;
            arrasto.moveu = true;
            definirBalao(null);
            return;
          }
          const { x, y } = coordenadas(evento);
          const alvo = vista.alvoEm(x, y);
          vista.alvoSobOMouse = alvo;
          definirBalao(alvo ? { x, y, ...descreverAlvo(alvo, cenario) } : null);
        }}
        onClick={() => {
          if (arrastoRef.current?.moveu) {
            arrastoRef.current = null;
            return; // foi um arraste, não um clique
          }
          const alvo = vista.alvoSobOMouse;
          if (!alvo) {
            selecionarAresta(null);
            return selecionarCarro(null);
          }
          if (alvo.tipo === 'carro') selecionarCarro(alvo.carro.numero);
          else if (alvo.tipo === 'aresta') selecionarAresta(alvo.aresta.indice);
          else escolherNo(alvo.no.indice);
        }}
      />

      <div className={estilos.etiquetas}>
        {etiquetas.map(([rotulo, valor]) => (
          <div key={rotulo} className={estilos.etiqueta}>
            {rotulo}
            <b>{valor}</b>
          </div>
        ))}
      </div>

      <div className={estilos.controlesDoMapa}>
        <button className={estilos.botao} title="Aproximar" onClick={() => vista.camera.aplicarZoom(1.3)}>+</button>
        <button className={estilos.botao} title="Afastar" onClick={() => vista.camera.aplicarZoom(1 / 1.3)}>−</button>
        <button className={estilos.botao} title="Enquadrar a malha" onClick={() => vista.camera.enquadrar()}>⤢</button>
      </div>

      {comparacao && vista.busca ? (
        <div className={estilos.faixaDeBusca}>
          {comparacao.linhas.map((linha) => (
            <span key={linha.id}>
              <i style={{ background: linha.cor }} />
              {linha.nome} <b>{linha.nosExpandidos}</b> nós
            </span>
          ))}
          <span>
            {comparacao.origem} → {comparacao.destino}
          </span>
        </div>
      ) : null}

      <div className={estilos.legenda}>
        <span><i style={{ background: CORES.gelo }} />em rota</span>
        <span><i style={{ background: CORES.ambar }} />fila ou recarga</span>
        <span><i style={{ background: CORES.menta }} />chegou</span>
        <span><i style={{ background: CORES.ameixa }} />sem bateria</span>
        <span><i style={{ background: '#6d7f93', borderRadius: 2 }} />nó</span>
        <span><i style={{ background: CORES.ambar, borderRadius: 2 }} />posto</span>
      </div>

      <div className={estilos.instrucao}>
        {carroSelecionado !== null ? (
          <>
            Seguindo <b>{Simulacao.carrosPorNumero.get(carroSelecionado)?.nome}</b>: clicar num nó troca{' '}
            <b>{campoAtivo === 'origem' ? 'a origem' : 'o destino'}</b> dele.
            <br />
            Clique nele de novo, ou num ponto vazio, para soltar.
          </>
        ) : (
          <>
            Clique num nó para a <b>origem</b>, noutro para o <b>destino</b>, depois <b>Colocar carro</b>.
            <br />
            Clique numa <b>aresta</b> para mudar o peso, num <b>carro</b> para editar a rota dele.
          </>
        )}
        <br />
        Roda do mouse aproxima, arrastar move.
        <br />
        <b>Espaço</b> inicia ou pausa, <b>N</b> avança {cenario.minutosPorUnidade ? '1 unidade' : '1 h'}, <b>C</b> compara, <b>F</b> enquadra.
      </div>

      {arestaSelecionada !== null && Malha.arestas[arestaSelecionada] ? (
        <EditorDePeso
          ref={editorRef}
          aresta={Malha.arestas[arestaSelecionada]}
          cenario={cenario}
          aoMudar={(peso) => definirPesoDaAresta(arestaSelecionada, peso)}
          aoFechar={() => selecionarAresta(null)}
        />
      ) : null}

      {balao ? (
        <div
          className={estilos.balao}
          style={{
            left: Math.min(balao.x + 18, vista.camera.larguraCss - 210),
            top: Math.min(balao.y + 18, vista.camera.alturaCss - 190),
          }}
        >
          <h4>{balao.titulo}</h4>
          {balao.linhas.map(([rotulo, valor]) => (
            <div key={rotulo}>
              <span>{rotulo}</span>
              <b>{valor}</b>
            </div>
          ))}
        </div>
      ) : null}
    </main>
  );
}
