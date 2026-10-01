'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import ensaio from '../../ensaios/resultados/regiao-ensaio4.json';
import estilos from '@/estilos/graficos.module.css';

/* Ensaio 4 da região (ensaios/regiao.ts): 1 posto por vez em cada cidade, carga subindo de
   10 em 10 carros por dia até o posto saturar. Cada ponto é a média das repetições. */

type Linha = (typeof ensaio.linhas)[number];

interface Metrica {
  id: string;
  rotulo: string;
  unidade: string;
  valor: (l: Linha) => number | null;
  desvio: (l: Linha) => number | null;
  casas: number;
}

const porDia = (v: number | null) => (v === null ? null : v / ensaio.dias);

const METRICAS: Metrica[] = [
  { id: 'espera', rotulo: 'Espera na fila', unidade: 'min', casas: 1,
    valor: (l) => l.tempoMedioFilaMin, desvio: (l) => l.tempoMedioFilaMin_dp },
  { id: 'concluidas', rotulo: 'Viagens concluídas', unidade: 'por dia', casas: 0,
    valor: (l) => porDia(l.concluidas), desvio: (l) => porDia(l.concluidas_dp) },
  { id: 'panes', rotulo: 'Panes', unidade: 'por 100 viagens', casas: 1,
    valor: (l) => l.panesPorCem, desvio: (l) => l.panesPorCem_dp },
  { id: 'utilizacao', rotulo: 'Utilização do posto', unidade: '%', casas: 1,
    valor: (l) => l.utilizacao, desvio: (l) => l.utilizacao_dp },
  { id: 'fila', rotulo: 'Fila média', unidade: 'carros', casas: 2,
    valor: (l) => l.filaMedia, desvio: (l) => l.filaMedia_dp },
  { id: 'recargas', rotulo: 'Recargas', unidade: 'por dia', casas: 1,
    valor: (l) => porDia(l.recargas), desvio: (l) => porDia(l.recargas_dp) },
  { id: 'viagem', rotulo: 'Tempo de viagem', unidade: 'h', casas: 2,
    valor: (l) => l.tempoMedioViagemH, desvio: (l) => l.tempoMedioViagemH_dp },
];

const CORES = ['#5cc4e8', '#f0a848', '#6ed7a5', '#cc6ba2', '#9d8bf7', '#e8e15c', '#ef7b6a', '#7fa8ff'];

const L = 1000, A = 560, ESQ = 64, DIR = 24, Y0 = 20, BASE = 56;

function escalaBonita(maximo: number): number[] {
  if (!(maximo > 0)) return [0, 1];
  const bruto = maximo / 5;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto)!;
  const marcas: number[] = [];
  for (let v = 0; v <= maximo + passo * 0.001; v += passo) marcas.push(v);
  if (marcas[marcas.length - 1] < maximo) marcas.push(marcas[marcas.length - 1] + passo);
  return marcas;
}

