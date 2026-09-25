'use client';

import type { ReactNode } from 'react';
import estilos from '@/estilos/painel.module.css';

export function Bloco({ titulo, nota, children }: { titulo: string; nota?: ReactNode; children: ReactNode }) {
  return (
    <section className={estilos.bloco}>
      <h3>
        <span>{titulo}</span>
        {nota ? <em>{nota}</em> : null}
      </h3>
      {children}
    </section>
  );
}

export function Deslizante({
  rotulo, valor, minimo, maximo, passo = 1, sufixo = '', aoMudar,
}: {
  rotulo: string; valor: number; minimo: number; maximo: number;
  passo?: number; sufixo?: string; aoMudar: (valor: number) => void;
}) {
  return (
    <div className={estilos.campo}>
      <label>
        <span>{rotulo}</span>
        <var>{valor}{sufixo}</var>
      </label>
      <input
        className={estilos.deslizante}
        type="range"
        min={minimo}
        max={maximo}
        step={passo}
        value={valor}
        onChange={(evento) => aoMudar(Number(evento.target.value))}
      />
    </div>
  );
}

export function Alternador({
  rotulo, marcado, aoMudar,
}: { rotulo: string; marcado: boolean; aoMudar: (valor: boolean) => void }) {
  return (
    <label className={estilos.alternador}>
      <input type="checkbox" checked={marcado} onChange={(evento) => aoMudar(evento.target.checked)} />
      <span>{rotulo}</span>
    </label>
  );
}

export function Botao({
  children, aoClicar, variacao, largura,
}: {
  children: ReactNode; aoClicar: () => void;
  variacao?: 'destaque' | 'discreta'; largura?: 'larga';
}) {
  const classes = [estilos.botao];
  if (variacao === 'destaque') classes.push(estilos.destaque);
  if (variacao === 'discreta') classes.push(estilos.discreta);
  if (largura === 'larga') classes.push(estilos.larga);
  return (
    <button type="button" className={classes.join(' ')} onClick={aoClicar}>
      {children}
    </button>
  );
}

export function LinhaDeDado({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className={estilos.linhaDeDado}>
      <span>{rotulo}</span>
      <b>{valor}</b>
    </div>
  );
}

export function Indicador({ valor, rotulo, cor }: { valor: string; rotulo: string; cor: string }) {
  return (
    <div className={estilos.indicador}>
      <b style={{ color: cor }}>{valor}</b>
      <span>{rotulo}</span>
    </div>
  );
}

/* As duas pontas de uma rota. A ponta ativa é a que o próximo clique no mapa
   preenche, e clicar na ficha troca qual é. O mesmo componente serve para o par
   que cria carros novos e para a rota do carro selecionado. */
export function SeletorDeRota({
  origem, destino, campoAtivo, aoEscolherCampo, origemEditavel = true, legenda,
}: {
  origem: string | null;
  destino: string | null;
  campoAtivo: 'origem' | 'destino';
  aoEscolherCampo: (campo: 'origem' | 'destino') => void;
  origemEditavel?: boolean;
  legenda?: ReactNode;
}) {
  const classes = (base: string, ativa: boolean, travada = false) =>
    [estilos.ficha, base, ativa ? estilos.fichaAtiva : '', travada ? estilos.fichaTravada : '']
      .filter(Boolean)
      .join(' ');

  return (
    <>
      <div className={estilos.par}>
        <button
          type="button"
          className={classes(estilos.fichaOrigem, campoAtivo === 'origem' && origemEditavel, !origemEditavel)}
          onClick={() => aoEscolherCampo('origem')}
          disabled={!origemEditavel}
          title={
            origemEditavel
              ? 'O próximo clique no mapa define a origem'
              : 'A origem só muda com o carro parado num nó'
          }
        >
          <span>origem</span>
          <b title={origem ?? undefined}>{origem ?? '—'}</b>
        </button>
        <div className={estilos.seta}>→</div>
        <button
          type="button"
          className={classes(estilos.fichaDestino, campoAtivo === 'destino')}
          onClick={() => aoEscolherCampo('destino')}
          title="O próximo clique no mapa define o destino"
        >
          <span>destino</span>
          <b title={destino ?? undefined}>{destino ?? '—'}</b>
        </button>
      </div>
      {legenda ? <p className={estilos.legendaDaRota}>{legenda}</p> : null}
    </>
  );
}

/* O texto vem do próprio motor, montado em simulacao.ts, e nunca de entrada do
   usuário: por isso pode ir como HTML sem risco de injeção. */
export function TextoDoMotor({ html, className }: { html: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
