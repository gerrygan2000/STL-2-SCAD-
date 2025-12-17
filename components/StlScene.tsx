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

      // Fallback if named mesh not found
      if (!targetMesh) {
         scene.traverse((child) => {
           if (child instanceof THREE.Mesh) targetMesh = child;
         });
      }

      const center = new THREE.Vector3(0,0,0);
      let fitDistance = 100;

      if (targetMesh) {
        // Calculate Bounding Box from the object in World Space
        const box = new THREE.Box3().setFromObject(targetMesh as THREE.Object3D);
        box.getCenter(center); // Update center vector
        const size = box.getSize(new THREE.Vector3());

        // --- 2. Calculate Fit-to-View Base Distance ---
        // Formula: distance = (maxDim / 2) / tan(FOV / 2)
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
        
        // The distance where the object fits exactly in the view
        const exactFitDist = Math.abs((maxDim / 2) / Math.tan(fov / 2));
        fitDistance = exactFitDist;
      }

      // Distances for different modes
      const standardDist = fitDistance * 1.6; // Standard View (1.6x margin for global context)
      const macroDist = fitDistance * 0.55;   // Macro View (0.55x zoom factor for edge inspection)

      // Save original state
      const originalPosition = camera.position.clone();
      const originalRotation = camera.rotation.clone();
      const originalUp = camera.up.clone();
      
      const snapshots: string[] = [];

      // --- 3. Define 18 Spherical Orientations ---
      // We normalize vectors later
      const baseOrientations = [
        // Group 1: The 6 Cardinal Views (Face-Normal)
        { name: 'Top',    vec: [0, 1, 0],  up: [0, 0, -1] },
        { name: 'Bottom', vec: [0, -1, 0], up: [0, 0, 1] },
        { name: 'Front',  vec: [0, 0, 1],  up: [0, 1, 0] },
        { name: 'Back',   vec: [0, 0, -1], up: [0, 1, 0] },
        { name: 'Left',   vec: [-1, 0, 0], up: [0, 1, 0] },
        { name: 'Right',  vec: [1, 0, 0],  up: [0, 1, 0] },

        // Group 2.1: Horizontal Ring (Y-Ring) - 45 degrees
        { name: 'Front-Right', vec: [1, 0, 1],   up: [0, 1, 0] },
        { name: 'Right-Back',  vec: [1, 0, -1],  up: [0, 1, 0] },
        { name: 'Back-Left',   vec: [-1, 0, -1], up: [0, 1, 0] },
        { name: 'Left-Front',  vec: [-1, 0, 1],  up: [0, 1, 0] },

        // Group 2.2: Vertical X-Ring - 45 degrees
        { name: 'Top-Front',    vec: [0, 1, 1],   up: [0, 1, 0] },
        { name: 'Front-Bottom', vec: [0, -1, 1],  up: [0, 1, 0] },
        { name: 'Bottom-Back',  vec: [0, -1, -1], up: [0, 1, 0] },
        { name: 'Back-Top',     vec: [0, 1, -1],  up: [0, 1, 0] },

        // Group 2.3: Vertical Z-Ring - 45 degrees
        { name: 'Top-Right',    vec: [1, 1, 0],   up: [0, 1, 0] },
        { name: 'Right-Bottom', vec: [1, -1, 0],  up: [0, 1, 0] },
        { name: 'Bottom-Left',  vec: [-1, -1, 0], up: [0, 1, 0] },
        { name: 'Left-Top',     vec: [-1, 1, 0],  up: [0, 1, 0] },
      ];

      // --- 4. Generate 36 Views (18 Global + 18 Local) ---
      const views = [];

      // Set A: Global 18 Views
      baseOrientations.forEach(o => {
        const dir = new THREE.Vector3(o.vec[0], o.vec[1], o.vec[2]).normalize();
        views.push({
          name: o.name,
          offset: dir.multiplyScalar(standardDist),
          up: new THREE.Vector3(o.up[0], o.up[1], o.up[2])
        });
      });

      // Set B: Local 18 Views
      baseOrientations.forEach(o => {
        const dir = new THREE.Vector3(o.vec[0], o.vec[1], o.vec[2]).normalize();
        views.push({
          name: `${o.name} Detail`,
          offset: dir.multiplyScalar(macroDist),
          up: new THREE.Vector3(o.up[0], o.up[1], o.up[2])
        });
      });

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
          await new Promise(resolve => setTimeout(resolve, 80)); // Slightly faster capture per frame
          
          // Explicit render
          gl.render(scene, camera);
          
          const dataUrl = gl.domElement.toDataURL('image/jpeg', 0.90);
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