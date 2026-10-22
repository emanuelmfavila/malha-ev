import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Malha } from '@/nucleo/malha';
import { Simulacao } from '@/nucleo/simulacao';
import { Estatisticas } from '@/nucleo/estatisticas';
import { AlgoritmosDeBusca } from '@/nucleo/algoritmos';
import { CriteriosDeCusto } from '@/nucleo/criterios';
import { Cenarios } from '@/nucleo/cenarios';
import { BATERIA_CHEIA } from '@/nucleo/constantes';
import {
  CIDADES,
  CONSUMO_NA_REGIAO,
  ESTRADAS,
  KM_POR_UNIDADE_DE_MUNDO,
  RECARGA_RAPIDA_H,
  indicePorSigla,
  montarRegiaoSudeste,
  sortearViagemNaRegiao,
} from '@/nucleo/regiaoSudeste';
import { criarGeradorAleatorio } from '@/nucleo/aleatorio';

const peso = CriteriosDeCusto.porId.peso;
const dijkstra = AlgoritmosDeBusca.porId.dijkstra;
const estrela = AlgoritmosDeBusca.porId.estrela;

describe('cenário de região: corredor Sudeste', () => {
  beforeEach(() => {
    montarRegiaoSudeste();
    Malha.nos.forEach((no) => (no.posto = null));
  });

  it('monta uma cidade por nó e uma aresta por rodovia, com peso em horas de viagem', () => {
    expect(Malha.nos).toHaveLength(CIDADES.length);
    expect(Malha.arestas).toHaveLength(ESTRADAS.length);
    for (const [de, para, minutos] of ESTRADAS)
      expect(Malha.arestaEntre(indicePorSigla.get(de)!, indicePorSigla.get(para)!)!.peso).toBeCloseTo(minutos / 60, 9);
  });

  it('deixa toda cidade alcançável a partir de qualquer outra', () => {
    for (let a = 0; a < Malha.nos.length; a++)
      for (let b = 0; b < Malha.nos.length; b++)
        if (a !== b) expect(dijkstra.buscar(a, b, peso)).not.toBeNull();
  });

  /* As coordenadas vêm de latitude e longitude esticadas, não da geometria que
     gerou os pesos. A heurística continua admissível porque usa a menor razão
     peso/comprimento da malha: os dois algoritmos precisam empatar em custo. */
  it('mantém o A* ótimo com coordenadas geográficas', () => {
    for (let a = 0; a < Malha.nos.length; a++)
      for (let b = a + 1; b < Malha.nos.length; b++)
        expect(estrela.buscar(a, b, peso)!.custo).toBe(dijkstra.buscar(a, b, peso)!.custo);
  });

  it('São Paulo–Rio leva mais de 6 h e não cabe numa carga de 4 h 10', () => {
    const horas = dijkstra.buscar(indicePorSigla.get('SP')!, indicePorSigla.get('RIO')!, peso)!.custo;
    expect(horas).toBeGreaterThan(6);
    expect(horas * CONSUMO_NA_REGIAO).toBeGreaterThan(BATERIA_CHEIA);
  });

  it('com bateria configurada para 200 pontos, São Paulo–Rio vai direto', () => {
    Malha.configurarPostos(Malha.nos.length, 4, RECARGA_RAPIDA_H);
    Object.assign(Simulacao.configuracao, {
      bateriaCheia: 200, consumoPorHora: CONSUMO_NA_REGIAO, reserva: 10, limiarDeRecarga: 0, chegadasAutomaticas: false,
    });
    Simulacao.reiniciar();
    const carro = Simulacao.colocarCarro(indicePorSigla.get('SP')!, indicePorSigla.get('RIO')!, 200)!;
    expect(carro.bateria).toBe(200);
    for (let k = 0; k < 400; k++) Simulacao.avancar(0.05);
    expect(carro.situacao).toBe('chegou');
    expect(carro.recargasFeitas).toBe(0);
    expect(carro.bateriaGasta).toBeCloseTo(carro.pesoPercorrido * CONSUMO_NA_REGIAO, 6);
    Object.assign(Simulacao.configuracao, { bateriaCheia: BATERIA_CHEIA, consumoPorHora: 1 });
  });

  it('registra o cenário com 4 vagas e recarga de 50 min', () => {
    const cenario = Cenarios.porId.sudeste;
    expect(cenario.postos.vagas).toBe(4);
    expect(cenario.postos.horasDeRecarga).toBeCloseTo(50 / 60, 9);
    expect(cenario.consumoPorHora).toBe(24);
    expect(cenario.bateriaCheia / cenario.consumoPorHora).toBeCloseTo(4.1667, 3); // 4 h 10 de autonomia
    expect(cenario.nomeCompleto(Malha.nos[indicePorSigla.get('CAM')!])).toBe('Campinas');
    expect(Malha.nos[indicePorSigla.get('SP')!].nome).toBe('São Paulo');
  });

  it('coloca as cidades em posições proporcionais às distâncias reais', () => {
    const sp = Malha.nos[indicePorSigla.get('SP')!];
    const rio = Malha.nos[indicePorSigla.get('RIO')!];
    const cam = Malha.nos[indicePorSigla.get('CAM')!];
    const kmSpRio = Math.hypot(sp.x - rio.x, sp.y - rio.y) * KM_POR_UNIDADE_DE_MUNDO;
    const kmSpCam = Math.hypot(sp.x - cam.x, sp.y - cam.y) * KM_POR_UNIDADE_DE_MUNDO;
    expect(kmSpRio).toBeGreaterThan(340); // em linha reta são cerca de 360 km
    expect(kmSpRio).toBeLessThan(380);
    expect(kmSpCam).toBeGreaterThan(70); // cerca de 85 km
    expect(kmSpCam).toBeLessThan(100);
  });

  it('sorteia viagens com origem e destino diferentes e bateria entre 40 e 100', () => {
    const sortear = criarGeradorAleatorio(3);
    for (let k = 0; k < 500; k++) {
      const viagem = sortearViagemNaRegiao(sortear);
      expect(viagem.origem).not.toBe(viagem.destino);
      expect(viagem.bateria).toBeGreaterThanOrEqual(40);
      expect(viagem.bateria).toBeLessThanOrEqual(100);
    }
  });
});

