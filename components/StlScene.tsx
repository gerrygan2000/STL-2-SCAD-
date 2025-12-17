import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useThree, useLoader } from '@react-three/fiber';
import { OrbitControls, Center, Grid, Html, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';

// Add global type declarations for React Three Fiber elements
declare global {
  namespace JSX {
    interface IntrinsicElements {
      mesh: any;
      meshStandardMaterial: any;
      color: any;
      ambientLight: any;
      directionalLight: any;
      pointLight: any;
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      mesh: any;
      meshStandardMaterial: any;
      color: any;
      ambientLight: any;
      directionalLight: any;
      pointLight: any;
    }
  }
}

interface StlSceneProps {
  url: string;
  onSnapshotReady: (captureFn: () => Promise<string[]>) => void;
}

// Loading Indicator Component
function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="flex flex-col items-center justify-center p-4 bg-slate-900/90 rounded-lg border border-indigo-500/30 backdrop-blur-sm shadow-xl z-50">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-white font-medium text-sm whitespace-nowrap">正在解析模型数据...</p>
        <p className="text-indigo-400 text-xs mt-1">{progress.toFixed(0)}%</p>
      </div>
    </Html>
  );
}

const MeshViewer: React.FC<{ url: string }> = ({ url }) => {
  const rawGeometry = useLoader(STLLoader, url);
  
  // Process geometry: Clone -> Fix Orientation (Z-up to Y-up) -> Center
  const geometry = useMemo(() => {
    const g = rawGeometry.clone();
    g.computeVertexNormals();
    
    // Rotate -90 degrees around X to align standard Z-up engineering models to Three.js Y-up
    // Original: Z is Up, -Y is Front.
    // New: Y is Up, +Z is Front.
    g.rotateX(-Math.PI / 2);
    
    // We strictly Center the geometry here for the OrbitControls to pivot correctly
    g.center();
    return g;
  }, [rawGeometry]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow name="target-mesh">
      <meshStandardMaterial 
        color="#6366f1" 
        roughness={0.5} 
        metalness={0.1}
        flatShading={false}
      />
    </mesh>
  );
};

