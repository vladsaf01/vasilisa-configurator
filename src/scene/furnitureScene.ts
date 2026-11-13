/**
 * 3D-сцена мебели «Василиса»: рендерер, камера с ракурсами, сборка корпуса
 * из готового списка деталей, распахивание створок, размерные линии и скриншот.
 *
 * Мир — метры. Детали приходят в миллиметрах и живут в группе с масштабом
 * 0.001, поэтому координаты из buildParts используются как есть. Сцена не знает,
 * шкаф это или комод — она рисует SceneModel.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DOOR_GAP, DOOR_T } from '../lib/model';
import { doorMaterialFor, resolveMaterials, type MaterialKey, type MaterialSpec } from '../lib/materials';
import type { SceneModel } from '../lib/scene-model';
import type { ViewPreset } from '../lib/ui-contract';
import type { Part, PartRole } from '../lib/parts';
import { analyzeDrawerAccess, type DoorSide, type DrawerAccess, type DrawerRect } from '../lib/access';
import { createDimensions, type DimensionsHandle } from './dimensions';
import { CabinetStudio } from './studio';

const MM = 0.001;
const CAMERA_FOV = 34;
const CAMERA_NEAR = 0.05;
const CAMERA_FAR = 90;
const SHOT_BACKDROP = 0x171613;
const VIEW_TWEEN_MS = 640;
const DOORS_TWEEN_MS = 320;
const DRAWERS_TWEEN_MS = 420;
// 96°, а не 76°: при меньшем угле открытая створка перекрывает путь ящику
const HINGED_OPEN_ANGLE = (96 * Math.PI) / 180;

/** Направления «от центра шкафа к камере» для штатных ракурсов. */
const VIEW_DIRECTION: Record<ViewPreset, THREE.Vector3> = {
  hero: new THREE.Vector3(1.15, 0.32, 1).normalize(),
  front: new THREE.Vector3(0.05, 0.08, 1).normalize(),
  side: new THREE.Vector3(1, 0.16, 0.1).normalize(),
};

/** Запас кадра по краям: меньше — крупнее объект. */
const VIEW_MARGIN: Record<ViewPreset, number> = {
  hero: 0.95,
  front: 0.84,
  side: 0.9,
};

interface CameraTween {
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  startedAt: number;
  duration: number;
}

interface HingedRig {
  kind: 'hinged';
  pivot: THREE.Group;
  angle: number;
}

interface SlidingRig {
  kind: 'sliding';
  items: Array<{ object: THREE.Object3D; baseX: number }>;
  dx: number;
  leafIndex: number;
}

type DoorRig = HingedRig | SlidingRig;

/** Все детали одного ящика: двигаются одним смещением по Z. */
interface DrawerGroup {
  parts: Array<{ object: THREE.Object3D; baseZ: number }>;
  /** зона фасада ящика — по ней считаем доступ */
  front: DrawerRect | null;
  /** двери закрывают ящик — выдвигать можно только после открытия */
  needsDoor: boolean;
  /** створка-купе остаётся перед ящиком даже в открытом положении */
  blocked: boolean;
}

/** Петля распашной двери комода/тумбы: общая группа деталей полотна. */
interface DoorGroupMeta {
  hingeX: number;
  /** z-плоскость дверного полотна — от неё считаются локальные z детей */
  leafZ: number;
  angle: number;
}

export interface FurnitureSceneOptions {
  host: HTMLElement;
  model: SceneModel;
  view: ViewPreset;
  showDimensions: boolean;
  doorsOpen?: boolean;
  drawersOpen?: boolean;
  /** выбранная сторона створок-купе; null — автоматически */
  doorSide?: DoorSide | null;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const DRAWER_ROLES: ReadonlySet<PartRole> = new Set<PartRole>([
  'drawerFront',
  'drawerSide',
  'drawerBack',
  'drawerBottom',
  'drawerHandle',
]);

function isDrawerPart(role: PartRole): boolean {
  return DRAWER_ROLES.has(role);
}

export class FurnitureScene {
  private readonly host: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly studio: CabinetStudio;
  private readonly cabinet = new THREE.Group();
  private readonly materials = new Map<MaterialKey, THREE.Material>();
  private readonly extraMaterials: THREE.Material[] = [];
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private readonly usedGeometries = new Set<string>();
  private readonly rodGeometry: THREE.CylinderGeometry;
  private readonly envTexture: THREE.Texture;
  private readonly resizeObserver: ResizeObserver;

  private model: SceneModel;
  private preset: ViewPreset;
  private dimensionsVisible: boolean;
  private dimensions: DimensionsHandle;
  private dimensionsKey: string;