const formatar = (v: number, casas: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

export function TelaDeGraficos() {
  const [metricaId, setMetricaId] = useState(METRICAS[0].id);
  const metrica = METRICAS.find((m) => m.id === metricaId)!;

  const cidades = useMemo(() => {
    const porCidade = new Map<string, Linha[]>();
    for (const l of ensaio.linhas) porCidade.set(l.posto, [...(porCidade.get(l.posto) ?? []), l]);
    return [...porCidade].map(([nome, linhas]) => {
      const ultima = linhas[linhas.length - 1];
      return { nome, sigla: ultima.sigla, linhas, saturou: ultima.utilizacao >= ensaio.saturacao, limite: ultima.carrosPorDia };
    });
  }, []);
  const ordemDeSaturacao = useMemo(
    () => [...cidades].sort((a, b) => Number(b.saturou) - Number(a.saturou) || a.limite - b.limite),
    [cidades]
  );

  const [destaque, setDestaque] = useState<string[]>(() => ordemDeSaturacao.slice(0, 3).map((c) => c.nome));
  const [sobre, setSobre] = useState<string | null>(null);
  const [cursorX, setCursorX] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const degraus = useMemo(() => [...new Set(ensaio.linhas.map((l) => l.carrosPorDia))], []);
  const xMax = Math.max(...ensaio.linhas.map((l) => l.carrosPorDia));
  const yMax = Math.max(...ensaio.linhas.map((l) => metrica.valor(l) ?? 0));
  const marcasX = escalaBonita(xMax);
  const marcasY = escalaBonita(yMax);
  const x = (v: number) => ESQ + (v / marcasX[marcasX.length - 1]) * (L - ESQ - DIR);
  const y = (v: number) => A - BASE - (v / marcasY[marcasY.length - 1]) * (A - BASE - Y0);

  const corDe = (nome: string) => {
    const i = destaque.indexOf(nome);
    return i < 0 ? null : CORES[i % CORES.length];
  };
  const alternar = (nome: string) =>
    setDestaque((d) => (d.includes(nome) ? d.filter((n) => n !== nome) : [...d, nome]));

  const caminho = (linhas: Linha[]) =>
    linhas
      .filter((l) => metrica.valor(l) !== null)
      .map((l, i) => `${i ? 'L' : 'M'}${x(l.carrosPorDia).toFixed(1)},${y(metrica.valor(l)!).toFixed(1)}`)
      .join('');

  const aoMover = (evento: React.MouseEvent) => {
    const area = svgRef.current!.getBoundingClientRect();
    const xSvg = ((evento.clientX - area.left) / area.width) * L;
    if (xSvg < ESQ || xSvg > L - DIR) return setCursorX(null);
    const carros = ((xSvg - ESQ) / (L - ESQ - DIR)) * marcasX[marcasX.length - 1];
    setCursorX(degraus.reduce((melhor, d) => (Math.abs(d - carros) < Math.abs(melhor - carros) ? d : melhor)));
  };

  const emFoco = sobre ? [sobre, ...destaque.filter((n) => n !== sobre)] : destaque;
  const leitura = cursorX === null ? [] : emFoco
    .map((nome) => {
      const linha = cidades.find((c) => c.nome === nome)!.linhas.find((l) => l.carrosPorDia === cursorX);
      return linha && metrica.valor(linha) !== null ? { nome, linha } : null;
    })
    .filter((v): v is { nome: string; linha: Linha } => v !== null);

  const desenhoDe = (c: (typeof cidades)[number], realce: boolean) => {
    const cor = corDe(c.nome);
    const ultima = c.linhas[c.linhas.length - 1];
    const vUltima = metrica.valor(ultima);
    return (
      <g key={c.nome} onMouseEnter={() => setSobre(c.nome)} onMouseLeave={() => setSobre(null)}
         onClick={() => alternar(c.nome)} style={{ cursor: 'pointer' }}>
        <path d={caminho(c.linhas)} fill="none" stroke="transparent" strokeWidth={10} />
        <path d={caminho(c.linhas)} fill="none"
              stroke={cor ?? (realce ? '#dde7f1' : '#3a4a5d')}
              strokeWidth={cor || realce ? 2.2 : 1.2} strokeLinejoin="round" />
        {c.saturou && vUltima !== null ? (
          <circle cx={x(ultima.carrosPorDia)} cy={y(vUltima)} r={cor || realce ? 4 : 2.5}
                  fill={cor ?? (realce ? '#dde7f1' : '#3a4a5d')} />
        ) : null}
      </g>
    );
  };

  return (
    <div className={estilos.tela}>
      <header className={estilos.topo}>
        <div className={estilos.marca}>
          <b>Malha EV</b>
          <span>1 posto por cidade · corredor Sudeste</span>
        </div>
        <nav className={estilos.menu}>
          {METRICAS.map((m) => (
            <button key={m.id} className={m.id === metricaId ? estilos.ativo : undefined} onClick={() => setMetricaId(m.id)}>
              {m.rotulo}
            </button>
          ))}
        </nav>
        <Link href="/" className={estilos.voltar}>Simulador</Link>
      </header>

      <main className={estilos.corpo}>
        <div className={estilos.grafico}>
          <svg ref={svgRef} viewBox={`0 0 ${L} ${A}`} role="img" aria-label={`${metrica.rotulo} por carros por dia`}
               onMouseMove={aoMover} onMouseLeave={() => setCursorX(null)}>
            <g fontSize="12" fill="#5b6b7e">
              {marcasY.map((v) => (
                <g key={`y${v}`}>
                  <line x1={ESQ} x2={L - DIR} y1={y(v)} y2={y(v)} stroke="#1c2634" />
                  <text x={ESQ - 10} y={y(v) + 4} textAnchor="end">{formatar(v, v % 1 ? 1 : 0)}</text>
                </g>
              ))}
              {marcasX.map((v) => (
                <text key={`x${v}`} x={x(v)} y={A - BASE + 20} textAnchor="middle">{formatar(v, 0)}</text>
              ))}
              <text x={(ESQ + L - DIR) / 2} y={A - 10} textAnchor="middle" fill="#8698ac">carros por dia</text>
              <text x={16} y={(Y0 + A - BASE) / 2} textAnchor="middle" fill="#8698ac"
                    transform={`rotate(-90 16 ${(Y0 + A - BASE) / 2})`}>{`${metrica.rotulo} (${metrica.unidade})`}</text>
            </g>
            <line x1={ESQ} x2={L - DIR} y1={y(0)} y2={y(0)} stroke="#37485f" />

            {cidades.filter((c) => !corDe(c.nome) && c.nome !== sobre).map((c) => desenhoDe(c, false))}
            {cidades.filter((c) => corDe(c.nome) && c.nome !== sobre).map((c) => desenhoDe(c, false))}
            {sobre ? desenhoDe(cidades.find((c) => c.nome === sobre)!, true) : null}

            {cursorX !== null ? (
              <g pointerEvents="none">
                <line x1={x(cursorX)} x2={x(cursorX)} y1={Y0} y2={A - BASE} stroke="#5b6b7e" strokeDasharray="3 3" />
                {leitura.map(({ nome, linha }) => (
                  <circle key={nome} cx={x(cursorX)} cy={y(metrica.valor(linha)!)} r={3.5}
                          fill={corDe(nome) ?? '#dde7f1'} />
                ))}
              </g>
            ) : null}
          </svg>

          {cursorX !== null && leitura.length ? (
            <div className={estilos.dica} style={{
              left: `${(x(cursorX) / L) * 100}%`,
              transform: x(cursorX) > L * 0.6 ? 'translateX(calc(-100% - 14px))' : 'translateX(14px)',
            }}>
              <b>{cursorX} carros/dia</b>
              {leitura.map(({ nome, linha }) => (
                <div key={nome}>
                  <i style={{ background: corDe(nome) ?? '#dde7f1' }} />
                  <span>{nome}</span>
                  <var>
                    {formatar(metrica.valor(linha)!, metrica.casas)}
                    <small> ± {formatar(metrica.desvio(linha) ?? 0, metrica.casas)}</small>
                  </var>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <aside className={estilos.legenda}>
          <h4>Satura em (carros/dia)</h4>
          {ordemDeSaturacao.map((c) => {
            const cor = corDe(c.nome);
            return (
              <button key={c.nome} onClick={() => alternar(c.nome)}
                      onMouseEnter={() => setSobre(c.nome)} onMouseLeave={() => setSobre(null)}
                      className={cor ? estilos.marcada : undefined}>
                <i style={{ background: cor ?? '#3a4a5d' }} />
                <span>{c.nome}</span>
                <var>{c.saturou ? `${c.limite}` : `> ${c.limite}`}</var>
              </button>
            );
          })}
        </aside>
      </main>
    </div>
  );
}
