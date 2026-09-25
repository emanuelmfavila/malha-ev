'use client';

import { Estatisticas } from '@/nucleo/estatisticas';
import { Malha } from '@/nucleo/malha';
import { Planejador } from '@/nucleo/planejador';
import { Simulacao } from '@/nucleo/simulacao';
import type { Carro } from '@/nucleo/tipos';
import { formatar, formatarRelogio, limitar } from '@/nucleo/utilidades';
import { duracao } from '@/estado/loja';
import { corDaBateria, corDaSituacao } from '@/mapa/cores';
import { CORES_DO_DIARIO, usarLoja } from '@/estado/loja';
import { SeletorDeRota, TextoDoMotor } from './ui/Controles';
import estilos from '@/estilos/painel.module.css';

/* Só existem duas formas de a viagem não terminar: o grafo não liga os dois nós,
   ou a bateria acabou na estrada. Um carro nunca se recusa a sair. */
export function motivoLegivel(carro: Carro): string {
  return carro.motivoDaFalha === 'rota' ? 'sem caminho' : 'parou sem bateria';
}

/** Como a linha da frota descreve o carro: parado num nó ou indo para algum. */
export function descreverTrecho(carro: Carro): string {
  if (Simulacao.estaSemViagem(carro)) return `parado em ${Malha.nos[carro.noAtual].nome}`;
  const desvio =
    carro.noDeRecargaPlanejado !== null ? ` via ${Malha.nos[carro.noDeRecargaPlanejado].nome}` : '';
  return `${Malha.nos[carro.noDeOrigem].nome} → ${Malha.nos[carro.noDestinoFinal].nome}${desvio}`;
}

/** Barra grande da bateria, com a marca da reserva no lugar certo. É o número
    que mais precisa ser enxergado, então vem antes de qualquer texto. */
function Medidor({ carro }: { carro: Carro }) {
  const cheia = Simulacao.configuracao.bateriaCheia;
  const percentual = (carro.bateria / cheia) * 100;
  const cor = corDaBateria(carro.bateria / cheia);
  const reserva = limitar((Simulacao.configuracao.reserva / cheia) * 100, 0, 100);
  return (
    <div className={estilos.medidor}>
      <div className={estilos.topoDoMedidor}>
        <span>bateria agora</span>
        <b style={{ color: cor }}>{formatar(carro.bateria, 1)}</b>
      </div>
      <div className={estilos.trilho}>
        <i style={{ width: `${percentual}%`, background: cor }} />
        <u className={estilos.marcaDaReserva} style={{ left: `${reserva}%` }} />
      </div>
      <div className={estilos.rodapeDoMedidor}>
        <span>0</span>
        <span>reserva {formatar(Simulacao.configuracao.reserva, 0)}</span>
        <span>{cheia}</span>
      </div>
    </div>
  );
}

/** Conferência que fecha: o que saiu, o que entrou e o que sobrou. A mesma
    conta é uma invariante testada no núcleo. */
function Balanco({ carro }: { carro: Carro }) {
  return (
    <div className={estilos.balanco}>
      <div>
        <span>saiu com</span>
        <b>{formatar(carro.bateriaInicial, 0)}</b>
      </div>
      <div className={estilos.linhaDeGanho}>
        <span>recarregou ({carro.recargasFeitas}x)</span>
        <b>+ {formatar(carro.bateriaRecebida, 1)}</b>
      </div>
      <div className={estilos.linhaDeGasto}>
        <span>gastou rodando</span>
        <b>− {formatar(carro.bateriaGasta, 1)}</b>
      </div>
      <div className={estilos.linhaTotal}>
        <span>bateria agora</span>
        <b>{formatar(carro.bateria, 1)}</b>
      </div>
    </div>
  );
}

/* A rota deste carro, e só dele. Cada carro tem a sua: mudar aqui não mexe em
   nenhum outro. O clique no mapa vale na hora, e o motor decide o que fazer
   conforme a situação, de sair da fila a terminar a aresta atual antes. */
function RotaDoCarro({ carro }: { carro: Carro }) {
  const campoAtivo = usarLoja((estado) => estado.campoAtivo);
  const definirCampoAtivo = usarLoja((estado) => estado.definirCampoAtivo);
  const origemEditavel = Simulacao.podeMudarOrigem(carro);
  const semViagem = Simulacao.estaSemViagem(carro);
  const parado = carro.situacao === 'chegou' || carro.situacao === 'falhou';

  return (
    <div className={estilos.rotaDoCarro}>
      <div className={estilos.tituloDaNovaViagem}>
        Rota de <b>{carro.nome}</b>
      </div>
      <SeletorDeRota
        origem={Malha.nos[semViagem ? carro.noAtual : carro.noDeOrigem].nome}
        destino={semViagem ? null : Malha.nos[carro.noDestinoFinal].nome}
        campoAtivo={campoAtivo}
        aoEscolherCampo={definirCampoAtivo}
        origemEditavel={origemEditavel}
        legenda={
          <>
            Clique num nó do mapa para trocar {campoAtivo === 'origem' ? 'a origem' : 'o destino'}
            {parado ? ', e ele sai numa viagem nova sem perder bateria nem histórico' : ''}.
            {!origemEditavel ? ' A origem está travada porque o carro já pegou a estrada.' : ''}
          </>
        }
      />
    </div>
  );
}