// Component to handle multi-view snapshot triggering
const ScreenshotHandler: React.FC<{ onSnapshotReady: (fn: () => Promise<string[]>) => void }> = ({ onSnapshotReady }) => {
  const { gl, scene, camera, controls } = useThree();
  const controlsRef = useRef<any>(controls);

  // Update ref when controls change
  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    const captureMultiViews = async (): Promise<string[]> => {
      // --- 1. Identify Target (Bounding Box Center) ---
      let targetMesh: THREE.Mesh | null = null;
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh && child.name === 'target-mesh') {
          targetMesh = child;
        }
      });

      // Fallback if named mesh not found (shouldn't happen with current setup)
      if (!targetMesh) {
         scene.traverse((child) => {
           if (child instanceof THREE.Mesh) targetMesh = child;
         });
      }

      const center = new THREE.Vector3(0,0,0);
      let dist = 100;

      if (targetMesh) {
        // Calculate Bounding Box from the object in World Space
        const box = new THREE.Box3().setFromObject(targetMesh as THREE.Object3D);
        box.getCenter(center); // Update center vector
        const size = box.getSize(new THREE.Vector3());

        // --- 2. Calculate Fit-to-View Distance ---
        // Formula: distance = (maxDim / 2) / tan(FOV / 2)
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
        
        const cameraDist = Math.abs((maxDim / 2) / Math.tan(fov / 2));
        
        // Add padding (1.5x) to ensure the object has breathing room and doesn't touch edges
        dist = cameraDist * 1.5;
      }

      // Save original state
      const originalPosition = camera.position.clone();
      const originalRotation = camera.rotation.clone();
      const originalUp = camera.up.clone();
      
      const snapshots: string[] = [];

      // --- 3. Define 6 Standard Views relative to Center ---
      // Order strictly matches: Top, Front, Right, Back, Left, Bottom
      const views = [
        // 1. Top View (俯视)
        // Pos: Above (+Y), looking down at center.
        // Up: Points to Back (-Z). Standard map orientation.
        { 
          name: 'Top', 
          offset: new THREE.Vector3(0, dist, 0), 
          up: new THREE.Vector3(0, 0, -1) 
        },
        
        // 2. Front View (前视)
        // Pos: In front (+Z), looking at center.
        // Up: Standard (+Y).
        { 
          name: 'Front', 
          offset: new THREE.Vector3(0, 0, dist), 
          up: new THREE.Vector3(0, 1, 0) 
        },
        
        // 3. Right View (右视)
        // Pos: Right (+X), looking at center.
        // Up: Standard (+Y).
        { 
          name: 'Right', 
          offset: new THREE.Vector3(dist, 0, 0), 
          up: new THREE.Vector3(0, 1, 0) 
        },

        // 4. Back View (后视)
        // Pos: Behind (-Z), looking at center.
        // Up: Standard (+Y).
        { 
          name: 'Back', 
          offset: new THREE.Vector3(0, 0, -dist), 
          up: new THREE.Vector3(0, 1, 0) 
        },

        // 5. Left View (左视)
        // Pos: Left (-X), looking at center.
        // Up: Standard (+Y).
        { 
          name: 'Left', 
          offset: new THREE.Vector3(-dist, 0, 0), 
          up: new THREE.Vector3(0, 1, 0) 
        },

        // 6. Bottom View (仰视)
        // Pos: Below (-Y), looking up at center.
        // Up: Points to Front (+Z). Keeps orientation intuitive.
        { 
          name: 'Bottom', 
          offset: new THREE.Vector3(0, -dist, 0), 
          up: new THREE.Vector3(0, 0, 1) 
        },
      ];

      // Temporarily disable controls
      if (controlsRef.current) {
         controlsRef.current.enabled = false;
         controlsRef.current.autoRotate = false;
      }

      try {
        for (const view of views) {
          // Calculate absolute position: Center + Offset
          const camPos = new THREE.Vector3().copy(center).add(view.offset);

          camera.position.copy(camPos);
          camera.up.copy(view.up);
          camera.lookAt(center);
          
          // Force update matrices
          camera.updateMatrixWorld();
          camera.updateProjectionMatrix(); 
          
          // Wait for renderer
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Explicit render
          gl.render(scene, camera);
          
          const dataUrl = gl.domElement.toDataURL('image/jpeg', 0.95);
          snapshots.push(dataUrl);
        }
      } finally {
        // Restore original state
        camera.up.copy(originalUp);
        camera.position.copy(originalPosition);
        camera.rotation.copy(originalRotation);
        camera.updateProjectionMatrix();
        
        if (controlsRef.current) {
          controlsRef.current.enabled = true;
          controlsRef.current.autoRotate = true;
          controlsRef.current.update();
        }
        
        gl.render(scene, camera);
      }

      return snapshots;
    };

    onSnapshotReady(captureMultiViews);
  }, [gl, scene, camera, onSnapshotReady]);

  return null;
};

const StlScene: React.FC<StlSceneProps> = ({ url, onSnapshotReady }) => {
  return (
    <div className="w-full h-full relative bg-slate-900 rounded-lg overflow-hidden border border-slate-700 shadow-inner group">
      <Canvas
        shadows
        camera={{ position: [50, 50, 50], fov: 40 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#0f172a']} />
        
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={1.2} castShadow />
        <directionalLight position={[-10, -10, -10]} intensity={0.5} />

        <React.Suspense fallback={<Loader />}>
           <Center>
             <MeshViewer url={url} />
           </Center>
        </React.Suspense>
        
        <Grid 
          position={[0, -0.01, 0]} 
          args={[100, 100]} 
          cellSize={10} 
          cellThickness={1} 
          cellColor="#334155" 
          sectionSize={50} 
          sectionThickness={1.5} 
          sectionColor="#475569" 
          fadeDistance={200} 
          infiniteGrid 
        />
        
        <OrbitControls makeDefault autoRotate autoRotateSpeed={1} />
        <ScreenshotHandler onSnapshotReady={onSnapshotReady} />
      </Canvas>
      
      <div className="absolute bottom-4 left-4 pointer-events-none text-xs text-slate-500 bg-slate-900/80 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10">
        左键: 旋转 • 右键: 平移 • 滚轮: 缩放
      </div>
    </div>
  );
};

export default StlScene;