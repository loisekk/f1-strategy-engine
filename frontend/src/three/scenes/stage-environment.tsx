"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { Environment, Lightformer, ContactShadows } from "@react-three/drei";

/** Cinematic studio lighting — fully procedural (no HDR downloads). */
export function StageEnvironment({ quality = "high" }: { quality?: "high" | "low" }) {
  const shadowRes = quality === "high" ? 512 : 256;
  return (
    <>
      {/* key light — warm white, front-left-top */}
      <directionalLight
        position={[6, 9, 7]}
        intensity={2.4}
        color="#fff4ea"
      />
      {/* rim light — cool, from rear-right, gives bodywork edge separation */}
      <directionalLight position={[-7, 4, -6]} intensity={1.6} color="#cdd6ff" />
      {/* red kicker from the floor front — motorsport signature */}
      <spotLight
        position={[0, 1.2, 9]}
        angle={0.55}
        penumbra={1}
        intensity={22}
        color="#e10600"
        distance={22}
      />
      <ambientLight intensity={0.3} color="#b9bdc9" />

      {/* procedural environment map for metallic reflections */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={4} position={[0, 6, 4]} scale={[9, 4, 1]} target={[0, 0, 0]} color="#ffffff" />
        <Lightformer form="rect" intensity={1.6} position={[-6, 3, -4]} scale={[7, 3, 1]} target={[0, 0, 0]} color="#aebdd6" />
        <Lightformer form="rect" intensity={1.2} position={[6, 2.5, -3]} scale={[6, 3, 1]} target={[0, 0, 0]} color="#e8d9c8" />
        <Lightformer form="rect" intensity={0.6} position={[0, -4, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} color="#20222a" />
        <Lightformer form="ring" intensity={2.2} position={[-3, 5, 3]} scale={2.5} color="#ff5a52" />
      </Environment>

      <ContactShadows
        position={[0, 0.001, 0]}
        opacity={0.72}
        scale={16}
        blur={2.2}
        far={4}
        resolution={shadowRes}
        color="#000000"
      />
      <StudioFloor />
    </>
  );
}

/** Dark turntable floor with subtle etched rings. */
function StudioFloor() {
  const rings = useMemo(() => {
    const group = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({
      color: 0x3a3a42,
      transparent: true,
      opacity: 0.4,
    });
    for (const r of [2.4, 3.6, 5.2]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
    // cross hairlines
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x2c2c33,
      transparent: true,
      opacity: 0.5,
    });
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
    ]) {
      const pts = [
        new THREE.Vector3(-dx * 6.2, 0.0, -dz * 6.2),
        new THREE.Vector3(dx * 6.2, 0.0, dz * 6.2),
      ];
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    }
    return group;
  }, []);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.002, 0]} receiveShadow={false}>
        <circleGeometry args={[7.5, 64]} />
        <meshStandardMaterial color="#0d0d10" roughness={0.9} metalness={0.1} />
      </mesh>
      <primitive object={rings} />
    </group>
  );
}
