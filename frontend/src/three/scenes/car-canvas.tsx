"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { F1Car, type CarApi } from "@/three/scenes/f1-car";
import { StageEnvironment } from "@/three/scenes/stage-environment";
import { DECODER_PATH, INITIAL_SCENE_STATE, LABELS, MOBILE_LABEL_IDS } from "@/three/config";
import type { SceneState } from "@/three/config";

export interface LabelScreen {
  id: string;
  x: number;
  y: number;
  visible: boolean;
  side: "left" | "right";
}

export interface CanvasProps {
  stateRef: React.MutableRefObject<SceneState>;
  labelsStore: React.MutableRefObject<Map<string, LabelScreen>>;
  active: boolean;
  quality: "high" | "low";
  onCarReady?: (api: CarApi) => void;
}

/** Applies the shared scene state to the camera every frame. */
function CameraRig({ stateRef }: { stateRef: React.MutableRefObject<SceneState> }) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const offset = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const st = stateRef.current;
    target.set(0, st.targetY, 0);
    const { camAz: az, camPol: pol, camRad: rad } = st;
    camera.position.set(
      target.x + rad * Math.sin(pol) * Math.sin(az),
      target.y + rad * Math.cos(pol),
      target.z + rad * Math.sin(pol) * Math.cos(az),
    );
    camera.lookAt(target);
    // screen-space composition shift (pushes the car off-centre in the hero)
    offset.set(1, 0, 0).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(offset, -st.shiftX);
    offset.set(0, 1, 0).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(offset, -st.shiftY);
  });
  return null;
}

/** Projects 3D label anchors to screen coordinates every frame. */
function LabelProjector({
  stateRef,
  labelsStore,
  carApiRef,
  isMobile,
}: {
  stateRef: React.MutableRefObject<SceneState>;
  labelsStore: React.MutableRefObject<Map<string, LabelScreen>>;
  carApiRef: React.MutableRefObject<CarApi | null>;
  isMobile: boolean;
}) {
  const { camera, size } = useThree();
  const vec = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const api = carApiRef.current;
    if (!api) return;
    const st = stateRef.current;
    for (const cfg of LABELS) {
      if (isMobile && !MOBILE_LABEL_IDS.includes(cfg.id)) continue;
      const wrapper = api.wrappers.get(cfg.part);
      if (!wrapper) continue;
      vec.set(cfg.anchor[0], cfg.anchor[1], cfg.anchor[2]);
      wrapper.localToWorld(vec);
      vec.project(camera);
      const store = labelsStore.current.get(cfg.id) ?? {
        id: cfg.id, x: 0, y: 0, visible: false, side: cfg.side,
      };
      store.x = (vec.x * 0.5 + 0.5) * size.width;
      store.y = (-vec.y * 0.5 + 0.5) * size.height;
      store.visible = st.labels >= cfg.reveal && vec.z < 1;
      labelsStore.current.set(cfg.id, store);
    }
  });
  return null;
}

/**
 * The full 3D stage. Scroll logic lives in the parent; this component only
 * renders the scene described by the shared state ref.
 */
export function CarCanvas({ stateRef, labelsStore, active, quality, onCarReady }: CanvasProps) {
  const carApiRef = useRef<CarApi | null>(null);
  const isMobile = useMemo(() => quality === "low", [quality]);

  // preload model (draco decoder is local, no CDN)
  useEffect(() => {
    // dynamic import pattern would re-create loader config; drei caches globally
    void DECODER_PATH;
  }, []);

  return (
    <Canvas
      dpr={quality === "high" ? [1, 2] : [1, 1.5]}
      frameloop={active ? "always" : "never"}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
      }}
      camera={{ fov: 38, near: 0.1, far: 80, position: [4, 5, 9] }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden="true"
    >
      <color attach="background" args={["#0a0a0b"]} />
      <fog attach="fog" args={["#0a0a0b", 14, 30]} />
      <CameraRig stateRef={stateRef} />
      <StageEnvironment quality={quality} />
      <F1Car
        stateRef={stateRef}
        onReady={(api) => {
          carApiRef.current = api;
          onCarReady?.(api);
        }}
      />
      <LabelProjector
        stateRef={stateRef}
        labelsStore={labelsStore}
        carApiRef={carApiRef}
        isMobile={isMobile}
      />
    </Canvas>
  );
}
