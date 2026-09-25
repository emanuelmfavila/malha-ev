/** Fila de prioridade mínima usada pelas buscas de caminho. */
export class FilaDePrioridade<T> {
  private itens: { valor: T; prioridade: number }[] = [];

  get tamanho(): number {
    return this.itens.length;
  }

  inserir(valor: T, prioridade: number): void {
    const itens = this.itens;
    itens.push({ valor, prioridade });
    let posicao = itens.length - 1;
    while (posicao > 0) {
      const pai = (posicao - 1) >> 1;
      if (itens[pai].prioridade <= itens[posicao].prioridade) break;
      [itens[pai], itens[posicao]] = [itens[posicao], itens[pai]];
      posicao = pai;
    }
  }

  remover(): { valor: T; prioridade: number } {
    const itens = this.itens;
    const menor = itens[0];
    const ultimo = itens.pop()!;
    if (itens.length) {
      itens[0] = ultimo;
      let posicao = 0;
      for (;;) {
        const esquerda = 2 * posicao + 1;
        const direita = esquerda + 1;
        let escolhido = posicao;
        if (esquerda < itens.length && itens[esquerda].prioridade < itens[escolhido].prioridade)
          escolhido = esquerda;
        if (direita < itens.length && itens[direita].prioridade < itens[escolhido].prioridade)
          escolhido = direita;
        if (escolhido === posicao) break;
        [itens[escolhido], itens[posicao]] = [itens[posicao], itens[escolhido]];
        posicao = escolhido;
      }
    }
    return menor;
  }
}
