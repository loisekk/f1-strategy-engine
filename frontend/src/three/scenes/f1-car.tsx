"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { CAR_SCALE, CAR_ROTATION_X, DECODER_PATH, MODEL_URL, PARTS } from "@/three/config";
import type { SceneState } from "@/three/config";

export interface CarApi {
  /** map of part base name -> wrapper group */
  wrappers: Map<string, THREE.Group>;
}

/**
 * Loads the split F1 car glTF and wraps each named part group so the scroll
 * controller can interpolate assembled ⇄ exploded transforms per part.
 *
 * The built THREE.Group is attached imperatively (not via <primitive>) so
 * React StrictMode double-mounts cannot leave it detached.
 */
export function F1Car({
  stateRef,
  onReady,
}: {
  stateRef: React.MutableRefObject<SceneState>;
  onReady?: (api: CarApi) => void;
}) {
  const { scene } = useGLTF(MODEL_URL, DECODER_PATH);

  const rootRef = useRef<THREE.Group>(null); // turntable spin
  const hostRef = useRef<THREE.Group>(null); // rotation + scale container
  const partRefs = useRef<{ wrapper: THREE.Group; cfg: (typeof PARTS)[number] }[]>([]);

  const built = useMemo(() => {
    // clone so the cached gltf is not mutated across mounts
    const root = scene.clone(true);
    root.updateMatrixWorld(true);

    const wrappers = new Map<string, THREE.Group>();
    const partList: { wrapper: THREE.Group; cfg: (typeof PARTS)[number] }[] = [];

    // material touch-up: reflections + no shadow casting (contact shadows only)
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (m && "envMapIntensity" in m) {
            (m as THREE.MeshStandardMaterial).envMapIntensity = 1.15;
          }
        }
      }
    });

    for (const cfg of PARTS) {
      const wrapper = new THREE.Group();
      wrapper.name = `part_${cfg.base}`;
      // collect gltf nodes whose base name matches (collect first, then move)
      const matched: THREE.Object3D[] = [];
      root.traverse((o) => {
        if (o.name && o.name.replace(/_\d+$/, "") === cfg.base) {
          matched.push(o);
        }
      });
      if (matched.length === 0) continue;
      for (const node of matched) {
        wrapper.add(node);
      }
      wrappers.set(cfg.base, wrapper);
      partList.push({ wrapper, cfg });
    }

    return { wrappers, partList };
  }, [scene]);

  /* attach wrappers to the rendered host group */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    for (const { wrapper } of built.partList) {
      host.add(wrapper);
    }
    partRefs.current = built.partList;
    onReady?.({
      wrappers: built.wrappers,
    });
    return () => {
      for (const { wrapper } of built.partList) {
        host.remove(wrapper);
      }
      partRefs.current = [];
    };
  }, [built, onReady]);

  /* per-frame: assembled ⇄ exploded interpolation + hero spin */
  useFrame(() => {
    const st = stateRef.current;
    for (const { wrapper, cfg } of partRefs.current) {
      const [b, e] = cfg.window;
      let t = (st.explode - b) / Math.max(0.0001, e - b);
      t = Math.max(0, Math.min(1, t));
      const p = t * t * (3 - 2 * t); // smoothstep
      wrapper.position.set(cfg.offset[0] * p, cfg.offset[1] * p, cfg.offset[2] * p);
      wrapper.rotation.set(cfg.rotation[0] * p, cfg.rotation[1] * p, cfg.rotation[2] * p);
    }
    if (rootRef.current) {
      rootRef.current.rotation.y = st.spin;
    }
  });

  return (
    <group ref={rootRef}>
      <group ref={hostRef} rotation-x={CAR_ROTATION_X} scale={CAR_SCALE} />
    </group>
  );
}
