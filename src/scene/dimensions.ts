/**
 * Размерные линии 3D-сцены: ширина под фасадом, высота слева, глубина справа.
 * Тонкие линии с засечками и подписи-спрайты в стиле шампань.
 * Координаты — метры (детали шкафа приходят в мм, переводим здесь же).
 */
import * as THREE from 'three';
import { mm } from '../lib/format';

const MM = 0.001;
const LINE_COLOR = 0xd8c3a5;
const TEXT_COLOR = '#e8d6b8';
const FONT = '600 64px "Segoe UI", "Inter", system-ui, -apple-system, sans-serif';
const TICK = 0.034;
const LINE_OPACITY = 0.72;
const LABEL_OPACITY = 0.96;

export interface DimensionsHandle {
  group: THREE.Group;
  dispose: () => void;
}

/** Габариты в мм — всё, что нужно размерным линиям. */
export interface DimensionSize {
  width: number;
  height: number;
  depth: number;
}

type P3 = readonly [number, number, number];

export function createDimensions(size: DimensionSize): DimensionsHandle {
  const group = new THREE.Group();
  group.name = 'furniture-dimensions';

  const positions: number[] = [];
  const push = (a: P3, b: P3): void => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  };

  const W = size.width * MM;
  const H = size.height * MM;
  const D = size.depth * MM;
  const maxDim = Math.max(W, H, D);

  // отступы, чтобы линии не липли к корпусу и не прятались в стены ниши
  const frontZ = D + 0.075;
  const widthY = 0.012;
  const widthZ = frontZ + 0.2;
  const heightX = -W / 2 - 0.2;
  const heightZ = frontZ + 0.005;
  const depthX = W / 2 + 0.22;
  const depthY = 0.015;

  // ---------- ширина: перед фасадом, вдоль X ----------
  push([-W / 2, widthY, widthZ], [W / 2, widthY, widthZ]);
  for (const x of [-W / 2, W / 2]) {
    push([x - TICK, widthY, widthZ - TICK], [x + TICK, widthY, widthZ + TICK]);
    push([x, widthY, frontZ + 0.01], [x, widthY, widthZ + TICK]);
  }

  // ---------- высота: слева, вдоль Y ----------
  push([heightX, 0, heightZ], [heightX, H, heightZ]);
  for (const y of [0, H]) {
    push([heightX - TICK, y - TICK, heightZ], [heightX + TICK, y + TICK, heightZ]);
    push([-W / 2, y, heightZ], [heightX - TICK, y, heightZ]);
  }

  // ---------- глубина: справа, вдоль Z ----------
  push([depthX, depthY, 0], [depthX, depthY, D]);
  for (const z of [0, D]) {
    push([depthX, depthY - TICK, z - TICK], [depthX, depthY + TICK, z + TICK]);
    push([W / 2, depthY, z], [depthX + TICK, depthY, z]);
  }

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const lineMaterial = new THREE.LineBasicMaterial({
    color: LINE_COLOR,
    transparent: true,
    opacity: LINE_OPACITY,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
  lines.renderOrder = 5;
  group.add(lines);

  // ---------- подписи ----------
  const labelHeight = Math.min(0.135, Math.max(0.068, maxDim * 0.045));
  const textures: THREE.CanvasTexture[] = [];
  const materials: THREE.SpriteMaterial[] = [];

  const addLabel = (
    text: string,
    x: number,
    y: number,
    z: number,
    vertical = false,
  ): THREE.Sprite => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось создать 2D-контекст для размерной подписи');
    context.font = FONT;
    const textWidth = context.measureText(text).width;
    const padding = 68;

    if (vertical) {
      canvas.width = 108;
      canvas.height = Math.ceil(textWidth + padding);
    } else {
      canvas.width = Math.ceil(textWidth + padding);
      canvas.height = 108;
    }

    context.font = FONT;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = 'rgba(6, 5, 4, 0.72)';
    context.shadowBlur = 16;
    context.shadowOffsetY = 2;
    context.fillStyle = TEXT_COLOR;
    if (vertical) {
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(-Math.PI / 2);
      context.fillText(text, 0, 2);
    } else {
      context.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    textures.push(texture);

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      opacity: LABEL_OPACITY,
    });
    materials.push(material);

    const sprite = new THREE.Sprite(material);
    const aspect = canvas.width / canvas.height;
    if (vertical) sprite.scale.set(labelHeight, labelHeight / aspect, 1);
    else sprite.scale.set(labelHeight * aspect, labelHeight, 1);
    sprite.position.set(x, y, z);
    sprite.renderOrder = 6;
    group.add(sprite);
    return sprite;
  };

  // ширина — под линией, перед фасадом
  addLabel(mm(size.width), 0, widthY - labelHeight * 0.62, widthZ);
  // высота — вертикально, слева от линии
  const heightLabel = addLabel(mm(size.height), heightX, H * 0.5, heightZ, true);
  heightLabel.position.x = heightX - labelHeight * 0.85;
  // глубина — над линией у пола, справа
  addLabel(mm(size.depth), depthX, depthY + labelHeight * 0.62, D * 0.92);

  return {
    group,
    dispose: (): void => {
      lineGeometry.dispose();
      lineMaterial.dispose();
      for (const texture of textures) texture.dispose();
      for (const material of materials) material.dispose();
      group.clear();
    },
  };
}
