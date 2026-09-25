'use client';

import { useEffect } from 'react';
import { Malha } from '@/nucleo/malha';
import { usarLoja, vista } from '@/estado/loja';
import { BarraSuperior } from './BarraSuperior';
import { PainelEsquerdo } from './PainelEsquerdo';
import { PainelDireito } from './PainelDireito';
import { Palco } from './Palco';
import estilos from '@/estilos/painel.module.css';

export function Aplicacao() {
  const gerarMalha = usarLoja((estado) => estado.gerarMalha);
  const alternarExecucao = usarLoja((estado) => estado.alternarExecucao);
  const avancarUmaHora = usarLoja((estado) => estado.avancarUmaHora);
  const compararAlgoritmos = usarLoja((estado) => estado.compararAlgoritmos);

  // primeira malha, só quando ainda não existe nenhuma
  useEffect(() => {
    if (!Malha.nos.length) gerarMalha();
  }, [gerarMalha]);

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      const alvo = evento.target as HTMLElement | null;
      if (alvo && /^(INPUT|SELECT|TEXTAREA)$/.test(alvo.tagName)) return;
      if (evento.code === 'Space') {
        evento.preventDefault();
        alternarExecucao();
      }
      if (evento.key === 'n') avancarUmaHora();
      if (evento.key === 'c') compararAlgoritmos();
      if (evento.key === 'f') vista.camera.enquadrar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [alternarExecucao, avancarUmaHora, compararAlgoritmos]);

  return (
    <div className={estilos.aplicacao}>
      <BarraSuperior />
      <PainelEsquerdo />
      <Palco />
      <PainelDireito />
    </div>
  );
}
