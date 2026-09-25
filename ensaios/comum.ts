/* Funções partilhadas pelos scripts de ensaio: postos, médias, CSV. */

import { Malha } from '../src/nucleo/malha';
import { HORAS_DE_RECARGA, VAGAS_POR_POSTO } from '../src/nucleo/constantes';

export function colocarPostosEm(
  indices: number[],
  vagas = VAGAS_POR_POSTO,
  horasDeRecarga = HORAS_DE_RECARGA
): void {
  Malha.nos.forEach((no) => (no.posto = null));
  for (const indice of indices)
    Malha.nos[indice].posto = {
      vagas,
      horasDeRecarga,
      vagasOcupadas: new Array(vagas).fill(null),
      fila: [],
      horasDeVagaOcupada: 0,
      recargasConcluidas: 0,
      maiorFila: 0,
    };
}

export function media(valores: number[]): number {
  const validos = valores.filter((v) => Number.isFinite(v));
  return validos.length ? validos.reduce((s, v) => s + v, 0) / validos.length : NaN;
}

export function desvio(valores: number[]): number {
  const validos = valores.filter((v) => Number.isFinite(v));
  if (validos.length < 2) return NaN;
  const m = media(validos);
  return Math.sqrt(validos.reduce((s, v) => s + (v - m) ** 2, 0) / (validos.length - 1));
}

/** Média e desvio padrão de cada campo numérico, coluna a coluna. */
export function resumir<T extends Record<string, number>>(medidas: T[]): Record<string, number> {
  const linha: Record<string, number> = {};
  for (const campo of Object.keys(medidas[0])) {
    const v = medidas.map((m) => m[campo]);
    linha[campo] = media(v);
    linha[campo + '_dp'] = desvio(v);
  }
  return linha;
}

export function csv(linhas: Record<string, unknown>[]): string {
  const colunas = Object.keys(linhas[0]);
  const f = (v: unknown) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v.toFixed(3) : '';
    const texto = String(v);
    return /[",\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
  };
  return [colunas.join(','), ...linhas.map((l) => colunas.map((c) => f(l[c])).join(','))].join('\n') + '\n';
}

export function mostrar(linhas: Record<string, unknown>[], colunas: string[]): void {
  console.log(colunas.join('\t'));
  for (const l of linhas)
    console.log(
      colunas.map((c) => (typeof l[c] === 'number' ? (l[c] as number).toFixed(2) : String(l[c]))).join('\t')
    );
  console.log();
}
