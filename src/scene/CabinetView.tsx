/**
 * React-обёртка 3D-сцены: сцена создаётся один раз, дальше модель, ракурс
 * и размерные линии приходят точечными обновлениями, при размонтировании всё
 * освобождается (renderer, geometry, material, texture, ResizeObserver).
 * Контракт — src/lib/ui-contract.ts (CabinetViewProps / CabinetViewApi).
 */
import { useEffect, useRef, useState } from 'react';
import type { CabinetViewApi, CabinetViewProps } from '../lib/ui-contract';
import { FurnitureScene } from './furnitureScene';
import './scene.css';

export function CabinetView({
  model,
  view,
  showDimensions,
  doorsOpen = false,
  drawersOpen = false,
  doorSide = null,
  onReady,
}: CabinetViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<FurnitureScene | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let scene: FurnitureScene;
    try {
      scene = new FurnitureScene({
        host,
        model,
        view,
        showDimensions,
        doorsOpen,
        drawersOpen,
        doorSide,
      });
    } catch (error) {
      console.error('[scene] не удалось создать 3D-сцену', error);
      setFailed(true);
      return;
    }

    sceneRef.current = scene;
    const api: CabinetViewApi = {
      setView: (preset) => scene.setView(preset),
      screenshot: () => scene.screenshot(),
    };
    onReady?.(api);

    return () => {
      sceneRef.current = null;
      scene.dispose();
    };
    // Сцена создаётся один раз: изменения приходят через эффекты ниже.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.update(model);
  }, [model]);

  useEffect(() => {
    sceneRef.current?.setView(view);
  }, [view]);

  useEffect(() => {
    sceneRef.current?.setDoorsOpen(doorsOpen);
  }, [doorsOpen]);

  useEffect(() => {
    sceneRef.current?.setDrawersOpen(drawersOpen);
  }, [drawersOpen]);

  useEffect(() => {
    sceneRef.current?.setDoorSide(doorSide);
  }, [doorSide]);

  useEffect(() => {
    sceneRef.current?.setShowDimensions(showDimensions);
  }, [showDimensions]);

  return (
    <div
      className="scene-root"
      ref={hostRef}
      role="img"
      aria-label={`Трёхмерный вид мебели ${model.width} × ${model.height} × ${model.depth} мм`}
    >
      {failed ? (
        <div className="scene-fallback">
          3D-вид недоступен: браузер не поддерживает WebGL.
        </div>
      ) : null}
    </div>
  );
}

export default CabinetView;
