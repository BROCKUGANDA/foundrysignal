"use client";

import * as React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Signal Prism — WebGL scene.
 *
 * Geometry: a square prism wireframe of four signal paths converging on an
 * emissive node, surrounded by an orbiting ring of datum ticks. The
 * construction mirrors the 2D canvas tier exactly, so switching tiers is not
 * visually jarring.
 *
 * Performance contract:
 *  - `frameloop="demand"`: frames render only when invalidated. While
 *    `animate` is true we invalidate each frame; when false we render once and
 *    stop. An idle prism costs nothing.
 *  - DPR clamped to [1, 2] — above 2 the fill cost dominates with no visible
 *    gain on the thin strokes here.
 *  - No textures, no post-processing, no shadows: two draw calls for the
 *    lines plus one for the node.
 *  - Pauses on `document.hidden` and when the canvas leaves the viewport.
 *  - All geometries/materials are disposed on unmount.
 */

const SIGNAL_PATHS: Array<{ from: [number, number, number]; to: [number, number, number]; color: string }> = [
  { from: [1.15, -1.3, 0.35], to: [0.5, 0.45, 0.1], color: "#7899ff" },
  { from: [-1.25, 0.7, -0.3], to: [0.5, 0.45, 0.1], color: "#64e5cb" },
  { from: [1.05, 0.85, -0.4], to: [0.5, 0.45, 0.1], color: "#40cbb1" },
  { from: [-0.55, -1.1, 0.45], to: [0.5, 0.45, 0.1], color: "#e8b56f" },
];

const NODE_POSITION: [number, number, number] = [0.5, 0.45, 0.1];

/* ─── Signal paths ──────────────────────────────────────────────────── */

function SignalPath({
  from,
  to,
  color,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
}) {
  const geometry = React.useMemo(() => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const mid = start.clone().lerp(end, 0.5);
    // Slight bow so the path reads as a curve rather than a stick.
    mid.y += 0.12;
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    return new THREE.TubeGeometry(curve, 24, 0.008, 6, false);
  }, [from, to]);

  React.useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color={color} transparent opacity={0.85} toneMapped={false} />
    </mesh>
  );
}

/* ─── Emissive node ─────────────────────────────────────────────────── */

function SignalNode({ animate }: { animate: boolean }) {
  const ref = React.useRef<THREE.Mesh>(null);
  const glowRef = React.useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!animate) return;
    const t = state.clock.elapsedTime;
    const pulse = 1 + Math.sin(t * 2.2) * 0.16;
    if (ref.current) ref.current.scale.setScalar(pulse);
    if (glowRef.current) glowRef.current.scale.setScalar(pulse * 1.1);
  });

  return (
    <group position={NODE_POSITION}>
      <mesh ref={ref}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshBasicMaterial color="#64e5cb" toneMapped={false} />
      </mesh>
      {/* Fake bloom: a larger, additive, low-opacity shell. Cheaper and more
          predictable across drivers than a post-processing pass. */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshBasicMaterial
          color="#64e5cb"
          transparent
          opacity={0.14}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/* ─── Orbit ring + datum ticks ──────────────────────────────────────── */

function OrbitRing({ animate }: { animate: boolean }) {
  const group = React.useRef<THREE.Group>(null);

  const ringGeometry = React.useMemo(() => {
    const curve = new THREE.EllipseCurve(0, 0, 1.42, 1.42, 0, Math.PI * 2, false, 0);
    const points = curve.getPoints(96).map((p) => new THREE.Vector3(p.x, 0, p.y * 0.34));
    return new THREE.BufferGeometry().setFromPoints(points);
  }, []);

  const tickGeometries = React.useMemo(() => {
    const out: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const major = i % 6 === 0;
      const r1 = 1.42;
      const r2 = major ? 1.54 : 1.47;
      const p1 = new THREE.Vector3(Math.cos(a) * r1, 0, Math.sin(a) * r1 * 0.34);
      const p2 = new THREE.Vector3(Math.cos(a) * r2, 0, Math.sin(a) * r2 * 0.34);
      out.push(new THREE.BufferGeometry().setFromPoints([p1, p2]));
    }
    return out;
  }, []);

  React.useEffect(
    () => () => {
      ringGeometry.dispose();
      tickGeometries.forEach((g) => g.dispose());
    },
    [ringGeometry, tickGeometries],
  );

  useFrame((_, delta) => {
    if (!animate || !group.current) return;
    group.current.rotation.y += delta * 0.14;
  });

  return (
    <group ref={group}>
      <lineLoop geometry={ringGeometry}>
        <lineBasicMaterial color="#7899ff" transparent opacity={0.22} toneMapped={false} />
      </lineLoop>
      {tickGeometries.map((g, i) => (
        <lineSegments key={i} geometry={g}>
          <lineBasicMaterial
            color={i % 6 === 0 ? "#64e5cb" : "#7899ff"}
            transparent
            opacity={i % 6 === 0 ? 0.45 : 0.24}
            toneMapped={false}
          />
        </lineSegments>
      ))}
    </group>
  );
}

/* ─── Scene contents ────────────────────────────────────────────────── */

function PrismContent({ animate }: { animate: boolean }) {
  const group = React.useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const [visible, setVisible] = React.useState(true);

  // Pause when the tab is hidden.
  React.useEffect(() => {
    const onVisibility = () => {
      const next = !document.hidden;
      setVisible(next);
      if (next) invalidate();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [invalidate]);

  useFrame((_, delta) => {
    if (!animate || !visible || !group.current) return;
    group.current.rotation.y += delta * 0.18;
    invalidate();
  });

  // Render one frame when motion is disabled, so the object is not blank.
  React.useEffect(() => {
    invalidate();
  }, [animate, invalidate]);

  return (
    <group ref={group}>
      {SIGNAL_PATHS.map((p, i) => (
        <SignalPath key={i} from={p.from} to={p.to} color={p.color} />
      ))}
      <SignalNode animate={animate && visible} />
      <OrbitRing animate={animate && visible} />
    </group>
  );
}

/* ─── Canvas wrapper ────────────────────────────────────────────────── */

export default function PrismScene({ size, animate }: { size: number; animate: boolean }) {
  return (
    <div
      role="img"
      aria-label="Signal Prism — animated brand object (WebGL)"
      style={{ width: size, height: size }}
    >
      <Canvas
        dpr={[1, 2]}
        frameloop="demand"
        camera={{ position: [0, 0.15, 4.2], fov: 42 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "low-power",
          failIfMajorPerformanceCaveat: false,
        }}
        style={{ width: "100%", height: "100%" }}
      >
        <PrismContent animate={animate} />
      </Canvas>
    </div>
  );
}