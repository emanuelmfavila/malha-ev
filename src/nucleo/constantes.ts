export const LARGURA_DO_MUNDO = 1000;
export const ALTURA_DO_MUNDO = 680;

/** Unidades de tela que valem um ponto de peso. Calibrado para que os pesos
    fiquem grandes o bastante em relação à bateria de 100 pontos: assim parar
    para recarregar é uma decisão frequente, não um detalhe raro. */
export const ESCALA_DE_PESO = 14;

/** Faixa em que o peso de uma aresta (horas de viagem) pode ser editado à mão
    no mapa. O peso é guardado com precisão de minuto. */
export const PESO_MINIMO = 0.1;
export const PESO_MAXIMO = 99;

export const BATERIA_CHEIA = 100;
/** Pontos de bateria gastos por hora de viagem. Com 1, peso = horas = bateria,
    a regra da malha aleatória; a região usa 24 (100 pontos = 4 h 10 de estrada). */
export const CONSUMO_POR_HORA = 1;
export const VAGAS_POR_POSTO = 1;
export const HORAS_DE_RECARGA = 4;

/** De quanto em quanto tempo simulado o histórico de ocupação é amostrado. */
export const INTERVALO_DE_AMOSTRA_H = 1;
export const MAXIMO_DE_AMOSTRAS = 240;
export const MAXIMO_DE_ENTRADAS_NO_DIARIO = 26;