function NarrativaDoCarro({ carro }: { carro: Carro }) {
  const cor = corDaSituacao(carro.situacao);
  const destino = Malha.nos[carro.noDestinoFinal].nome;
  let corpo: React.ReactNode = null;

  if (carro.situacao === 'em rota' && carro.arestaAtual) {
    const de = Malha.nos[carro.caminho[carro.indiceNoCaminho]].nome;
    const para = Malha.nos[carro.caminho[carro.indiceNoCaminho + 1]].nome;
    const falta = carro.arestaAtual.peso - carro.progressoNaAresta;
    const restante =
      Planejador.pesoDoCaminho(carro.caminho.slice(carro.indiceNoCaminho)) - carro.progressoNaAresta;
    corpo = (
      <>
        <p>
          Está na aresta <b>{de} → {para}</b>, de peso <b>{carro.arestaAtual.peso}</b>. Já andou{' '}
          <b>{formatar(carro.progressoNaAresta, 1)}</b> dela, faltam <b>{duracao(falta, 1)}</b> para
          chegar em {para}.
        </p>
        <div className={estilos.conta}>
          falta neste plano&nbsp; <b>{formatar(restante, 1)}</b>
          <br />
          sobra ao chegar&nbsp;&nbsp; <b>{formatar(carro.bateria - restante, 1)}</b>
        </div>
        {carro.noDeRecargaPlanejado !== null ? (
          <p>
            Este plano termina no posto <b>{Malha.nos[carro.noDeRecargaPlanejado].nome}</b>: o caminho
            direto até {destino} não cabia na bateria.
          </p>
        ) : (
          <p>
            Este plano vai direto até <b>{destino}</b>, sem parada.
          </p>
        )}
      </>
    );
  } else if (carro.situacao === 'na fila') {
    const posto = Malha.nos[carro.noAtual].posto;
    const lugar = posto ? posto.fila.indexOf(carro.numero) + 1 : 0;
    corpo = (
      <>
        <p>
          Parado na fila do posto <b>{Malha.nos[carro.noAtual].nome}</b>, na <b>{lugar}ª</b> posição. A
          {posto && posto.vagas > 1
            ? `${posto.vagasOcupadas.filter(Boolean).length} de ${posto.vagas} vagas estão ocupadas`
            : `vaga está ${posto?.vagasOcupadas[0] ? 'ocupada' : 'livre'}`}.
        </p>
        <p>
          Já esperou <b>{duracao(Simulacao.hora - carro.horaDeEntradaNaFila, 1)}</b>.
        </p>
      </>
    );
  } else if (carro.situacao === 'recarregando') {
    const vaga = Malha.nos[carro.noAtual].posto?.vagasOcupadas.find(
      (v) => v && v.numeroDoCarro === carro.numero
    );
    corpo = (
      <>
        <p>
          Recarregando em <b>{Malha.nos[carro.noAtual].nome}</b>, faltam{' '}
          <b>{duracao(Math.max(vaga?.horasRestantes ?? 0, 0), 1)}</b> para a bateria voltar aos{' '}
          <b>{Simulacao.configuracao.bateriaCheia}</b>.
        </p>
        <p>
          Ao terminar, replaneja o trecho seguinte rumo a <b>{destino}</b>.
        </p>
      </>
    );
  } else if (carro.situacao === 'chegou') {
    corpo = (
      <>
        <p>
          Chegou em <b>{Malha.nos[carro.noAtual].nome}</b> em{' '}
          <b>{duracao(carro.horaDeChegada! - carro.horaDePartida)}</b>, percorrendo peso{' '}
          <b>{formatar(carro.pesoPercorrido - carro.inicioDaViagem.pesoPercorrido, 0)}</b> nesta viagem,
          com <b>{duracao(carro.horasEmFila - carro.inicioDaViagem.horasEmFila)}</b> de fila.
        </p>
        <p>
          Está <b>parado</b> ali, e continua na malha. Escolha um destino novo e ele sai de{' '}
          <b>{Malha.nos[carro.noAtual].nome}</b> guardando bateria e histórico.
        </p>
      </>
    );
  } else if (carro.motivoDaFalha === 'rota') {
    corpo = (
      <p>
        Não existe caminho no grafo entre {Malha.nos[carro.noDeOrigem].nome} e {destino}.
      </p>
    );
  } else {
    corpo = (
      <p>
        A bateria zerou no meio da estrada, entre{' '}
        <b>{Malha.nos[carro.caminho[carro.indiceNoCaminho]]?.nome ?? '?'}</b> e{' '}
        <b>{Malha.nos[carro.caminho[carro.indiceNoCaminho + 1]]?.nome ?? '?'}</b>. O carro parou
        exatamente onde estava e fica ali no mapa.
      </p>
    );
  }

  return (
    <div className={estilos.narrativa}>
      <div className={estilos.cabeca}>
        <strong style={{ color: cor }}>{carro.nome}</strong>
        <span className={estilos.selo} style={{ color: cor }}>
          {carro.situacao === 'falhou' ? motivoLegivel(carro) : carro.situacao}
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--texto-fraco)' }}>
          {Malha.nos[carro.noDeOrigem].nome} → {destino}
        </span>
      </div>
      <Medidor carro={carro} />
      <Balanco carro={carro} />
      {carro.viagensConcluidas + carro.viagensFalhadas > 0 ? (
        <p style={{ fontSize: 11, color: 'var(--texto-fraco)' }}>
          Este carro já fechou <b>{carro.viagensConcluidas}</b>{' '}
          {carro.viagensConcluidas === 1 ? 'viagem' : 'viagens'} e falhou em{' '}
          <b>{carro.viagensFalhadas}</b>.
        </p>
      ) : null}
      {corpo}
      <RotaDoCarro carro={carro} />
      <div className={estilos.dica}>
        Clique no carro de novo, ou num ponto vazio do mapa, para voltar à visão geral.
      </div>
    </div>
  );
}

