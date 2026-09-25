import { ALTURA_DO_MUNDO, LARGURA_DO_MUNDO } from '@/nucleo/constantes';
import { limitar } from '@/nucleo/utilidades';

export interface Ponto {
  x: number;
  y: number;
}

/** Converte entre as coordenadas do grafo e os pixels da tela, guardando o
    zoom e o deslocamento. Fica separada do desenho para poder ser testada. */
export class Camera {
  larguraCss = 0;
  alturaCss = 0;
  escalaAjuste = 1;
  zoom = 1;
  panX = 0;
  panY = 0;

  get escala(): number {
    return this.escalaAjuste * this.zoom;
  }

  redimensionar(largura: number, altura: number): void {
    this.larguraCss = largura;
    this.alturaCss = altura;
    this.escalaAjuste = Math.min((largura - 90) / LARGURA_DO_MUNDO, (altura - 90) / ALTURA_DO_MUNDO);
  }

  enquadrar(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  aplicarZoom(fator: number, telaX?: number, telaY?: number): void {
    const centroX = telaX ?? this.larguraCss / 2;
    const centroY = telaY ?? this.alturaCss / 2;
    const antes = this.paraMundo(centroX, centroY);
    this.zoom = limitar(this.zoom * fator, 0.5, 7);
    const depois = this.paraMundo(centroX, centroY);
    this.panX += (depois.x - antes.x) * this.escala;
    this.panY += (depois.y - antes.y) * this.escala;
  }

  arrastar(deltaX: number, deltaY: number): void {
    this.panX += deltaX;
    this.panY += deltaY;
  }

  paraTelaX(x: number): number {
    return (x - LARGURA_DO_MUNDO / 2) * this.escala + this.larguraCss / 2 + this.panX;
  }
  paraTelaY(y: number): number {
    return (y - ALTURA_DO_MUNDO / 2) * this.escala + this.alturaCss / 2 + this.panY;
  }
  paraMundo(telaX: number, telaY: number): Ponto {
    return {
      x: (telaX - this.larguraCss / 2 - this.panX) / this.escala + LARGURA_DO_MUNDO / 2,
      y: (telaY - this.alturaCss / 2 - this.panY) / this.escala + ALTURA_DO_MUNDO / 2,
    };
  }
}
