'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';

/**
 * The 3D stage: camera, lights, ground, orbit controls.
 *
 * Camera sits at chest height looking slightly up, which frames a standing
 * humanoid better than the default origin-facing camera.
 */
export default function Scene({ children }) {
  return (
    <Canvas
      camera={{ position: [0, 1.35, 2.2], fov: 30 }}
      shadows
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#1a1a1f']} />

      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 3]} intensity={1.4} castShadow />
      <directionalLight position={[-3, 2, -2]} intensity={0.4} />

      <Grid
        args={[10, 10]}
        cellColor="#2e2e38"
        sectionColor="#3d3d4a"
        fadeDistance={12}
        infiniteGrid
      />

      {children}

      <OrbitControls target={[0, 1.25, 0]} maxPolarAngle={Math.PI / 1.8} />
    </Canvas>
  );
}
