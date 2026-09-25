'use client';

import { AlgoritmosDeBusca } from '@/nucleo/algoritmos';
import { CriteriosDeCusto } from '@/nucleo/criterios';
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
  const escala = cenario.minutosPorUnidade;
  const tempo = (unidades: number) => formatarDuracao(unidades, escala);

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
        <p className={estilos.ajuda} style={{ margin: 0 }}>{cenario.resumo}</p>
      </Bloco>

      <Bloco titulo="Configurações" nota="carro e postos">
        <Deslizante
          rotulo={escala ? `Bateria cheia (${tempo(loja.bateriaCheia)} de autonomia)` : 'Bateria cheia'}
          valor={loja.bateriaCheia}
          minimo={20}
          maximo={300}
          passo={10}
          sufixo=" pontos"
          aoMudar={(valor) => loja.definirCampo('bateriaCheia', valor)}
        />
        <p className={estilos.ajuda}>
          Um ponto de bateria paga um ponto de peso{escala ? `, ou seja ${escala} min de estrada` : ', ou seja 1 h de viagem'}.
          Vale para todo carro; quem já está na malha enche até o novo limite na próxima recarga.
        </p>
        <Deslizante
          rotulo="Vagas por posto"
          valor={loja.vagasPorPosto}
          minimo={1}
          maximo={12}
          aoMudar={(valor) => loja.definirCampo('vagasPorPosto', valor)}
        />
        {escala ? (
          <Deslizante
            rotulo="Tempo de recarga"
            valor={Math.round(loja.horasDeRecarga * escala)}
            minimo={10}
            maximo={180}
            passo={5}
            sufixo=" min"
            aoMudar={(valor) => loja.definirCampo('horasDeRecarga', Math.max(1, Math.round(valor / escala)))}
          />
        ) : (
          <Deslizante
            rotulo="Tempo de recarga"
            valor={loja.horasDeRecarga}
            minimo={1}
            maximo={12}
            sufixo=" h"
            aoMudar={(valor) => loja.definirCampo('horasDeRecarga', valor)}
          />
        )}
        <p className={estilos.ajuda} style={{ margin: 0 }}>
          Vagas e tempo valem para todos os postos e mudam na hora, sem reiniciar.
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
          rotulo={escala ? `Bateria ao sair (${tempo(loja.bateriaInicial)} de autonomia)` : 'Bateria ao sair'}
          valor={Math.min(loja.bateriaInicial, loja.bateriaCheia)}
          minimo={5}
          maximo={loja.bateriaCheia}
          passo={5}
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

      <Bloco titulo="Ritmo da simulação">
        <Deslizante
          rotulo={escala ? 'Velocidade do relógio (unidades por segundo)' : 'Velocidade do relógio'}
          valor={loja.horasPorSegundo}
          minimo={1}
          maximo={escala ? 120 : 48}
          sufixo={escala ? ' un/s' : ' h/s'}
          aoMudar={(valor) => loja.definirCampo('horasPorSegundo', valor)}
        />
        {escala ? (
          <p className={estilos.ajuda}>
            Cada unidade vale <b>{escala} min</b>: a {loja.horasPorSegundo} un/s, um dia real passa em{' '}
            <b>{formatar((24 * 60) / escala / loja.horasPorSegundo, 0)} s</b>.
          </p>
        ) : null}
        <Alternador
          rotulo="Criar viagens sozinho"
          marcado={loja.chegadasAutomaticas}
          aoMudar={(valor) => loja.definirCampo('chegadasAutomaticas', valor)}
        />
        <div style={{ marginTop: 8 }}>
          {escala ? (
            <Deslizante
              rotulo="Viagens novas por dia real"
              valor={Math.round(loja.chegadasPorDia * (24 * 60) / escala / 24)}
              minimo={24}
              maximo={2400}
              passo={24}
              aoMudar={(valor) => loja.definirCampo('chegadasPorDia', valor / ((24 * 60) / escala / 24))}
            />
          ) : (
            <Deslizante
              rotulo="Viagens novas por dia"
              valor={loja.chegadasPorDia}
              minimo={1}
              maximo={60}
              aoMudar={(valor) => loja.definirCampo('chegadasPorDia', valor)}
            />
          )}
        </div>
        {escala && cenario.sortearViagem ? (
          <p className={estilos.ajuda} style={{ margin: '6px 0 0' }}>
            Na região as viagens saem com peso proporcional à raiz da população de cada cidade, e 70% dos
            carros partem com 80 a 100% de bateria.
          </p>
        ) : null}
      </Bloco>

      <Bloco titulo="Malha viária" nota={`${Malha.nos.length} nós, ${Malha.arestas.length} arestas`}>
        {escala ? (
          <>
            <p className={estilos.ajuda}>
              Cada rodovia tem um <b>peso</b> só, em unidades de {escala} min. Peso 22 quer dizer{' '}
              <b>{tempo(22)}</b> de estrada e <b>22 pontos</b> de bateria, de {loja.bateriaCheia} ={' '}
              <b>{tempo(loja.bateriaCheia)}</b> de autonomia. Passe o mouse numa rodovia para ver os minutos;
              clique para editar o peso.
            </p>
            <p className={estilos.ajuda}>
              As cidades estão nas posições reais (latitude e longitude, mesma escala nos dois eixos; veja
              a barra de km no mapa). Os tempos de estrada são aproximados e estão em{' '}
              <code>src/nucleo/regiaoSudeste.ts</code>.
            </p>
            <Botao largura="larga" aoClicar={loja.gerarMalha}>Recarregar a região</Botao>
          </>
        ) : (
          <>
        <p className={estilos.ajuda}>
          Cada aresta tem um <b>peso</b> só. Peso 5 quer dizer <b>5 horas</b> de viagem e{' '}
          <b>5 pontos</b> de bateria. Sempre.
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
        )}
      </Bloco>

      <Bloco titulo="Postos de recarga">
        <p className={estilos.ajuda}>
          Todo posto é igual: <b>{loja.vagasPorPosto} {loja.vagasPorPosto === 1 ? 'vaga' : 'vagas'}</b>,
          quem chega espera na fila, a recarga leva <b>{tempo(loja.horasDeRecarga)}</b> e sempre
          devolve a bateria <b>cheia</b> (ajuste em Configurações). Aqui só a quantidade muda
          {escala ? ', e os postos vão para as cidades mais conectadas' : ''}.
        </p>
        <Deslizante
          rotulo="Quantos nós têm posto"
          valor={loja.quantidadeDePostos}
          minimo={0}
          maximo={Math.max(Malha.nos.length, 1)}
          aoMudar={(valor) => loja.definirCampo('quantidadeDePostos', valor)}
        />
        <Botao largura="larga" aoClicar={() => loja.aplicarPostos(false)}>Aplicar aos postos</Botao>
        <div style={{ marginTop: 13 }}>
          <Deslizante
            rotulo="Parar ao passar num posto com bateria até"
            valor={loja.limiarDeRecarga}
            minimo={0}
            maximo={90}
            passo={5}
            aoMudar={(valor) => loja.definirCampo('limiarDeRecarga', valor)}
          />
        </div>
        <p className={estilos.ajuda} style={{ margin: '0' }}>
          Passou por um posto com a bateria neste nível ou abaixo, o carro para e enche, mesmo que a
          parada não estivesse no plano. Em <b>0</b> a regra desliga e ele só para onde planejou.
        </p>
      </Bloco>

      <Bloco titulo="Roteamento">
        <div className={estilos.campo}>
          <label><span>Algoritmo de menor caminho</span></label>
          <select
            className={estilos.seletor}
            value={loja.algoritmo}
            onChange={(evento) => loja.definirAlgoritmo(evento.target.value)}
          >
            {AlgoritmosDeBusca.lista.map((algoritmo) => (
              <option key={algoritmo.id} value={algoritmo.id}>{algoritmo.nome}</option>
            ))}
          </select>
        </div>
        {/* Com um critério só não há o que escolher: o campo some sozinho, e
            reaparece assim que um segundo critério for registrado. */}
        {CriteriosDeCusto.lista.length > 1 ? (
          <div className={estilos.campo}>
            <label><span>Critério de custo</span></label>
            <select
              className={estilos.seletor}
              value={loja.criterio}
              onChange={(evento) => loja.definirCampo('criterio', evento.target.value)}
            >
              {CriteriosDeCusto.lista.map((criterio) => (
                <option key={criterio.id} value={criterio.id}>{criterio.nome}</option>
              ))}
            </select>
          </div>
        ) : null}
        <Deslizante
          rotulo={escala ? `Reserva mínima de bateria (${tempo(loja.reserva)} de autonomia)` : 'Reserva mínima de bateria'}
          valor={loja.reserva}
          minimo={0}
          maximo={40}
          aoMudar={(valor) => loja.definirCampo('reserva', valor)}
        />
        <p className={estilos.ajuda}>
          O carro só encara um trecho se a bateria cobrir o peso do caminho <b>mais</b> essa reserva.
          Senão procura um posto.
        </p>
        <Alternador
          rotulo="Recalcular rotas ao trocar de algoritmo"
          marcado={loja.recalcularAoTrocar}
          aoMudar={(valor) => loja.definirCampo('recalcularAoTrocar', valor)}
        />
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
                  <b>{formatar(linha.custo, 0)}</b>
                </span>
              ))}
            </div>
            <div className={estilos.ganho}>
              {comparacao.mesmoCusto ? (
                <>
                  Mesmo caminho ótimo nos dois, custo <b>{formatar(comparacao.linhas[0].custo, 0)}</b> em{' '}
                  {comparacao.linhas[0].arestas} arestas, ou seja{' '}
                  <b>{tempo(comparacao.linhas[0].custo)}</b> de viagem e a mesma coisa de bateria.
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
