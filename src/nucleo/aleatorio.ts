/** Gerador determinístico: a mesma semente devolve sempre a mesma sequência.
    É o que permite repetir um cenário inteiro e comparar mudanças. */
export function criarGeradorAleatorio(semente: number): () => number {
  let estado = semente | 0;
  return function sortear(): number {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let sortear = criarGeradorAleatorio(7);

export function semear(semente: number): void {
  sortear = criarGeradorAleatorio(semente || 1);
}
export const aleatorio = (): number => sortear();
export const numeroEntre = (minimo: number, maximo: number): number =>
  minimo + sortear() * (maximo - minimo);
export const inteiroEntre = (minimo: number, maximo: number): number =>
  Math.floor(numeroEntre(minimo, maximo + 1));
