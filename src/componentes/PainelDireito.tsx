'use client';

import { Estatisticas } from '@/nucleo/estatisticas';
import { Malha } from '@/nucleo/malha';
import { Simulacao } from '@/nucleo/simulacao';
import { formatar, formatarRelogio } from '@/nucleo/utilidades';
import { CORES, corDaBateria, corDaSituacao } from '@/mapa/cores';
import { duracao, usarLoja } from '@/estado/loja';
import { Acompanhamento, descreverTrecho, motivoLegivel } from './Acompanhamento';
import { GraficoDeOcupacao } from './GraficoDeOcupacao';
import { Bloco, Botao, Indicador, LinhaDeDado } from './ui/Controles';
import estilos from '@/estilos/painel.module.css';

const ORDEM_NA_LISTA: Record<string, number> = {
  'em rota': 0, recarregando: 1, 'na fila': 2, chegou: 3, falhou: 4,
};

export function PainelDireito() {
  const loja = usarLoja();
  usarLoja((estado) => estado.tique);

  const concluidas = Math.max(Estatisticas.viagensConcluidas, 1);
  const iniciadas = Math.max(Estatisticas.viagensIniciadas, 1);
  const recargas = Math.max(Estatisticas.recargasConcluidas, 1);
  const houveViagem = Estatisticas.viagensConcluidas > 0;
  const percentualDe = (parte: number, total: number) => formatar((parte / total) * 100, 1);
  const postos = Malha.nosComPosto();
  const carros = [...Simulacao.carros]
    .sort((a, b) => ORDEM_NA_LISTA[a.situacao] - ORDEM_NA_LISTA[b.situacao] || a.numero - b.numero)
    .slice(0, 60);

  return (
    <aside className={`${estilos.coluna} ${estilos.direita}`}>
      <Bloco
        titulo="O que está acontecendo"
        nota={
          loja.carroSelecionado === null
            ? 'visão geral'
            : `seguindo ${Simulacao.carrosPorNumero.get(loja.carroSelecionado)?.nome ?? ''}`
        }
      >
        <Acompanhamento />
      </Bloco>

      <Bloco titulo="Resultados" nota={`${Estatisticas.viagensIniciadas} viagens`}>
        <div className={estilos.indicadores}>
          <Indicador
            cor={CORES.gelo}
            rotulo="tempo médio de viagem"
            valor={houveViagem ? duracao(Estatisticas.somaTempoDeViagem / concluidas) : '—'}
          />
          <Indicador
            cor={CORES.ambar}
            rotulo="espera média em fila"
            valor={houveViagem ? duracao(Estatisticas.somaTempoEmFila / concluidas, 1) : '—'}
          />
          <Indicador
            cor={CORES.menta}
            rotulo="bateria média gasta"
            valor={houveViagem ? formatar(Estatisticas.somaBateriaGasta / concluidas, 0) : '—'}
          />
          <Indicador
            cor={CORES.ameixa}
            rotulo="viagens sem sucesso"
            valor={
              Estatisticas.viagensIniciadas
                ? `${percentualDe(Estatisticas.totalDeFalhas, iniciadas)}%`
                : '—'
            }
          />
        </div>
      </Bloco>

      <Bloco titulo="Detalhamento">
        <LinhaDeDado
          rotulo="Viagens concluídas"
          valor={`${Estatisticas.viagensConcluidas} (${percentualDe(Estatisticas.viagensConcluidas, iniciadas)}%)`}
        />
        <LinhaDeDado
          rotulo="Pararam sem bateria"
          valor={`${Estatisticas.falhasPorPane} (${percentualDe(Estatisticas.falhasPorPane, iniciadas)}%)`}
        />
        <LinhaDeDado
          rotulo="Sem caminho no grafo"
          valor={`${Estatisticas.falhasPorRota} (${percentualDe(Estatisticas.falhasPorRota, iniciadas)}%)`}
        />
        <LinhaDeDado
          rotulo="Recargas concluídas"
          valor={`${Estatisticas.recargasConcluidas} (${percentualDe(Estatisticas.recargasConcluidas, iniciadas)}%)`}
        />
        <LinhaDeDado
          rotulo="Paradas fora do plano"
          valor={`${Estatisticas.recargasOportunistas} (${percentualDe(Estatisticas.recargasOportunistas, recargas)}%)`}
        />
        <LinhaDeDado
          rotulo="Tempo médio recarregando"
          valor={duracao(Estatisticas.somaTempoRecarregando / concluidas, 1)}
        />
        <LinhaDeDado
          rotulo="Bateria total recarregada"
          valor={`${formatar(Estatisticas.somaBateriaRecebida, 0)} (${percentualDe(Estatisticas.somaBateriaRecebida, iniciadas)}%)`}
        />
        <LinhaDeDado rotulo="Peso total percorrido" valor={formatar(Estatisticas.somaPesoPercorrido, 0)} />
        <LinhaDeDado rotulo="Nós expandidos nas buscas" valor={Estatisticas.nosExpandidos.toLocaleString('pt-BR')} />
      </Bloco>

      <Bloco titulo="Ocupação da rede" nota="últimos 5 dias">
        <GraficoDeOcupacao />
      </Bloco>

      <Bloco titulo="Utilização dos postos">
        {postos.length ? (
          postos.map((no) => {
            const utilizacao = Simulacao.utilizacaoDoPosto(no);
            return (
              <div key={no.indice} className={estilos.posto}>
                <div className={estilos.cabecalhoDoPosto}>
                  <b>{no.nome}</b>
                  <i>
                    {no.posto!.recargasConcluidas} recargas, fila {no.posto!.fila.length}, pico{' '}
                    {no.posto!.maiorFila}
                  </i>
                  <b>{formatar(utilizacao, 0)}%</b>
                </div>
                <div className={estilos.barra}>
                  <i style={{ width: `${utilizacao}%` }} />
                </div>
              </div>
            );
          })
        ) : (
          <div className={estilos.vazio}>Nenhum posto configurado.</div>
        )}
      </Bloco>

      <Bloco titulo="Frota" nota={`${Simulacao.carros.length} carros`}>
        <div className={estilos.frota}>
          {carros.length ? (
            carros.map((carro) => {
              const percentual = (carro.bateria / Simulacao.configuracao.bateriaCheia) * 100;
              const cor = corDaSituacao(carro.situacao);
              return (
                <button
                  type="button"
                  key={carro.numero}
                  className={`${estilos.carro} ${
                    loja.carroSelecionado === carro.numero ? estilos.carroSelecionado : ''
                  }`}
                  onClick={() => loja.selecionarCarro(carro.numero)}
                >
                  <div className={estilos.faixa} style={{ background: cor }} />
                  <div className={estilos.sigla} style={{ color: cor }}>
                    {carro.nome.replace('C', '')}
                  </div>
                  <div>
                    <div className={estilos.trecho}>{descreverTrecho(carro)}</div>
                    <div className={estilos.situacao}>
                      {carro.situacao === 'falhou'
                        ? motivoLegivel(carro)
                        : Simulacao.estaSemViagem(carro)
                          ? 'sem destino'
                          : carro.situacao}
                    </div>
                  </div>
                  <div className={estilos.carga}>
                    <em>{formatar(percentual, 0)}%</em>
                    <div className={estilos.barra}>
                      <i
                        style={{
                          width: `${percentual}%`,
                          background: corDaBateria(carro.bateria / Simulacao.configuracao.bateriaCheia),
                        }}
                      />
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className={estilos.vazio}>Nenhum carro na malha.</div>
          )}
        </div>
        <div className={estilos.grupoDeBotoes} style={{ marginTop: 9 }}>
          <span style={{ flex: 1 }}>
            <Botao largura="larga" aoClicar={loja.limparEncerrados}>Remover encerrados</Botao>
          </span>
          <Botao aoClicar={loja.exportarDados}>Exportar dados</Botao>
        </div>
      </Bloco>

      <Bloco titulo="Ocorrências">
        <div className={estilos.ocorrencias}>
          {loja.ocorrencias.map((ocorrencia, indice) => (
            <div key={`${ocorrencia.hora}-${indice}`}>
              <span>{formatarRelogio(ocorrencia.hora)}</span> {ocorrencia.mensagem}
            </div>
          ))}
        </div>
      </Bloco>
    </aside>
  );
}
