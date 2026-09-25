export const limitar = (valor: number, minimo: number, maximo: number): number =>
  valor < minimo ? minimo : valor > maximo ? maximo : valor;

export const formatar = (valor: number, casas = 1): string => Number(valor).toFixed(casas);

/** Relógio em horas simuladas, mostrado como "2d 07:30". */
export function formatarRelogio(horas: number): string {
  const dias = Math.floor(horas / 24);
  const restoDeHoras = Math.floor(horas % 24);
  const minutos = Math.floor((horas % 1) * 60);
  return (
    (dias ? dias + 'd ' : '') +
    String(restoDeHoras).padStart(2, '0') +
    ':' +
    String(minutos).padStart(2, '0')
  );
}

/** Relógio em tempo real quando uma unidade vale N minutos: "dia 2, 14:35". */
export function formatarRelogioReal(unidades: number, minutosPorUnidade: number): string {
  const minutos = unidades * minutosPorUnidade;
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const resto = Math.floor(minutos % 60);
  return `dia ${dias + 1}, ${String(horas).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}

/** Duração em unidades do modelo lida na escala do cenário: "55 min", "2 h 10" ou "7 h". */
export function formatarDuracao(unidades: number, minutosPorUnidade: number | null, casas = 0): string {
  if (minutosPorUnidade === null) return `${formatar(unidades, casas)} h`;
  const minutos = Math.round(unidades * minutosPorUnidade);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${String(resto).padStart(2, '0')}` : `${horas} h`;
}

/** Emissor de eventos simples: desacopla o motor do desenho e da interface. */
export function criarEmissorDeEventos<Mapa extends Record<string, unknown>>() {
  const ouvintes: { [K in keyof Mapa]?: ((dados: Mapa[K]) => void)[] } = {};
  return {
    quando<K extends keyof Mapa>(nome: K, funcao: (dados: Mapa[K]) => void): void {
      (ouvintes[nome] ??= []).push(funcao);
    },
    emitir<K extends keyof Mapa>(nome: K, dados: Mapa[K]): void {
      ouvintes[nome]?.forEach((funcao) => funcao(dados));
    },
    limpar(): void {
      for (const chave of Object.keys(ouvintes)) delete ouvintes[chave as keyof Mapa];
    },
  };
}