describe('planejador com cadeia de postos', () => {
  beforeEach(() => {
    montarRegiaoSudeste();
    Object.assign(Simulacao.configuracao, {
      algoritmo: 'dijkstra', criterio: 'peso', bateriaCheia: BATERIA_CHEIA, consumoPorHora: CONSUMO_NA_REGIAO,
      reserva: 10, limiarDeRecarga: 30, pesoDaFila: 0.35, chegadasAutomaticas: false,
    });
  });
  afterEach(() => {
    Simulacao.configuracao.consumoPorHora = 1;
  });

  const rodar = (horas: number) => {
    for (let k = 0; k < horas / 0.05; k++) Simulacao.avancar(0.05);
  };

  /* O caso que revelou o defeito: com postos só no lado paulista, de nenhum deles
     dá para chegar ao Rio. O carro deve sair declarando a pane, não quicar entre
     Campinas e São Paulo recarregando para sempre. */
  it('não quica entre postos de onde o destino é inalcançável', () => {
    Malha.configurarPostos(4, 4, RECARGA_RAPIDA_H); // Campinas, São Paulo, São Carlos, Sorocaba
    Simulacao.reiniciar();
    const carro = Simulacao.colocarCarro(indicePorSigla.get('CAM')!, indicePorSigla.get('RIO')!, BATERIA_CHEIA)!;
    rodar(100);
    expect(carro.recargasFeitas).toBeLessThanOrEqual(1);
    expect(carro.situacao).toBe('falhou');
    expect(Estatisticas.saidasArriscadas).toBeGreaterThanOrEqual(1);
  });

  it('chega ao Rio encadeando postos quando toda cidade tem um', () => {
    Malha.configurarPostos(Malha.nos.length, 4, RECARGA_RAPIDA_H);
    Simulacao.reiniciar();
    const carro = Simulacao.colocarCarro(indicePorSigla.get('CAM')!, indicePorSigla.get('RIO')!, BATERIA_CHEIA)!;
    rodar(100);
    expect(carro.situacao).toBe('chegou');
    expect(carro.recargasFeitas).toBeGreaterThanOrEqual(1);
    expect(carro.recargasFeitas).toBeLessThanOrEqual(2);
  });
});
