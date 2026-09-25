import {
  ALTURA_DO_MUNDO,
  ESCALA_DE_PESO,
  HORAS_DE_RECARGA,
  LARGURA_DO_MUNDO,
  PESO_MAXIMO,
  PESO_MINIMO,
  VAGAS_POR_POSTO,
} from './constantes';
import { numeroEntre, semear } from './aleatorio';
import { limitar } from './utilidades';
import type { Aresta, Ligacao, No } from './tipos';

/** O grafo. Não sabe nada de carros, de tempo nem de desenho. */
export const Malha = {
  nos: [] as No[],
  arestas: [] as Aresta[],
  adjacencia: [] as Ligacao[][],

  /* Menor razão peso/comprimento entre todas as arestas. É o fator que mantém a
     estimativa do A* admissível mesmo depois de o peso ser editado à mão: como
     nenhuma aresta custa menos que comprimento × esta razão, a distância em
     linha reta multiplicada por ela nunca passa do custo real do caminho. */
  menorRazaoDePeso: 1 / ESCALA_DE_PESO,

  atualizarRazaoDePeso(): void {
    let menor = Infinity;
    for (const aresta of this.arestas) {
      const comprimento = this.distanciaEmLinhaReta(aresta.de, aresta.para);
      if (comprimento > 0) menor = Math.min(menor, aresta.peso / comprimento);
    }
    this.menorRazaoDePeso = Number.isFinite(menor) ? menor : 1 / ESCALA_DE_PESO;
  },

  nomeDoNo(indice: number): string {
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return indice < 26 ? letras[indice] : letras[Math.floor(indice / 26) - 1] + letras[indice % 26];
  },

  gerar(quantidadeDeNos: number, rotasExtras: number, semente: number) {
    semear(semente);
    this.nos = [];
    this.arestas = [];
    this.adjacencia = [];

    /* Pontos espalhados, com espaçamento mínimo entre eles. Quando o espaço
       aperta, o espaçamento cede aos poucos, então a quantidade pedida é sempre
       alcançada, sem virar laço infinito. */
    let espacamentoMinimo = Math.sqrt((LARGURA_DO_MUNDO * ALTURA_DO_MUNDO) / quantidadeDeNos) * 0.78;
    let tentativasSemSucesso = 0;
    while (this.nos.length < quantidadeDeNos) {
      const x = numeroEntre(40, LARGURA_DO_MUNDO - 40);
      const y = numeroEntre(40, ALTURA_DO_MUNDO - 40);
      const distante = this.nos.every(
        (no) => (no.x - x) ** 2 + (no.y - y) ** 2 > espacamentoMinimo ** 2
      );
      if (distante) {
        this.nos.push({
          indice: this.nos.length,
          x,
          y,
          nome: this.nomeDoNo(this.nos.length),
          posto: null,
        });
        tentativasSemSucesso = 0;
      } else if (++tentativasSemSucesso > 600) {
        espacamentoMinimo *= 0.85;
        tentativasSemSucesso = 0;
      }
    }
    this.adjacencia = this.nos.map(() => [] as Ligacao[]);

    // árvore geradora mínima: garante que todo nó é alcançável
    const jaNaArvore = new Uint8Array(this.nos.length);
    jaNaArvore[0] = 1;
    for (let passo = 1; passo < this.nos.length; passo++) {
      let melhorDe = -1;
      let melhorPara = -1;
      let melhorDistancia = Infinity;
      for (let de = 0; de < this.nos.length; de++) {
        if (!jaNaArvore[de]) continue;
        for (let para = 0; para < this.nos.length; para++) {
          if (jaNaArvore[para]) continue;
          const distancia = this.distanciaEmLinhaReta(de, para);
          if (distancia < melhorDistancia) {
            melhorDistancia = distancia;
            melhorDe = de;
            melhorPara = para;
          }
        }
      }
      this.conectar(melhorDe, melhorPara);
      jaNaArvore[melhorPara] = 1;
    }

    // rotas extras, sempre entre os pares mais próximos ainda desconectados
    const candidatos: { de: number; para: number; distancia: number }[] = [];
    for (let de = 0; de < this.nos.length; de++)
      for (let para = de + 1; para < this.nos.length; para++)
        if (!this.existeAresta(de, para))
          candidatos.push({ de, para, distancia: this.distanciaEmLinhaReta(de, para) });
    candidatos.sort((a, b) => a.distancia - b.distancia);
    for (let k = 0; k < Math.min(rotasExtras, candidatos.length); k++)
      this.conectar(candidatos[k].de, candidatos[k].para);

    this.atualizarRazaoDePeso();
    return this;
  },

  distanciaEmLinhaReta(indiceA: number, indiceB: number): number {
    const a = this.nos[indiceA];
    const b = this.nos[indiceB];
    return Math.hypot(a.x - b.x, a.y - b.y);
  },

  existeAresta(indiceA: number, indiceB: number): boolean {
    return this.adjacencia[indiceA].some((ligacao) => ligacao.destino === indiceB);
  },

  arestaEntre(indiceA: number, indiceB: number): Aresta | undefined {
    return this.adjacencia[indiceA].find((ligacao) => ligacao.destino === indiceB)?.aresta;
  },

  /* O peso é o comprimento na tela dividido pela escala, arredondado para cima.
     Arredondar para cima é o que mantém o peso sempre maior ou igual ao
     comprimento real, e é disso que a heurística do A* depende para continuar
     admissível e devolver o mesmo caminho ótimo do Dijkstra. */
  conectar(indiceA: number, indiceB: number): Aresta {
    const comprimento = this.distanciaEmLinhaReta(indiceA, indiceB);
    const peso = Math.max(1, Math.ceil(comprimento / ESCALA_DE_PESO));
    const aresta: Aresta = { indice: this.arestas.length, de: indiceA, para: indiceB, peso };
    this.arestas.push(aresta);
    this.adjacencia[indiceA].push({ destino: indiceB, aresta });
    this.adjacencia[indiceB].push({ destino: indiceA, aresta });
    return aresta;
  },

  /** Muda o peso de uma aresta à mão. Devolve o valor que realmente ficou,
      arredondado ao minuto e dentro da faixa. Como o peso é o tempo de viagem
      e a bateria cai por hora, mexer aqui muda as duas coisas de uma vez. */
  definirPeso(indiceDaAresta: number, peso: number): number {
    const aresta = this.arestas[indiceDaAresta];
    if (!aresta) return 0;
    aresta.peso = limitar(Math.round(peso * 60) / 60, PESO_MINIMO, PESO_MAXIMO);
    this.atualizarRazaoDePeso();
    return aresta.peso;
  },

  /** Todo posto é igual: mesmas vagas, mesmo tempo de recarga e sempre até
      encher. Só a quantidade varia. Postos vão para os nós mais conectados. */
  configurarPostos(quantidade: number, vagas = VAGAS_POR_POSTO, horasDeRecarga = HORAS_DE_RECARGA): void {
    const porConectividade = this.nos
      .map((no) => no.indice)
      .sort((a, b) => this.adjacencia[b].length - this.adjacencia[a].length);
    this.nos.forEach((no) => (no.posto = null));
    for (let k = 0; k < limitar(quantidade, 0, this.nos.length); k++) {
      this.nos[porConectividade[k]].posto = {
        vagas,
        horasDeRecarga,
        vagasOcupadas: new Array(vagas).fill(null),
        fila: [],
        horasDeVagaOcupada: 0,
        recargasConcluidas: 0,
        maiorFila: 0,
      };
    }
  },

  nosComPosto(): No[] {
    return this.nos.filter((no) => no.posto);
  },
};
