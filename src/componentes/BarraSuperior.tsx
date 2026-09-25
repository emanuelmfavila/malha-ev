'use client';

import { Simulacao } from '@/nucleo/simulacao';
import { Cenarios } from '@/nucleo/cenarios';
import { formatarRelogio, formatarRelogioReal } from '@/nucleo/utilidades';
import { usarLoja } from '@/estado/loja';
import { Botao } from './ui/Controles';
import estilos from '@/estilos/painel.module.css';

export function BarraSuperior() {
  const emExecucao = usarLoja((estado) => estado.emExecucao);
  const alternarExecucao = usarLoja((estado) => estado.alternarExecucao);
  const avancarUmaHora = usarLoja((estado) => estado.avancarUmaHora);
  const reiniciar = usarLoja((estado) => estado.reiniciar);
  const cenario = Cenarios.porId[usarLoja((estado) => estado.cenario)];
  usarLoja((estado) => estado.tique);
  const escala = cenario.minutosPorUnidade;

  return (
    <header className={estilos.barraSuperior}>
      <div className={estilos.marca}>
        <b>Malha EV</b>
        <span>simulador de carros elétricos</span>
      </div>
      <div className={estilos.relogio}>
        <span>{escala ? formatarRelogioReal(Simulacao.hora, escala) : formatarRelogio(Simulacao.hora)}</span>
        <small>{escala ? `tempo real · ${Simulacao.hora.toFixed(0)} unidades de ${escala} min` : 'tempo simulado'}</small>
      </div>
      <div className={estilos.acoesTopo}>
        <Botao variacao="destaque" aoClicar={alternarExecucao}>
          {emExecucao ? 'Pausar' : 'Iniciar'}
        </Botao>
        <Botao variacao="discreta" aoClicar={avancarUmaHora}>{escala ? 'Avançar 1 unidade' : 'Avançar 1 h'}</Botao>
        <Botao variacao="discreta" aoClicar={reiniciar}>Reiniciar</Botao>
      </div>
    </header>
  );
}