  private readonly doorRigs: DoorRig[] = [];
  private doorsProgress: number;
  private doorsAnim: { from: number; to: number; startedAt: number } | null = null;

  /** выдвижные ящики: все детали одного ящика двигаются вместе */
  private readonly drawerGroups: DrawerGroup[] = [];
  private drawerPull = 0;
  private drawersProgress: number;
  private drawersAnim: { from: number; to: number; startedAt: number } | null = null;
  /** сторона, к которой собираются створки-купе; null — автоматически */
  private doorSide: DoorSide | null;
  /** зоны фасадов ящиков — для пересчёта доступа при смене стороны створок */
  private drawerRects: DrawerRect[] = [];

  private userMoved = false;
  private tween: CameraTween | null = null;
  private frameId = 0;
  private contextLost = false;
  private disposed = false;

  private readonly handleControlsStart = (): void => {
    this.tween = null;
    this.userMoved = true;
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
  };

  private readonly handleContextRestored = (): void => {
    this.contextLost = false;
  };

  /** Занять кадр под штатный ракурс. */
  readonly setView = (preset: ViewPreset): void => {
    if (this.disposed) return;
    this.preset = preset;
    this.userMoved = false;
    this.applyView(preset, true);
  };

  /** Плавно распахнуть/закрыть створки, не пересобирая сцену. */
  readonly setDoorsOpen = (open: boolean): void => {
    if (this.disposed) return;
    const target = open ? 1 : 0;
    if (this.doorsAnim === null && Math.abs(this.doorsProgress - target) < 0.001) return;
    this.doorsAnim = { from: this.doorsProgress, to: target, startedAt: performance.now() };
  };

  /** Плавно выдвинуть/задвинуть ящики. */
  readonly setDrawersOpen = (open: boolean): void => {
    if (this.disposed) return;
    const target = open ? 1 : 0;
    if (this.drawersAnim === null && Math.abs(this.drawersProgress - target) < 0.001) return;
    this.drawersAnim = { from: this.drawersProgress, to: target, startedAt: performance.now() };
  };

  /** Переставить створки-купе к другой стороне проёма (null — автоматически). */
  readonly setDoorSide = (side: DoorSide | null): void => {
    if (this.disposed || this.doorSide === side) return;
    this.doorSide = side;
    this.refreshDoorAccess();
  };

  /** PNG текущего кадра или null, если контекст потерян. */
  readonly screenshot = (): string | null => {
    if (this.disposed || this.contextLost) return null;
    const renderer = this.renderer;
    const canvas = renderer.domElement;
    if (canvas.width < 2 || canvas.height < 2) return null;
    const gl = renderer.getContext();
    if (!gl || gl.isContextLost()) return null;

    const size = renderer.getSize(new THREE.Vector2());
    const ratio = renderer.getPixelRatio();
    try {
      renderer.setPixelRatio(2);
      renderer.setSize(size.x, size.y, false);
      renderer.setClearColor(SHOT_BACKDROP, 1);
      renderer.render(this.scene, this.camera);
      const data = canvas.toDataURL('image/png');
      return data.startsWith('data:image/png') ? data : null;
    } catch {
      return null;
    } finally {
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(ratio);
      renderer.setSize(size.x, size.y, false);
    }
  };

  constructor(options: FurnitureSceneOptions) {
    this.host = options.host;
    this.model = options.model;
    this.preset = options.view;
    this.dimensionsVisible = options.showDimensions;
    this.doorsProgress = options.doorsOpen ? 1 : 0;
    this.drawersProgress = options.drawersOpen ? 1 : 0;
    this.doorSide = options.doorSide ?? null;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);

    const canvas = this.renderer.domElement;
    canvas.className = 'scene-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
    this.camera.position.set(0.6, 1.4, 4);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.75;
    this.controls.zoomSpeed = 0.9;
    this.controls.minPolarAngle = 0.55;
    this.controls.maxPolarAngle = 1.52;
    this.controls.addEventListener('start', this.handleControlsStart);

    this.rodGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1);
    this.rodGeometry.rotateZ(Math.PI / 2);

    this.cabinet.scale.setScalar(MM);
    this.scene.add(this.cabinet);

    this.studio = new CabinetStudio();
    this.scene.add(this.studio.root);

    this.envTexture = this.createEnvironment();

    this.rebuildCabinet();
    this.studio.update(this.model.lighting, this.model);

    this.dimensions = createDimensions(this.model);
    this.dimensionsKey = this.dimensionSignature();
    this.dimensions.group.visible = this.dimensionsVisible;
    this.scene.add(this.dimensions.group);

