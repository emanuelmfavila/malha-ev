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

/** Duração em horas escrita como "55 min", "2 h 10" ou "7 h". */
export function formatarDuracao(horas: number): string {
  if (!Number.isFinite(horas)) return '—';
  const minutos = Math.round(horas * 60);
  if (minutos < 60) return `${minutos} min`;
  const inteiras = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${inteiras} h ${String(resto).padStart(2, '0')}` : `${inteiras} h`;
}

/** Rótulo curto de peso para o mapa: "17", "55m" ou "1h20". */
export function rotuloDePeso(horas: number): string {
  const minutos = Math.round(horas * 60);
  if (minutos % 60 === 0) return String(minutos / 60);
  if (minutos < 60) return `${minutos}m`;
  return `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, '0')}`;
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
