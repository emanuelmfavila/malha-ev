'use client';

import { useEffect } from 'react';
import { AlgoritmosDeBusca } from '@/nucleo/algoritmos';
import { Cenarios } from '@/nucleo/cenarios';
import { CriteriosDeCusto } from '@/nucleo/criterios';
import { Malha } from '@/nucleo/malha';
import { formatar, formatarDuracao } from '@/nucleo/utilidades';
import { usarLoja } from '@/estado/loja';
import { Alternador, Botao, Deslizante } from './ui/Controles';
import estilos from '@/estilos/painel.module.css';

/* Todas as regras da simulação num lugar só, atrás da engrenagem. Cada regra
   vale na hora: carros em campo passam a obedecer ao valor novo no passo
   seguinte, sem reiniciar. Os padrões vêm do cenário escolhido. */
export function Regras() {
  const loja = usarLoja();
  const aberto = loja.regrasAbertas;

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') loja.abrirRegras(false);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, loja]);

  if (!aberto) return null;

  const cenario = Cenarios.porId[loja.cenario];
  const consumo = loja.consumoPorHora;
  const autonomia = (pontos: number) => formatarDuracao(pontos / consumo);

  return (
    <div className={estilos.sobreposicao} onMouseDown={(evento) => evento.target === evento.currentTarget && loja.abrirRegras(false)}>
      <div className={estilos.regras} role="dialog" aria-label="Regras da simulação">
        <div className={estilos.cabecalhoDasRegras}>
          <div>
            <h2>Regras da simulação</h2>
            <p className={estilos.ajuda} style={{ margin: 0 }}>
              Cenário <b>{cenario.nome}</b>. Tudo aqui vale na hora, sem reiniciar. Trocar de cenário volta aos
              padrões dele.
            </p>
          </div>
          <Botao variacao="discreta" aoClicar={() => loja.abrirRegras(false)}>Fechar (Esc)</Botao>
        </div>

        <div className={estilos.regrasGrade}>
          <section className={estilos.grupoDeRegras}>
            <h3>Carro e bateria</h3>
            <Deslizante
              rotulo="Bateria cheia"
              valor={loja.bateriaCheia}
              minimo={20}
              maximo={300}
              passo={10}
              sufixo=" pontos"
              aoMudar={(valor) => loja.definirCampo('bateriaCheia', valor)}
            />
            <Deslizante
              rotulo="Consumo por hora de viagem"
              valor={consumo}
              minimo={1}
              maximo={60}
              sufixo=" pontos/h"
              aoMudar={(valor) => loja.definirCampo('consumoPorHora', valor)}
            />
            <p className={estilos.ajuda}>
              O peso de uma aresta é o tempo de viagem em horas; a bateria cai <b>{consumo}</b>{' '}
              {consumo === 1 ? 'ponto' : 'pontos'} por hora. Autonomia:{' '}
              <b>{loja.bateriaCheia} ÷ {consumo} = {autonomia(loja.bateriaCheia)}</b> de estrada numa carga.
            </p>
            <Deslizante
              rotulo="Bateria ao sair (carros colocados à mão)"
              valor={Math.min(loja.bateriaInicial, loja.bateriaCheia)}
              minimo={5}
              maximo={loja.bateriaCheia}
              passo={5}
              sufixo={` = ${autonomia(loja.bateriaInicial)}`}
              aoMudar={(valor) => loja.definirCampo('bateriaInicial', valor)}
            />
          </section>

          <section className={estilos.grupoDeRegras}>
            <h3>Postos de recarga</h3>
            <Deslizante
              rotulo="Quantos nós têm posto"
              valor={loja.quantidadeDePostos}
              minimo={0}
              maximo={Math.max(Malha.nos.length, 1)}
              aoMudar={(valor) => loja.definirCampo('quantidadeDePostos', valor)}
            />
            <Deslizante
              rotulo="Vagas por posto"
              valor={loja.vagasPorPosto}
              minimo={1}
              maximo={12}
              aoMudar={(valor) => loja.definirCampo('vagasPorPosto', valor)}
            />
            <Deslizante
              rotulo="Tempo de recarga (sempre até encher)"
              valor={Math.round(loja.horasDeRecarga * 60)}
              minimo={10}
              maximo={720}
              passo={10}
              sufixo=" min"
              aoMudar={(valor) => loja.definirCampo('horasDeRecarga', valor / 60)}
            />
            <p className={estilos.ajuda}>
              Os postos vão para os nós mais conectados. Quem chega espera na fila em ordem de chegada; a recarga
              leva <b>{formatarDuracao(loja.horasDeRecarga)}</b> e devolve a bateria cheia.
            </p>
            <Deslizante
              rotulo="Parar ao passar num posto com bateria até"
              valor={loja.limiarDeRecarga}
              minimo={0}
              maximo={90}
              passo={5}
              sufixo={` = ${autonomia(loja.limiarDeRecarga)}`}
              aoMudar={(valor) => loja.definirCampo('limiarDeRecarga', valor)}
            />
            <p className={estilos.ajuda} style={{ margin: 0 }}>
              Parada oportunista: passou num posto com a bateria neste nível ou abaixo, para e enche mesmo sem
              estar no plano. Em <b>0</b> a regra desliga.
            </p>
          </section>

          <section className={estilos.grupoDeRegras}>
            <h3>Roteamento</h3>
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
              rotulo="Reserva mínima de bateria"
              valor={loja.reserva}
              minimo={0}
              maximo={40}
              sufixo={` = ${autonomia(loja.reserva)}`}
              aoMudar={(valor) => loja.definirCampo('reserva', valor)}
            />
            <p className={estilos.ajuda}>
              O carro só encara um trecho se a bateria cobrir o gasto do caminho <b>mais</b> essa reserva. Senão
              procura um posto de onde o destino é alcançável, direto ou por uma cadeia de postos.
            </p>
            <Deslizante
              rotulo="Peso da espera na escolha do posto"
              valor={loja.pesoDaFila}
              minimo={0}
              maximo={2}
              passo={0.05}
              sufixo="×"
              aoMudar={(valor) => loja.definirCampo('pesoDaFila', valor)}
            />
            <p className={estilos.ajuda}>
              Pontuação de um posto = horas até ele + horas dele ao destino + espera prevista × este peso. Em{' '}
              <b>0</b> o carro ignora a fila; em <b>1</b> uma hora de fila vale uma hora de estrada.
            </p>
            <Alternador
              rotulo="Recalcular rotas ao trocar de algoritmo"
              marcado={loja.recalcularAoTrocar}
              aoMudar={(valor) => loja.definirCampo('recalcularAoTrocar', valor)}
            />
          </section>

          <section className={estilos.grupoDeRegras}>
            <h3>Demanda e relógio</h3>
            <Alternador
              rotulo="Criar viagens sozinho"
              marcado={loja.chegadasAutomaticas}
              aoMudar={(valor) => loja.definirCampo('chegadasAutomaticas', valor)}
            />
            <div style={{ marginTop: 8 }}>
              <Deslizante
                rotulo="Viagens novas por dia"
                valor={loja.chegadasPorDia}
                minimo={1}
                maximo={cenario.aleatoria ? 60 : 2400}
                aoMudar={(valor) => loja.definirCampo('chegadasPorDia', valor)}
              />
            </div>
            <p className={estilos.ajuda}>
              {cenario.sortearViagem
                ? 'Na região as viagens saem com peso proporcional à raiz da população de cada cidade, e 70% dos carros partem com 80 a 100% de bateria.'
                : 'Origem, destino e bateria inicial (40 a 100%) são sorteados de modo uniforme.'}
            </p>
            <Deslizante
              rotulo="Velocidade do relógio"
              valor={loja.horasPorSegundo}
              minimo={1}
              maximo={48}
              sufixo=" h/s"
              aoMudar={(valor) => loja.definirCampo('horasPorSegundo', valor)}
            />
            <p className={estilos.ajuda} style={{ margin: 0 }}>
              A {loja.horasPorSegundo} h/s, um dia simulado passa em <b>{formatar(24 / loja.horasPorSegundo, 0)} s</b>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