function NarrativaGeral() {
  const postos = Malha.nosComPosto();
  const maisCheio = postos
    .slice()
    .sort(
      (a, b) =>
        b.posto!.fila.length - a.posto!.fila.length ||
        Simulacao.utilizacaoDoPosto(b) - Simulacao.utilizacaoDoPosto(a)
    )[0];

  return (
    <div className={estilos.narrativa}>
      <p>
        O relógio marca <b>{formatarRelogio(Simulacao.hora)}</b>. Agora há{' '}
        <b>{Simulacao.contarPorSituacao('em rota')}</b> carros em rota,{' '}
        <b>{Simulacao.totalNaFila()}</b> na fila e <b>{Simulacao.totalRecarregando()}</b> recarregando.
      </p>
      {maisCheio ? (
        <p>
          Posto mais disputado: <b>{maisCheio.nome}</b>, fila de <b>{maisCheio.posto!.fila.length}</b> e
          vaga ocupada <b>{formatar(Simulacao.utilizacaoDoPosto(maisCheio), 0)}%</b> do tempo.
        </p>
      ) : (
        <p>
          Nenhum posto configurado: qualquer viagem que custe mais que a bateria vai ser recusada na
          largada.
        </p>
      )}
      {Estatisticas.viagensEncerradas ? (
        <p>
          <b>{Estatisticas.viagensConcluidas}</b> viagens terminaram bem e{' '}
          <b>{Estatisticas.totalDeFalhas}</b> não terminaram (
          {formatar((Estatisticas.totalDeFalhas / Estatisticas.viagensEncerradas) * 100, 0)}%), sendo{' '}
          {Estatisticas.falhasPorPane} paradas na estrada por falta de bateria e{' '}
          {Estatisticas.falhasPorRota} sem caminho no grafo.
        </p>
      ) : (
        <p>
          Nenhuma viagem terminou ainda. Escolha origem e destino no mapa e clique em{' '}
          <b>Colocar carro</b>.
        </p>
      )}
      <div className={estilos.dica}>
        Clique num carro, no mapa ou na lista da frota, para ver as contas que ele fez a cada decisão.
      </div>
    </div>
  );
}

export function Acompanhamento() {
  const selecionado = usarLoja((estado) => estado.carroSelecionado);
  usarLoja((estado) => estado.tique);
  const carro = selecionado === null ? undefined : Simulacao.carrosPorNumero.get(selecionado);

  return (
    <>
      {carro ? <NarrativaDoCarro carro={carro} /> : <NarrativaGeral />}
      {carro ? (
        <div className={estilos.diario}>
          {carro.diario
            .slice()
            .reverse()
            .map((entrada, indice) => (
              <div key={`${entrada.hora}-${indice}`} className={estilos.entradaDoDiario}>
                <div
                  className={estilos.ponto}
                  style={{ background: CORES_DO_DIARIO[entrada.tipo] ?? 'var(--gelo)' }}
                />
                <div className={estilos.textoDoDiario}>
                  <em>{formatarRelogio(entrada.hora)}</em>
                  <TextoDoMotor html={entrada.texto} />
                </div>
              </div>
            ))}
        </div>
      ) : null}
    </>
  );
}