    this.resize();
    this.applyView(this.preset, false);
    this.applyDoorPose();
    this.applyDrawerPose();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);

    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.host.appendChild(canvas);
    this.frameId = requestAnimationFrame(this.tick);
  }

  // ---------- обновление ----------

  update = (model: SceneModel): void => {
    if (this.disposed) return;
    if (model === this.model) return;
    this.model = model;
    this.rebuildCabinet();
    this.studio.update(model.lighting, model);
    this.rebuildDimensions();
    if (!this.userMoved) this.applyView(this.preset, false);
    else this.refit(false);
  };

  setShowDimensions = (visible: boolean): void => {
    if (this.disposed || visible === this.dimensionsVisible) return;
    this.dimensionsVisible = visible;
    this.dimensions.group.visible = visible;
    if (!this.userMoved) this.applyView(this.preset, false);
    else this.refit(false);
  };

  // ---------- жизненный цикл ----------

  private readonly tick = (): void => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.tick);
    const now = performance.now();

    const tween = this.tween;
    if (tween) {
      const t = Math.min(1, (now - tween.startedAt) / tween.duration);
      const k = easeInOutCubic(t);
      this.camera.position.lerpVectors(tween.fromPosition, tween.toPosition, k);
      this.controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
      if (t >= 1) this.tween = null;
    }

    const doorsAnim = this.doorsAnim;
    if (doorsAnim) {
      const t = Math.min(1, (now - doorsAnim.startedAt) / DOORS_TWEEN_MS);
      this.doorsProgress = doorsAnim.from + (doorsAnim.to - doorsAnim.from) * easeInOutCubic(t);
      this.applyDoorPose();
      if (t >= 1) {
        this.doorsProgress = doorsAnim.to;
        this.doorsAnim = null;
      }
    }

    const drawersAnim = this.drawersAnim;
    if (drawersAnim) {
      const t = Math.min(1, (now - drawersAnim.startedAt) / DRAWERS_TWEEN_MS);
      this.drawersProgress = drawersAnim.from + (drawersAnim.to - drawersAnim.from) * easeInOutCubic(t);
      this.applyDrawerPose();
      if (t >= 1) {
        this.drawersProgress = drawersAnim.to;
        this.drawersAnim = null;
      }
    }

    this.controls.update();
    if (!this.contextLost) this.renderer.render(this.scene, this.camera);
  };

  private resize(): void {
    if (this.disposed) return;
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (width < 2 || height < 2) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (!this.userMoved) this.applyView(this.preset, false);
    else this.refit(false);
  }

  dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.controls.removeEventListener('start', this.handleControlsStart);
    this.controls.dispose();

    this.doorRigs.length = 0;
    this.drawerGroups.length = 0;
    this.cabinet.clear();
    this.disposeMaterials();
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.geometries.clear();
    this.rodGeometry.dispose();

    this.scene.remove(this.dimensions.group);
    this.dimensions.dispose();

    this.scene.remove(this.studio.root);
    this.studio.dispose();

    this.scene.environment = null;
    this.envTexture.dispose();
    this.scene.remove(this.cabinet);
    this.renderer.dispose();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  };

  // ---------- корпус ----------

  private rebuildCabinet(): void {
    this.cabinet.clear();
    this.doorRigs.length = 0;
    this.drawerGroups.length = 0;
    this.disposeMaterials();
    this.usedGeometries.clear();

    const spec = resolveMaterials(this.model);
    for (const key of Object.keys(spec) as MaterialKey[]) {
      this.materials.set(key, this.createMaterial(key, spec[key]));
    }

    const depth = this.model.depth;
    this.drawerPull = Math.min(depth * 0.65, 420);
    const groups = new Map<string, DrawerGroup>();
    const doorGroupMeta = this.collectDoorGroups(this.model.parts);
    const doorPivots = new Map<string, THREE.Group>();
    for (const part of this.model.parts) {
      if (part.role === 'door') continue;
      // ручки створок строим вместе со створками, чтобы они двигались с ними
      if (part.role === 'handle' && part.z > depth + 15) continue;

      const material = this.materials.get(part.material) ?? this.materials.get('body');
      if (!material) continue;
      let geometry: THREE.BufferGeometry;
      if (part.shape === 'cylinderX') {
        geometry = this.rodGeometry;
      } else if (part.shape === 'extrude' && part.profile && part.profile.length >= 3) {
        // изголовье и фигурные фасады: профиль выдавливается на глубину детали
        geometry = this.profileGeometry(part);
      } else {
        geometry = this.boxGeometry(part.w, part.h, part.d);
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(part.x, part.y, part.z);
      if (part.shape === 'cylinderX') mesh.scale.set(part.w, part.h, part.d);
      mesh.castShadow = part.role !== 'light' && part.material !== 'glass';
      mesh.receiveShadow = true;
      mesh.name = part.label;

      // Двери комода/тумбы: полотно, профиль-рамка и ручка живут в одной
      // pivot-группе и поворачиваются вокруг петли на стенке секции.
      const meta =
        part.group !== undefined && part.doorHinge !== undefined
          ? doorGroupMeta.get(part.group)
          : undefined;
      if (meta && part.group !== undefined) {
        let pivot = doorPivots.get(part.group);
        if (!pivot) {
          pivot = new THREE.Group();
          pivot.position.set(meta.hingeX, 0, meta.leafZ);
          this.cabinet.add(pivot);
          this.doorRigs.push({ kind: 'hinged', pivot, angle: meta.angle });
          doorPivots.set(part.group, pivot);
        }
        mesh.position.set(part.x - meta.hingeX, part.y, part.z - meta.leafZ);
        pivot.add(mesh);
        continue;
      }

      if (isDrawerPart(part.role)) {
        const key = part.group ?? 'drawer';
        let group = groups.get(key);
        if (!group) {
          group = { parts: [], front: null, needsDoor: false, blocked: false };
          groups.set(key, group);
        }
        group.parts.push({ object: mesh, baseZ: part.z });
        if (part.role === 'drawerFront') {
          group.front = {
            x0: part.x - part.w / 2,
            x1: part.x + part.w / 2,
            y0: part.y - part.h / 2,
            y1: part.y + part.h / 2,
          };
        }
      }
      this.cabinet.add(mesh);
    }

    this.drawerGroups.push(...groups.values());
    this.drawerRects = this.drawerGroups
      .map((group) => group.front)
      .filter((front): front is DrawerRect => front !== null);

    // Доступ считаем до сборки створок: сцена берёт отсюда сдвиги дверей-купе.
    const access = this.computeAccess();
    this.applyAccess(access);
    this.buildDoors(access.shifts);

    for (const [key, geometry] of [...this.geometries]) {
      if (this.usedGeometries.has(key)) continue;
      geometry.dispose();
      this.geometries.delete(key);
    }

    this.applyDoorPose();
    this.applyDrawerPose();
  }

  private computeAccess(): DrawerAccess {
    return analyzeDrawerAccess(
      this.model.doors,
      this.model.doorsKind,
      { width: this.model.width },
      this.drawerRects,
      this.doorSide,
    );
  }

  /** Петли дверей комода/тумбы: у каждой группы своя ось и угол открывания. */
  private collectDoorGroups(parts: readonly Part[]): Map<string, DoorGroupMeta> {
    const metas = new Map<string, DoorGroupMeta>();
    for (const part of parts) {
      if (part.role !== 'doorLeaf') continue;
      if (part.group === undefined || part.doorHinge === undefined) continue;
      const x0 = part.x - part.w / 2;
      const x1 = part.x + part.w / 2;
      metas.set(part.group, {
        hingeX: part.doorHinge === 'left' ? x0 : x1,
        leafZ: part.z,
        angle: part.doorHinge === 'left' ? -HINGED_OPEN_ANGLE : HINGED_OPEN_ANGLE,
      });
    }
    return metas;
  }

  private applyAccess(access: DrawerAccess): void {
    let rectIndex = 0;
    for (const group of this.drawerGroups) {
      if (group.front) {
        group.needsDoor = access.needsDoor[rectIndex] ?? false;
        group.blocked = access.blocked[rectIndex] ?? false;
        rectIndex += 1;
      }
    }
  }

  /** Пересчитать доступ без пересборки корпуса: блокировки и сдвиги створок. */
  private refreshDoorAccess(): void {
    const access = this.computeAccess();
    this.applyAccess(access);
    for (const rig of this.doorRigs) {
      if (rig.kind === 'sliding') rig.dx = access.shifts[rig.leafIndex] ?? rig.dx;
    }
    this.applyDoorPose();
    this.applyDrawerPose();
  }

  /** Створки: распашные — на петлях, купе — сдвигом по X. */
  private buildDoors(shifts: number[]): void {
    const leaves = this.model.doors;
    if (leaves.length === 0) return;

    const doorKey = doorMaterialFor(this.model.facade, this.model.doorsKind);
    const baseMaterial = this.materials.get(doorKey) ?? this.materials.get('facade');
    if (!baseMaterial) return;
    const metal = this.materials.get('metal') ?? baseMaterial;

    if (this.model.doorsKind === 'hinged') {
      const leavesBySection = new Map<number, number>();
      for (const leaf of leaves) {
        const count = leavesBySection.get(leaf.section) ?? 0;
        leavesBySection.set(leaf.section, Math.max(count, leaf.leaf + 1));
      }

      for (const leaf of leaves) {
        const width = Math.max(60, leaf.x1 - leaf.x0 - DOOR_GAP);
        const height = Math.max(60, leaf.y1 - leaf.y0 - DOOR_GAP);
        const centerX = (leaf.x0 + leaf.x1) / 2;
        const centerY = (leaf.y0 + leaf.y1) / 2;
        const total = leavesBySection.get(leaf.section) ?? 1;
        // у пары створок левая на левой петле, правая — на правой;
        // средние из трёх чередуются, чтобы двери расходились, а не бились
        const hingeLeft = total < 2 ? true : leaf.leaf % 2 === 0;
        const hingeX = hingeLeft ? leaf.x0 : leaf.x1;
        const angle = hingeLeft ? -HINGED_OPEN_ANGLE : HINGED_OPEN_ANGLE;

        const pivot = new THREE.Group();
        pivot.position.set(hingeX, 0, leaf.z);

        const door = this.makeDoorMesh(baseMaterial, width, height, DOOR_T);
        door.position.set(centerX - hingeX, centerY, 0);
        pivot.add(door);

        if (leaf.handle) {
          const handle = this.makeDoorMesh(
            metal,
            leaf.handle.w,
            leaf.handle.h,
            leaf.kind === 'sliding' ? 18 : 14,
          );
          handle.position.set(
            leaf.handle.x - hingeX,
            leaf.handle.y,
            DOOR_T / 2 + 8,
          );
          pivot.add(handle);
        }

        this.cabinet.add(pivot);
        this.doorRigs.push({ kind: 'hinged', pivot, angle });
      }
      return;
    }

    if (this.model.doorsKind === 'sliding') {
      const sorted = [...leaves].sort((a, b) => a.z - b.z || a.x0 - b.x0);
      const seamMaterial = this.makeExtraMaterial(
        new THREE.MeshStandardMaterial({ color: 0x3d3831, roughness: 0.96, metalness: 0 }),
      );
      const rearLeaves = sorted.filter((leaf) => leaf.z <= this.model.depth + 20);

      for (const leaf of sorted) {
        const width = Math.max(60, leaf.x1 - leaf.x0 - DOOR_GAP);
        const height = Math.max(60, leaf.y1 - leaf.y0 - DOOR_GAP);
        const centerX = (leaf.x0 + leaf.x1) / 2;
        const centerY = (leaf.y0 + leaf.y1) / 2;
        const isFront = leaf.z > this.model.depth + 20;
        // лёгкая разница тона: передняя створка чуть светлее задней
        const doorMaterialInstance = isFront
          ? this.tintMaterial(baseMaterial, 1.035)
          : this.tintMaterial(baseMaterial, 0.99);

        const door = this.makeDoorMesh(doorMaterialInstance, width, height, DOOR_T);
        door.position.set(centerX, centerY, leaf.z);
        this.cabinet.add(door);
        const items: Array<{ object: THREE.Object3D; baseX: number }> = [
          { object: door, baseX: centerX },
        ];

        // Алюминиевый профиль по периметру створки-купе: читается и на белом
        // фасаде, и на зеркале, где рамка особенно уместна.
        const frameW = Math.min(22, Math.max(10, width * 0.06));
        const frameT = 7;
        const frameZ = leaf.z + DOOR_T / 2 + 1.5;
        const frameBars: Array<[number, number, number, number]> = [
          [frameW, height, centerX - width / 2 + frameW / 2, centerY],
          [frameW, height, centerX + width / 2 - frameW / 2, centerY],
          [width, frameW, centerX, centerY + height / 2 - frameW / 2],
          [width, frameW, centerX, centerY - height / 2 + frameW / 2],
        ];
        for (const [barW, barH, barX, barY] of frameBars) {
          const bar = new THREE.Mesh(this.boxGeometry(barW, barH, frameT), metal);
          bar.position.set(barX, barY, frameZ);
          bar.castShadow = false;
          bar.receiveShadow = true;
          this.cabinet.add(bar);
          items.push({ object: bar, baseX: barX });
        }

        if (leaf.handle) {
          const handle = this.makeDoorMesh(
            metal,
            leaf.handle.w,
            leaf.handle.h,
            leaf.kind === 'sliding' ? 18 : 14,
          );
          handle.position.set(leaf.handle.x, leaf.handle.y, leaf.z + DOOR_T / 2 + 8);
          this.cabinet.add(handle);
          items.push({ object: handle, baseX: leaf.handle.x });
        }

        if (isFront) {
          // тёмный стык нахлёста на передней створке
          for (const rear of rearLeaves) {
            const overlapsLeft = rear.x0 < leaf.x0 && rear.x1 > leaf.x0 + 1;
            const overlapsRight = rear.x1 > leaf.x1 && rear.x0 < leaf.x1 - 1;
            const seamX = overlapsLeft ? leaf.x0 : overlapsRight ? leaf.x1 : null;
            if (seamX === null) continue;
            const seam = new THREE.Mesh(this.boxGeometry(4, height - 4, 1.4), seamMaterial);
            seam.position.set(seamX - 2, centerY, leaf.z + DOOR_T / 2 - 1.6);
            seam.castShadow = false;
            seam.receiveShadow = false;
            this.cabinet.add(seam);
            items.push({ object: seam, baseX: seamX - 2 });
          }
        }

        // открытое положение: створки собираются у края (сдвиги из access.ts)
        const leafIndex = leaves.indexOf(leaf);
        const dx = leafIndex >= 0 ? shifts[leafIndex] ?? 0 : 0;

        this.doorRigs.push({ kind: 'sliding', items, dx, leafIndex });
      }
    }
  }

  private makeDoorMesh(
    material: THREE.Material,
    width: number,
    height: number,
    depth: number,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(this.boxGeometry(width, height, depth), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private tintMaterial(base: THREE.Material, factor: number): THREE.Material {
    if (Math.abs(factor - 1) < 0.0001) return base;
    const cloned = base.clone();
    const material = cloned as THREE.MeshPhysicalMaterial;
    if (material.color) material.color.multiplyScalar(factor);
    this.extraMaterials.push(cloned);
    return cloned;
  }

  private makeExtraMaterial(material: THREE.Material): THREE.Material {
    this.extraMaterials.push(material);
    return material;
  }

  private applyDoorPose(): void {
    const p = this.doorsProgress;
    for (const rig of this.doorRigs) {
      if (rig.kind === 'hinged') {
        rig.pivot.rotation.y = rig.angle * p;
      } else {
        for (const item of rig.items) item.object.position.x = item.baseX + rig.dx * p;
      }
    }
  }

  private applyDrawerPose(): void {
    const pull = this.drawerPull * this.drawersProgress;
    for (const group of this.drawerGroups) {
      // ящик за закрытой дверью ждёт, пока створка освободит проход;
      // перекрытый створкой-купе ящик не выдвигается вовсе
      const doorFactor = group.needsDoor ? this.doorsProgress : 1;
      const offset = group.blocked ? 0 : pull * doorFactor;
      for (const part of group.parts) part.object.position.z = part.baseZ + offset;
    }
  }

  private boxGeometry(width: number, height: number, depth: number): THREE.BufferGeometry {
    const key = `box:${width}:${height}:${depth}`;
    this.usedGeometries.add(key);
    const cached = this.geometries.get(key);
    if (cached) return cached;
    const minSide = Math.min(width, height, depth);
    const radius = Math.max(0.5, Math.min(3, minSide * 0.42));
    const geometry = new RoundedBoxGeometry(width, height, depth, 2, radius);
    this.geometries.set(key, geometry);
    return geometry;
  }

  /**
   * Деталь-выдавливание: плоский профиль (изголовье, фигурный фасад) тянется
   * на глубину детали. Профиль задан в локальных координатах детали:
   * (0, 0) — центр ограничивающего бокса, u — вправо, v — вверх.
   * Плоскость xy — фронтальная (выдавливание по Z на thickness=part.d),
   * zy — боковая (выдавливание по X на thickness=part.w, профиль в ZY).
   */
  private profileGeometry(part: Part): THREE.BufferGeometry {
    const profile = part.profile;
    if (!profile || profile.length < 3) return this.boxGeometry(part.w, part.h, part.d);

    const plane = part.profilePlane ?? 'xy';
    const key = `profile:${plane}:${part.d}:${JSON.stringify(profile)}`;
    this.usedGeometries.add(key);
    const cached = this.geometries.get(key);
    if (cached) return cached;

    const shape = new THREE.Shape();
    shape.moveTo(profile[0][0], profile[0][1]);
    for (let i = 1; i < profile.length; i += 1) {
      shape.lineTo(profile[i][0], profile[i][1]);
    }
    shape.closePath();

    // Небольшая фаска по кромке — как у скруглённых корпусных деталей.
    const bevel = 1.2;
    // Для плоскости xy профиль тянется по глубине детали (part.d),
    // для zy — по толщине по X (part.w): высота и вылет боковины заданы профилем.
    const depth = plane === 'zy' ? part.w : part.d;
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      steps: 1,
    });
    // выдавливание центрируется по толщине детали (bevel растёт симметрично)
    geometry.translate(0, 0, -depth / 2);
    if (plane === 'zy') {
      // u профиля → +Z, выдавливание → X (толщина part.w, тоже центрирована)
      geometry.rotateY(-Math.PI / 2);
    }

    this.geometries.set(key, geometry);
    return geometry;
  }

  private createMaterial(key: MaterialKey, spec: MaterialSpec): THREE.Material {
    if (key === 'light') {
      return new THREE.MeshStandardMaterial({
        color: spec.color,
        roughness: spec.roughness,
        metalness: spec.metalness,
        emissive: spec.emissive ?? 0xffffff,
        emissiveIntensity: spec.emissiveIntensity ?? 1,
        envMapIntensity: 0.2,
        dithering: true,
      });
    }
    if (key === 'glass' || key === 'mirror') {
      const transparent = spec.opacity !== undefined && spec.opacity < 1;
      return new THREE.MeshPhysicalMaterial({
        color: spec.color,
        roughness: spec.roughness,
        metalness: spec.metalness,
        opacity: spec.opacity ?? 1,
        transparent,
        depthWrite: !transparent,
        ior: key === 'glass' ? 1.45 : 1.52,
        clearcoat: 1,
        clearcoatRoughness: key === 'glass' ? 0.06 : 0.02,
        envMapIntensity: key === 'glass' ? 1.15 : 2.2,
        dithering: true,
      });
    }
    if (key === 'facade') {
      return new THREE.MeshPhysicalMaterial({
        color: spec.color,
        roughness: spec.roughness,
        metalness: spec.metalness,
        clearcoat: 0.55,
        clearcoatRoughness: 0.3,
        envMapIntensity: 0.9,
        dithering: true,
      });
    }
    return new THREE.MeshStandardMaterial({
      color: spec.color,
      roughness: spec.roughness,
      metalness: spec.metalness,
      envMapIntensity: key === 'metal' ? 1.35 : 0.5,
      dithering: true,
    });
  }

  private disposeMaterials(): void {
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    for (const material of this.extraMaterials) material.dispose();
    this.extraMaterials.length = 0;
  }

  // ---------- окружение ----------

  private createEnvironment(): THREE.Texture {
    // Студийное окружение: тёмная комната + два ярких «окна» и потолочный свет.
    // Для зеркальных дверей важно не только свечение, но и контраст: тогда
    // на створках читаются отражения, а не серая заливка.
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось создать окружение студии');

    const vertical = context.createLinearGradient(0, 0, 0, canvas.height);
    vertical.addColorStop(0, '#7d7870');
    vertical.addColorStop(0.32, '#4a453e');
    vertical.addColorStop(0.66, '#26231f');
    vertical.addColorStop(1, '#0a0908');
    context.fillStyle = vertical;
    context.fillRect(0, 0, canvas.width, canvas.height);

    // «Окно» справа: широкий мягкий свет — главный источник для отражений.
    const windowRight = context.createRadialGradient(760, 190, 0, 760, 190, 300);
    windowRight.addColorStop(0, 'rgba(255, 252, 246, 1)');
    windowRight.addColorStop(0.42, 'rgba(255, 248, 236, 0.72)');
    windowRight.addColorStop(1, 'rgba(255, 244, 228, 0)');
    context.fillStyle = windowRight;
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Второе окно слева, слабее — чтобы зеркало «переливалось» при повороте.
    const windowLeft = context.createRadialGradient(230, 165, 0, 230, 165, 190);
    windowLeft.addColorStop(0, 'rgba(255, 250, 242, 0.92)');
    windowLeft.addColorStop(0.5, 'rgba(255, 246, 232, 0.4)');
    windowLeft.addColorStop(1, 'rgba(255, 246, 232, 0)');
    context.fillStyle = windowLeft;
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Потолочный свет: узкая тёплая полоса в верхней части.
    const ceiling = context.createLinearGradient(0, 0, 0, 140);
    ceiling.addColorStop(0, 'rgba(255, 236, 205, 0.55)');
    ceiling.addColorStop(1, 'rgba(255, 236, 205, 0)');
    context.fillStyle = ceiling;
    context.fillRect(0, 0, canvas.width, 150);

    // Отражение пола: холодноватая светлая полоса внизу.
    const floor = context.createLinearGradient(0, 380, 0, 512);
    floor.addColorStop(0, 'rgba(180, 176, 168, 0)');
    floor.addColorStop(0.6, 'rgba(180, 176, 168, 0.16)');
    floor.addColorStop(1, 'rgba(180, 176, 168, 0)');
    context.fillStyle = floor;
    context.fillRect(0, 380, canvas.width, 132);

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const target = pmrem.fromEquirectangular(texture);
    texture.dispose();
    pmrem.dispose();
    this.scene.environment = target.texture;
    this.scene.environmentIntensity = 1;
    return target.texture;
  }

  // ---------- размеры ----------

  private dimensionSignature(): string {
    return `${this.model.width}|${this.model.height}|${this.model.depth}`;
  }

  private rebuildDimensions(): void {
    const signature = this.dimensionSignature();
    if (signature === this.dimensionsKey) return;
    this.dimensionsKey = signature;
    this.scene.remove(this.dimensions.group);
    this.dimensions.dispose();
    this.dimensions = createDimensions(this.model);
    this.dimensions.group.visible = this.dimensionsVisible;
    this.scene.add(this.dimensions.group);
  }

  // ---------- камера ----------

  private frameBox(): THREE.Box3 {
    const W = this.model.width * MM;
    const H = this.model.height * MM;
    const D = this.model.depth * MM;
    const min = new THREE.Vector3(-W / 2, -0.006, -0.03);
    const max = new THREE.Vector3(W / 2, H, D + 0.075);
    if (this.dimensionsVisible) {
      min.x -= 0.36;
      max.x += 0.44;
      min.y -= 0.15;
      max.y += 0.12;
      min.z -= 0.05;
      max.z += 0.34;
    }
    return new THREE.Box3(min, max);
  }

  private fitDistance(
    box: THREE.Box3,
    target: THREE.Vector3,
    direction: THREE.Vector3,
    margin = 0.94,
  ): number {
    const tanV = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV) / 2) * margin;
    const aspect = Math.max(0.4, this.camera.aspect || 1);
    const tanH = tanV * aspect;
    const dir = direction.clone().normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir);
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    right.normalize();
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();

    const corner = new THREE.Vector3();
    let distance = 0;
    for (let i = 0; i < 8; i += 1) {
      corner
        .set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
        .sub(target);
      const near = corner.dot(dir);
      const needV = near + Math.abs(corner.dot(up)) / tanV;
      const needH = near + Math.abs(corner.dot(right)) / tanH;
      distance = Math.max(distance, needV, needH);
    }
    return Math.max(distance, 1.1);
  }

  private setDistanceLimits(distance: number): void {
    this.controls.minDistance = Math.max(0.7, distance * 0.42);
    this.controls.maxDistance = Math.max(this.controls.minDistance + 0.5, distance * 1.9);
  }

  private moveCamera(position: THREE.Vector3, target: THREE.Vector3, animate: boolean): void {
    const closeEnough =
      this.camera.position.distanceToSquared(position) < 1e-6 &&
      this.controls.target.distanceToSquared(target) < 1e-6;
    if (!animate || closeEnough) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.tween = null;
      this.controls.update();
      return;
    }
    this.tween = {
      fromPosition: this.camera.position.clone(),
      toPosition: position,
      fromTarget: this.controls.target.clone(),
      toTarget: target,
      startedAt: performance.now(),
      duration: VIEW_TWEEN_MS,
    };
  }

  private applyView(preset: ViewPreset, animate: boolean): void {
    const box = this.frameBox();
    const target = box.getCenter(new THREE.Vector3());
    const direction = VIEW_DIRECTION[preset].clone();
    const distance = this.fitDistance(box, target, direction, VIEW_MARGIN[preset]);
    this.setDistanceLimits(distance);
    this.moveCamera(target.clone().addScaledVector(direction, distance), target, animate);
  }

  /** Перекадрировать, сохранив текущее направление взгляда пользователя. */
  private refit(animate: boolean): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    if (offset.lengthSq() < 1e-8) {
      this.applyView(this.preset, animate);
      return;
    }
    const direction = offset.normalize();
    const box = this.frameBox();
    const target = box.getCenter(new THREE.Vector3());
    const distance = this.fitDistance(box, target, direction);
    this.setDistanceLimits(distance);
    this.moveCamera(target.clone().addScaledVector(direction, distance), target, animate);
  }
}
