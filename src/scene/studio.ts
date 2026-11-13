/**
 * Свет и «заземление» шкафа в 3D.
 *
 * Намеренно НЕ рисуем пол, стены и потолок: любые такие плоскости при вращении
 * камеры дают видимые границы и пятна (круги/квадраты). Остаются только
 * тёплый студийный свет и мягкая тень под шкафом — она и держит его на месте.
 * Мир — метры, шкаф приходит из layout в миллиметрах.
 */
import * as THREE from 'three';

const MM = 0.001;

/** Радиальная canvas-текстура для мягкой контактной тени. */
function radialTexture(size: number, stops: Array<[number, string]>): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Не удалось создать 2D-контекст для текстуры студии');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export class CabinetStudio {
  readonly root = new THREE.Group();

  private readonly unitPlane = new THREE.PlaneGeometry(1, 1);
  private readonly contactTexture: THREE.CanvasTexture;
  private readonly contactMaterial: THREE.MeshBasicMaterial;
  private readonly contactShadow: THREE.Mesh;
  private readonly shadowMaterial: THREE.ShadowMaterial;
  private readonly shadowCatcher: THREE.Mesh;

  private readonly lights = new THREE.Group();
  private readonly hemi: THREE.HemisphereLight;
  private readonly key: THREE.SpotLight;
  private readonly fill: THREE.DirectionalLight;
  private readonly rim: THREE.DirectionalLight;
  private readonly interior: THREE.PointLight[] = [];

  constructor() {
    this.contactTexture = radialTexture(512, [
      [0, 'rgba(0, 0, 0, 0.72)'],
      [0.42, 'rgba(0, 0, 0, 0.34)'],
      [0.72, 'rgba(0, 0, 0, 0.1)'],
      [1, 'rgba(0, 0, 0, 0)'],
    ]);
    this.contactMaterial = new THREE.MeshBasicMaterial({
      map: this.contactTexture,
      color: 0x000000,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.8,
    });
    this.contactShadow = new THREE.Mesh(this.unitPlane, this.contactMaterial);
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.renderOrder = 2;
    this.root.add(this.contactShadow);

    // Ловушка теней: сама поверхность прозрачна, видна только падающая тень.
    this.shadowMaterial = new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.34 });
    this.shadowCatcher = new THREE.Mesh(this.unitPlane, this.shadowMaterial);
    this.shadowCatcher.rotation.x = -Math.PI / 2;
    this.shadowCatcher.receiveShadow = true;
    this.shadowCatcher.renderOrder = 1;
    this.root.add(this.shadowCatcher);

    this.hemi = new THREE.HemisphereLight(0xfff8f0, 0x2b2621, 0.5);
    // мягкий «софтбокс»: падение по расстоянию даёт градиент на белых панелях
    this.key = new THREE.SpotLight(0xfff8f0, 24, 0, 0.62, 0.85, 2);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.005;
    this.key.shadow.radius = 3;
    this.key.shadow.camera.near = 0.5;
    this.key.shadow.camera.far = 40;
    this.fill = new THREE.DirectionalLight(0xe4e9f0, 0.6);
    this.rim = new THREE.DirectionalLight(0xffd6a2, 0.8);

    this.lights.add(this.hemi, this.key, this.key.target, this.fill, this.fill.target, this.rim, this.rim.target);
    this.root.add(this.lights);
  }

  update(lighting: boolean, size: { width: number; height: number; depth: number }): void {
    const W = size.width * MM;
    const H = size.height * MM;
    const D = size.depth * MM;
    const maxDim = Math.max(W, H, D, 0.6);
    const center = new THREE.Vector3(0, H / 2, D / 2);

    // тень под шкафом
    this.shadowCatcher.scale.set(maxDim * 9, maxDim * 9, 1);
    this.shadowCatcher.position.set(0, 0, D / 2);
    this.contactShadow.scale.set(W * 1.55, D * 2.1, 1);
    this.contactShadow.position.set(0, 0.0025, D * 0.45);

    // ---------- свет ----------
    // ключевой — мягкий «софтбокс» сверху-спереди: падение по расстоянию даёт
    // лёгкий градиент на белых панелях, правый бок остаётся в полутени.
    this.key.position.set(
      center.x + maxDim * 0.55,
      center.y + maxDim * 0.9,
      D + maxDim * 0.85,
    );
    this.key.target.position.copy(center);
    this.key.target.updateMatrixWorld();
    this.key.intensity = 22 * Math.pow(maxDim / 2.6, 2);
    const shadowCamera = this.key.shadow.camera;
    shadowCamera.near = 0.3;
    shadowCamera.far = maxDim * 8 + 5;
    shadowCamera.updateProjectionMatrix();

    // заполняющий — слева-спереди, чуть холоднее, поднимает тени
    this.fill.position.set(center.x - maxDim * 1.7, center.y + maxDim * 0.25, D + maxDim * 1.1);
    this.fill.target.position.copy(center);
    this.fill.target.updateMatrixWorld();

    // контровой — сзади-справа, тонкий край и блик на кромках
    this.rim.position.set(center.x + maxDim * 1.3, center.y + maxDim * 0.85, -maxDim * 1.15);
    this.rim.target.position.copy(center);
    this.rim.target.updateMatrixWorld();

    this.syncInterior(lighting, size);
  }

  /** Тёплые точки внутри, чтобы полки и подсветка читались. */
  private syncInterior(lighting: boolean, size: { width: number; height: number; depth: number }): void {
    for (const light of this.interior) {
      this.lights.remove(light);
      light.dispose();
    }
    this.interior.length = 0;
    if (!lighting) return;

    const W = size.width * MM;
    const H = size.height * MM;
    const D = size.depth * MM;
    if (H < 0.9) return;

    const count = Math.max(1, Math.min(4, Math.round(W / 0.5)));
    const y = Math.max(0.55, H - 0.2);
    for (let i = 0; i < count; i += 1) {
      const x = (-W / 2 + ((i + 0.5) * W) / count) * 0.9;
      const light = new THREE.PointLight(0xffd7a0, 0.16, 1.7, 2);
      light.position.set(x, y, D * 0.58);
      light.castShadow = false;
      this.lights.add(light);
      this.interior.push(light);
    }
  }

  dispose(): void {
    for (const light of this.interior) light.dispose();
    this.interior.length = 0;
    this.hemi.dispose();
    this.key.dispose();
    this.fill.dispose();
    this.rim.dispose();
    this.unitPlane.dispose();
    this.contactTexture.dispose();
    this.contactMaterial.dispose();
    this.shadowMaterial.dispose();
    this.root.clear();
  }
}
