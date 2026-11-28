"use client";

/**
 * 3D-персонаж VRM (фаза 4, SPEC 6.2): three + @pixiv/three-vrm + @react-three/fiber.
 * Idle: дыхание, моргание, лёгкое покачивание, взгляд в камеру; поворот пальцем/мышью.
 * При `prefers-reduced-motion` остаются только моргание и взгляд.
 * `onSnapshot` получает PNG-портрет после первой отрисовки — для лёгкого показа на «Статусе».
 */
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";

import type { Group } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type Framing = "bust" | "full";

const FRAMES: Record<Framing, { y: number; dist: number; fov: number }> = {
  bust: { y: 1.38, dist: 1.05, fov: 26 },
  full: { y: 0.92, dist: 2.35, fov: 30 },
};

interface Props {
  url: string;
  framing?: Framing;
  /** поворот пальцем */
  interactive?: boolean;
  className?: string;
  label: string;
  onLoaded?: (vrm: VRM) => void;
  onError?: (e: unknown) => void;
  onSnapshot?: (png: string) => void;
}

export function VrmViewer({ url, framing = "full", interactive = true, className, label, onLoaded, onError, onSnapshot }: Props) {
  const yaw = useRef(0);
  const drag = useRef<{ x: number; yaw: number } | null>(null);
  const f = FRAMES[framing];

  return (
    <div
      className={className}
      role="img"
      aria-label={label}
      style={{ touchAction: interactive ? "pan-y" : undefined, cursor: interactive ? "grab" : undefined }}
      onPointerDown={(e) => {
        if (!interactive) return;
        drag.current = { x: e.clientX, yaw: yaw.current };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current) yaw.current = drag.current.yaw + (e.clientX - drag.current.x) * 0.012;
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: Boolean(onSnapshot) }}
        camera={{ position: [0, f.y, f.dist], fov: f.fov, near: 0.05, far: 20 }}
        onCreated={({ camera }) => camera.lookAt(0, f.y, 0)}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[1.2, 2.2, 2]} intensity={1.6} />
        <directionalLight position={[-1.5, 1.2, -1.5]} intensity={0.7} color="#a9b0ff" />
        <Avatar url={url} yaw={yaw} onLoaded={onLoaded} onError={onError} onSnapshot={onSnapshot} />
      </Canvas>
    </div>
  );
}

function Avatar({
  url,
  yaw,
  onLoaded,
  onError,
  onSnapshot,
}: {
  url: string;
  yaw: React.RefObject<number>;
  onLoaded?: (vrm: VRM) => void;
  onError?: (e: unknown) => void;
  onSnapshot?: (png: string) => void;
}) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  // для покадровой анимации: three-объекты меняются в useFrame, а не через состояние React
  const live = useRef<VRM | null>(null);
  const group = useRef<Group>(null);
  const { camera, gl } = useThree();
  const clock = useRef(0);
  const nextBlink = useRef(2);
  const snapped = useRef(false);
  const calm = useRef(false);
  const cbs = useRef({ onLoaded, onError, onSnapshot });

  useEffect(() => {
    cbs.current = { onLoaded, onError, onSnapshot };
  }, [onLoaded, onError, onSnapshot]);

  useEffect(() => {
    calm.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false;
    let loaded: VRM | null = null;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader
      .loadAsync(url)
      .then((gltf) => {
        const v = gltf.userData.vrm as VRM | undefined;
        if (!v) throw new Error("not_vrm");
        if (disposed) return VRMUtils.deepDispose(gltf.scene);
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(v);
        v.scene.traverse((o) => (o.frustumCulled = false));
        // руки вниз из T-позы
        const h = v.humanoid;
        const set = (bone: Parameters<typeof h.getNormalizedBoneNode>[0], z: number, x = 0) => {
          const n = h.getNormalizedBoneNode(bone);
          if (n) n.rotation.set(x, 0, z);
        };
        set("leftUpperArm", 1.22);
        set("rightUpperArm", -1.22);
        set("leftLowerArm", 0.18);
        set("rightLowerArm", -0.18);
        if (v.lookAt) v.lookAt.target = camera;
        loaded = v;
        live.current = v;
        setVrm(v);
        cbs.current.onLoaded?.(v);
      })
      .catch((e) => {
        if (!disposed) cbs.current.onError?.(e);
      });
    return () => {
      disposed = true;
      live.current = null;
      if (loaded) VRMUtils.deepDispose(loaded.scene);
    };
  }, [url, camera]);

  useFrame((_, delta) => {
    const vrm = live.current;
    if (!vrm) return;
    const dt = Math.min(delta, 0.1);
    clock.current += dt;
    const t = clock.current;
    const h = vrm.humanoid;

    // поворот, заданный пальцем, — плавно; крутим внешнюю группу, у самой модели свой разворот (VRM 0.x)
    const g = group.current;
    if (g) g.rotation.y += ((yaw.current ?? 0) - g.rotation.y) * Math.min(1, dt * 10);

    if (!calm.current) {
      const breathe = Math.sin(t * 1.6);
      const chest = h.getNormalizedBoneNode("chest") ?? h.getNormalizedBoneNode("spine");
      if (chest) chest.rotation.x = breathe * 0.015;
      const hips = h.getNormalizedBoneNode("hips");
      if (hips) hips.rotation.z = Math.sin(t * 0.5) * 0.012;
      const neck = h.getNormalizedBoneNode("neck");
      if (neck) neck.rotation.z = Math.sin(t * 0.35 + 1) * 0.02;
      const lUp = h.getNormalizedBoneNode("leftUpperArm");
      const rUp = h.getNormalizedBoneNode("rightUpperArm");
      if (lUp) lUp.rotation.z = 1.22 - breathe * 0.012;
      if (rUp) rUp.rotation.z = -1.22 + breathe * 0.012;
    }

    // моргание раз в 2–6 секунд
    const em = vrm.expressionManager;
    if (em) {
      const since = t - nextBlink.current;
      const blink = since < 0 ? 0 : since < 0.08 ? since / 0.08 : since < 0.16 ? 1 - (since - 0.08) / 0.08 : 0;
      em.setValue("blink", blink);
      if (since > 0.2) nextBlink.current = t + 2 + Math.random() * 4;
    }

    vrm.update(dt);

    if (!snapped.current && t > 0.6 && cbs.current.onSnapshot) {
      snapped.current = true;
      try {
        cbs.current.onSnapshot(gl.domElement.toDataURL("image/png"));
      } catch {
        // снимок не обязателен
      }
    }
  });

  return vrm ? (
    <group ref={group}>
      <primitive object={vrm.scene} />
    </group>
  ) : null;
}
