'use client';

import { useEffect, useRef } from 'react';
import { Estatisticas } from '@/nucleo/estatisticas';
import { CORES } from '@/mapa/cores';
import { usarLoja } from '@/estado/loja';
import estilos from '@/estilos/painel.module.css';

/** Duas séries sobre o histórico amostrado: carros em rota e carros na fila. */
export function GraficoDeOcupacao() {
  const telaRef = useRef<HTMLCanvasElement>(null);
  const tique = usarLoja((estado) => estado.tique);

  useEffect(() => {
    const tela = telaRef.current;
    const contexto = tela?.getContext('2d');
    if (!tela || !contexto) return;

    const area = tela.getBoundingClientRect();
    if (!area.width) return;
    const densidade = window.devicePixelRatio || 1;
    tela.width = area.width * densidade;
    tela.height = area.height * densidade;
    contexto.setTransform(densidade, 0, 0, densidade, 0, 0);
    contexto.clearRect(0, 0, area.width, area.height);

    const amostras = Estatisticas.historico.slice(-120);
    if (amostras.length < 2) return;
    const maiorValor = Math.max(4, ...amostras.map((a) => Math.max(a.emRota, a.naFila + a.recarregando)));
    const posicaoX = (indice: number) => 4 + (indice / (amostras.length - 1)) * (area.width - 8);
    const posicaoY = (valor: number) => area.height - 6 - (valor / maiorValor) * (area.height - 16);

    for (const serie of [
      { campo: 'emRota' as const, cor: CORES.gelo },
      { campo: 'naFila' as const, cor: CORES.ambar },
    ]) {
      contexto.beginPath();
      amostras.forEach((amostra, indice) => {
        const x = posicaoX(indice);
        const y = posicaoY(amostra[serie.campo]);
        if (indice) contexto.lineTo(x, y);
        else contexto.moveTo(x, y);
      });
      contexto.strokeStyle = serie.cor;
      contexto.lineWidth = 1.7;
      contexto.stroke();
      contexto.lineTo(posicaoX(amostras.length - 1), area.height);
      contexto.lineTo(posicaoX(0), area.height);
      contexto.closePath();
      contexto.fillStyle = serie.cor + '22';
      contexto.fill();
    }
    contexto.fillStyle = '#5b6b7e';
    contexto.font = '10px ui-monospace, monospace';
    contexto.textAlign = 'left';
    contexto.fillText('pico ' + maiorValor, 6, 12);
  }, [tique]);

  return <canvas ref={telaRef} className={estilos.ocupacao} />;
}
