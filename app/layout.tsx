import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Malha EV, simulador de carros elétricos',
  description:
    'Simulador visual de carros elétricos sobre grafo, com Dijkstra e A*, postos de recarga com fila e explicação das decisões.',
};

export default function LayoutRaiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
