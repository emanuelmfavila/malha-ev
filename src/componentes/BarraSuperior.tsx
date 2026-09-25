'use client';

import { Simulacao } from '@/nucleo/simulacao';
import { formatarRelogio } from '@/nucleo/utilidades';
import { usarLoja } from '@/estado/loja';
import { Botao } from './ui/Controles';
import estilos from '@/estilos/painel.module.css';

export function BarraSuperior() {
  const emExecucao = usarLoja((estado) => estado.emExecucao);
  const alternarExecucao = usarLoja((estado) => estado.alternarExecucao);
  const avancarUmaHora = usarLoja((estado) => estado.avancarUmaHora);
  const reiniciar = usarLoja((estado) => estado.reiniciar);
  const abrirRegras = usarLoja((estado) => estado.abrirRegras);
  usarLoja((estado) => estado.tique);

  return (
    <header className={estilos.barraSuperior}>
      <div className={estilos.marca}>
        <b>Malha EV</b>
        <span>simulador de carros elétricos</span>
      </div>
      <div className={estilos.relogio}>
        <span>{formatarRelogio(Simulacao.hora)}</span>
        <small>tempo simulado, em horas</small>
      </div>
      <div className={estilos.acoesTopo}>
        <Botao variacao="destaque" aoClicar={alternarExecucao}>
          {emExecucao ? 'Pausar' : 'Iniciar'}
        </Botao>
        <Botao variacao="discreta" aoClicar={avancarUmaHora}>Avançar 1 h</Botao>
        <Botao variacao="discreta" aoClicar={reiniciar}>Reiniciar</Botao>
        <Botao variacao="discreta" aoClicar={() => abrirRegras(true)}>⚙ Regras</Botao>
      </div>
    </header>
  );
}
