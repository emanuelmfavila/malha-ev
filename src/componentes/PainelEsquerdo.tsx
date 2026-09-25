'use client';

import { Cenarios } from '@/nucleo/cenarios';
import { Malha } from '@/nucleo/malha';
import { Simulacao } from '@/nucleo/simulacao';
import { formatar, formatarDuracao } from '@/nucleo/utilidades';
import { usarLoja } from '@/estado/loja';
import { Alternador, Bloco, Botao, Deslizante, SeletorDeRota } from './ui/Controles';
import estilos from '@/estilos/painel.module.css';

export function PainelEsquerdo() {
  const loja = usarLoja();
  usarLoja((estado) => estado.tique);
  const { par, exibicao, comparacao } = loja;
  const cenario = Cenarios.porId[loja.cenario];
  const consumo = loja.consumoPorHora;
  const tempo = formatarDuracao;
  const autonomia = (pontos: number) => tempo(pontos / consumo);

  return (
    <aside className={`${estilos.coluna} ${estilos.esquerda}`}>
      <Bloco titulo="Cenário">
        <div className={estilos.campo}>
          <label><span>Que malha simular</span></label>
          <select
            className={estilos.seletor}
            value={loja.cenario}
            onChange={(evento) => loja.escolherCenario(evento.target.value)}
          >
            {Cenarios.lista.map((item) => (
              <option key={item.id} value={item.id}>{item.nome}</option>
            ))}
          </select>
        </div>
        <p className={estilos.ajuda}>{cenario.resumo}</p>
        <Botao largura="larga" aoClicar={() => loja.abrirRegras(true)}>⚙ Regras da simulação</Botao>
        <p className={estilos.ajuda} style={{ margin: '8px 0 0' }}>
          Bateria <b>{loja.bateriaCheia}</b> a <b>{consumo}/h</b> = <b>{autonomia(loja.bateriaCheia)}</b> de
          autonomia · postos com <b>{loja.vagasPorPosto} {loja.vagasPorPosto === 1 ? 'vaga' : 'vagas'}</b> e recarga
          de <b>{tempo(loja.horasDeRecarga)}</b> · reserva <b>{loja.reserva}</b> · {loja.chegadasAutomaticas
            ? <>{loja.chegadasPorDia} viagens/dia sozinho</>
            : 'sem viagens automáticas'} · <b>{loja.horasPorSegundo} h/s</b>.
        </p>
      </Bloco>

      <Bloco titulo="Carros novos" nota={`${Simulacao.carros.length} na malha`}>
        <p className={estilos.ajuda}>
          Esta rota vale só para os carros que você criar aqui. Para mudar a rota de um carro que já
          está na malha, clique nele e use o painel <b>O que está acontecendo</b>.
        </p>
        <SeletorDeRota
          origem={par.origem === null ? null : Malha.nos[par.origem]?.nome ?? null}
          destino={par.destino === null ? null : Malha.nos[par.destino]?.nome ?? null}
          campoAtivo={loja.carroSelecionado === null ? loja.campoAtivo : 'destino'}
          aoEscolherCampo={loja.definirCampoAtivo}
          legenda={
            loja.carroSelecionado === null
              ? 'Clique numa ficha para escolher qual ponta o próximo clique no mapa preenche.'
              : 'Um carro está selecionado: os cliques no mapa estão indo para a rota dele.'
          }
        />
        <Deslizante
          rotulo="Bateria ao sair"
          valor={Math.min(loja.bateriaInicial, loja.bateriaCheia)}
          minimo={5}
          maximo={loja.bateriaCheia}
          passo={5}
          sufixo={` = ${autonomia(loja.bateriaInicial)}`}
          aoMudar={(valor) => loja.definirCampo('bateriaInicial', valor)}
        />
        <Deslizante
          rotulo="Quantos carros de uma vez"
          valor={loja.quantidadeDeCarros}
          minimo={1}
          maximo={20}
          aoMudar={(valor) => loja.definirCampo('quantidadeDeCarros', valor)}
        />
        <div className={estilos.grupoDeBotoes}>
          <span style={{ flex: 1 }}>
            <Botao variacao="destaque" largura="larga" aoClicar={loja.colocarCarro}>
              {loja.quantidadeDeCarros === 1 ? 'Colocar carro' : `Colocar ${loja.quantidadeDeCarros} carros`}
            </Botao>
          </span>
          <Botao aoClicar={loja.carrosAleatorios}>+5 aleatórios</Botao>
        </div>
        <p className={estilos.ajuda} style={{ margin: '10px 0 0' }}>
          Pode continuar clicando: cada clique põe mais carros na mesma rota.
        </p>
      </Bloco>

      <Bloco titulo="Malha viária" nota={`${Malha.nos.length} nós, ${Malha.arestas.length} arestas`}>
        {cenario.aleatoria ? (
          <>
            <p className={estilos.ajuda}>
              Cada aresta tem um <b>peso</b> só: o tempo de viagem em horas. A bateria cai{' '}
              <b>{consumo} {consumo === 1 ? 'ponto' : 'pontos'} por hora</b>, então peso 5 quer dizer{' '}
              <b>5 horas</b> de viagem e <b>{5 * consumo} pontos</b> de bateria. Clique numa aresta para editar.
            </p>
            <Deslizante
              rotulo="Nós"
              valor={loja.quantidadeDeNos}
              minimo={6}
              maximo={60}
              aoMudar={(valor) => loja.definirCampo('quantidadeDeNos', valor)}
            />
            <Deslizante
              rotulo="Rotas extras além do mínimo"
              valor={loja.rotasExtras}
              minimo={0}
              maximo={60}
              aoMudar={(valor) => loja.definirCampo('rotasExtras', valor)}
            />
            <div className={estilos.campo}>
              <label>
                <span>Desenho da malha</span>
                <var>o mesmo número repete o mesmo mapa</var>
              </label>
              <div className={estilos.grupoDeBotoes}>
                <input
                  className={estilos.entrada}
                  type="number"
                  value={loja.semente}
                  onChange={(evento) => loja.definirCampo('semente', Number(evento.target.value))}
                  style={{ flex: 1 }}
                />
                <Botao aoClicar={loja.sortearSemente}>🎲</Botao>
              </div>
            </div>
            <Botao largura="larga" aoClicar={loja.gerarMalha}>Gerar malha</Botao>
          </>
        ) : (
          <>
            <p className={estilos.ajuda}>
              Cada rodovia tem um <b>peso</b> só: o tempo de viagem em horas. A bateria cai{' '}
              <b>{consumo} pontos por hora</b>, então uma rodovia de <b>1 h 20</b> gasta{' '}
              <b>{formatar((80 / 60) * consumo, 0)} pontos</b>; com {loja.bateriaCheia} pontos a autonomia é{' '}
              <b>{autonomia(loja.bateriaCheia)}</b>. Passe o mouse numa rodovia para ver tempo e gasto; clique
              para editar o tempo, de 5 em 5 min.
            </p>
            <p className={estilos.ajuda}>
              As cidades estão nas posições reais (latitude e longitude na mesma proporção; veja a barra de km
              no mapa). Os tempos de estrada são aproximados e estão em <code>src/nucleo/regiaoSudeste.ts</code>.
            </p>
            <Botao largura="larga" aoClicar={loja.gerarMalha}>Recarregar a região</Botao>
          </>
        )}
      </Bloco>

      <Bloco titulo="Postos de recarga" nota={`${Malha.nosComPosto().length} ativos`}>
        <p className={estilos.ajuda}>
          Todo posto é igual: <b>{loja.vagasPorPosto} {loja.vagasPorPosto === 1 ? 'vaga' : 'vagas'}</b>, quem chega
          espera na fila, a recarga leva <b>{tempo(loja.horasDeRecarga)}</b> e sempre devolve a bateria{' '}
          <b>cheia</b>. Quantidade, vagas, tempo e a parada oportunista ficam nas regras.
        </p>
        <Deslizante
          rotulo="Quantos nós têm posto"
          valor={loja.quantidadeDePostos}
          minimo={0}
          maximo={Math.max(Malha.nos.length, 1)}
          aoMudar={(valor) => loja.definirCampo('quantidadeDePostos', valor)}
        />
        <Botao largura="larga" aoClicar={() => loja.abrirRegras(true)}>⚙ Ajustar nas regras</Botao>
      </Bloco>

      <Bloco titulo="Comparar buscas" nota="Dijkstra × A*">
        <p className={estilos.ajuda}>
          Roda os dois algoritmos entre a origem e o destino escolhidos e acende no mapa cada nó que
          cada um precisou abrir.
        </p>
        <Botao largura="larga" aoClicar={loja.compararAlgoritmos}>Mostrar a busca no mapa</Botao>
        {comparacao ? (
          <>
            <div className={estilos.comparacao}>
              <span className={estilos.tituloDaColuna}>algoritmo</span>
              <span className={estilos.tituloDaColuna}>nós abertos</span>
              <span className={estilos.tituloDaColuna}>custo</span>
              {comparacao.linhas.map((linha) => (
                <span key={linha.id} style={{ display: 'contents' }}>
                  <span className={estilos.nomeDoAlgoritmo}>
                    <i style={{ background: linha.cor }} />
                    {linha.nome}
                  </span>
                  <b>{linha.nosExpandidos}</b>
                  <b>{tempo(linha.custo)}</b>
                </span>
              ))}
            </div>
            <div className={estilos.ganho}>
              {comparacao.mesmoCusto ? (
                <>
                  Mesmo caminho ótimo nos dois, <b>{tempo(comparacao.linhas[0].custo)}</b> em{' '}
                  {comparacao.linhas[0].arestas} arestas, ou seja{' '}
                  <b>{formatar(comparacao.linhas[0].custo * consumo, 0)}</b> de bateria.
                </>
              ) : (
                'Os custos divergiram, sinal de estimativa não admissível.'
              )}{' '}
              O A* chegou lá abrindo <b>{formatar(comparacao.economia, 0)}%</b> menos nós, de{' '}
              {comparacao.maior} para {comparacao.menor}.
            </div>
          </>
        ) : null}
      </Bloco>

      <Bloco titulo="Exibição">
        <Alternador rotulo="Peso das arestas" marcado={exibicao.pesos} aoMudar={(v) => loja.definirExibicao('pesos', v)} />
        <Alternador rotulo="Rotas planejadas" marcado={exibicao.rotas} aoMudar={(v) => loja.definirExibicao('rotas', v)} />
        <Alternador rotulo="Nomes dos nós" marcado={exibicao.nomes} aoMudar={(v) => loja.definirExibicao('nomes', v)} />
        <Alternador rotulo="Fluxo de tráfego" marcado={exibicao.transito} aoMudar={(v) => loja.definirExibicao('transito', v)} />
      </Bloco>
    </aside>
  );
}
