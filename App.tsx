import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileCode, RotateCw, AlertCircle, Wand2, Eye, Loader2 } from 'lucide-react';
import StlScene from './components/StlScene';
import CodeEditor from './components/CodeEditor';
import { generateScadFromImage } from './services/geminiService';
import { AppState, GeometryData, GenerationResult } from './types';

// Generate labels for 18 orientations * 2 Sets = 36 Views
const ORIENTATIONS = [
  "Top", "Bottom", "Front", "Back", "Left", "Right", // Cardinal
  "Front-Right", "Right-Back", "Back-Left", "Left-Front", // Horizontal
  "Top-Front", "Front-Bottom", "Bottom-Back", "Back-Top", // Vertical X
  "Top-Right", "Right-Bottom", "Bottom-Left", "Left-Top"  // Vertical Z
];

const VIEW_LABELS = [
  ...ORIENTATIONS.map(name => `${name} (Global)`),
  ...ORIENTATIONS.map(name => `${name} (Local Detail)`)
];

// Helper function to resize and compress image
const optimizeImage = (dataUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Target 800px max dimension
      const maxDim = 800;
      let width = img.width;
      let height = img.height;
      
      if (width > height) {
        if (width > maxDim) {
          height *= maxDim / width;
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width *= maxDim / height;
          height = maxDim;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      
      if (ctx) {
        ctx.fillStyle = '#0f172a'; // Match scene bg
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        
        // Use 0.8 quality for multi-image batch
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } else {
        reject(new Error("Canvas context creation failed"));
      }
    };
    img.onerror = (e) => reject(new Error("Image load failed"));
    img.src = dataUrl;
  });
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [geometry, setGeometry] = useState<GeometryData | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [progressText, setProgressText] = useState("准备就绪");
  const [snapshots, setSnapshots] = useState<string[]>([]);
  
  // Ref holds the function that returns a Promise of string array (multiple screenshots)
  const captureSnapshotRef = useRef<(() => Promise<string[]>) | null>(null);

  React.useEffect(() => {
    if (!process.env.API_KEY) {
      setApiKeyMissing(true);
    }
  }, []);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setResult(null);
    setErrorMsg(null);
    setSnapshots([]);
    setAppState(AppState.LOADING_STL);

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (result) {
        const url = URL.createObjectURL(file);
        setGeometry({ url, filename: file.name });
        // Set a small timeout to allow UI to render the loading state before Scene loads
        setTimeout(() => setAppState(AppState.READY_TO_CONVERT), 100);
      }
    };
    reader.onerror = () => {
      setErrorMsg("无法读取文件。");
      setAppState(AppState.ERROR);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleGenerate = async () => {
    if (!captureSnapshotRef.current || !geometry) return;

    if (apiKeyMissing) {
       alert("缺少 API Key。请检查环境变量。");
       return;
    }

    setAppState(AppState.ANALYZING);
    setErrorMsg(null);
    setSnapshots([]); // Clear previous snapshots

    try {
      // 1. Capture Multi-View Snapshots (36 views)
      setProgressText("正在进行全方位球形覆盖采集 (36 视角)...");
      const rawSnapshots = await captureSnapshotRef.current();
      
      // Update state to show the grid view immediately
      setSnapshots(rawSnapshots);
      
      // 2. Optimize all images
      setProgressText(`正在优化 ${rawSnapshots.length} 张高维图像数据...`);
      const optimizedSnapshotsProms = rawSnapshots.map(snap => optimizeImage(snap));
      const optimizedSnapshots = await Promise.all(optimizedSnapshotsProms);

      // 3. Remove header for API
      const base64Images = optimizedSnapshots.map(s => s.split(',')[1]);

      // 4. Send to Gemini
      setProgressText("Gemini 3 Pro 正在构建拓扑网络并推导 OpenSCAD 代码...");
      const response = await generateScadFromImage(
        base64Images, 
        `原始文件名: ${geometry.filename}。Input Protocol: 18-View Spherical Coverage Network (Total 36 images: 18 Global, 18 Local).`
      );
      
      setResult(response);
      setAppState(AppState.COMPLETE);

    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : "发生未知错误");
      setAppState(AppState.ERROR);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0f172a] text-slate-200">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#0f172a]/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg">
               <FileCode size={20} className="text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight text-white">STL 转 OpenSCAD 智能重构</h1>
              <p className="text-xs text-slate-400">Gemini 3 Pro 球形覆盖逆向工程</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {apiKeyMissing && (
                <span className="text-xs text-red-400 font-medium px-2 py-1 bg-red-900/20 border border-red-900 rounded">
                    Missing API Key
                </span>
            )}
            <label className={`cursor-pointer group flex items-center space-x-2 px-4 py-2 rounded-lg border transition-all ${appState === AppState.ANALYZING ? 'opacity-50 pointer-events-none border-slate-700' : 'border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 hover:border-indigo-500/50'}`}>
              <Upload size={16} className="text-indigo-400 group-hover:text-indigo-300" />
              <span className="text-sm font-medium text-indigo-300 group-hover:text-indigo-200">加载 STL 文件</span>
              <input type="file" accept=".stl" className="hidden" onChange={handleFileUpload} disabled={appState === AppState.ANALYZING} />
            </label>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row h-[calc(100vh-64px)] overflow-hidden">
        
        {/* Left Panel: 3D Visualization / Snapshot Grid */}
        <section className="flex-1 p-4 flex flex-col border-r border-slate-800 min-h-[50vh]">
          <div className="flex items-center justify-between mb-3 px-1">
             <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">源几何体 (3D)</h2>
             {geometry && <span className="text-xs text-slate-500 font-mono">{geometry.filename}</span>}
          </div>
          
          <div className="flex-1 relative bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
            {/* 
                Render Logic:
                1. If Loading STL -> Show Spinner
                2. If Analyzing AND we have snapshots -> Show 4xGrid (36 images)
                3. If Geometry exists -> Show 3D Scene
                4. Else -> Show Upload Prompt
            */}

            {appState === AppState.LOADING_STL ? (
                <div className="w-full h-full flex flex-col items-center justify-center">
                    <Loader2 size={40} className="text-indigo-500 animate-spin mb-4" />
                    <p className="text-indigo-300 font-medium">正在读取 STL 文件...</p>
                </div>
            ) : (appState === AppState.ANALYZING || appState === AppState.COMPLETE) && snapshots.length > 0 ? (
                /* Static Grid View during Analysis - 4 columns for 36 images */
                <div className="w-full h-full p-2 relative overflow-y-auto custom-scrollbar">
                   <div className="grid grid-cols-4 gap-1.5 pb-2">
                      {snapshots.map((src, idx) => (
                        <div key={idx} className="relative rounded bg-slate-800 border border-slate-700 overflow-hidden group aspect-square">
                           <img src={src} alt={VIEW_LABELS[idx]} className="w-full h-full object-contain p-0.5" />
                           <div className="absolute top-0 left-0 w-full bg-black/60 backdrop-blur-[1px] text-white text-[8px] px-1 py-0.5 font-mono opacity-0 group-hover:opacity-100 transition-opacity truncate">
                             {VIEW_LABELS[idx]}
                           </div>
                        </div>
                      ))}
                   </div>
                   
                   {/* Loading Overlay (only if still analyzing) */}
                   {appState === AppState.ANALYZING && (
                     <div className="absolute inset-0 z-20 bg-slate-900/60 backdrop-blur-[2px] flex flex-col items-center justify-center h-full">
                        <div className="bg-slate-900/90 p-6 rounded-xl border border-indigo-500/30 shadow-2xl flex flex-col items-center">
                            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="text-indigo-400 font-mono text-sm animate-pulse">{progressText}</p>
                        </div>
                     </div>
                   )}
                </div>
            ) : geometry ? (
              /* Interactive 3D Scene */
              <StlScene 
                url={geometry.url} 
                onSnapshotReady={(fn) => { captureSnapshotRef.current = fn; }} 
              />
            ) : (
              /* Empty State */
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 space-y-4 border-dashed border-2 border-slate-800 rounded-lg m-1 w-[calc(100%-8px)] h-[calc(100%-8px)]">
                 <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center">
                    <Upload size={32} className="opacity-50" />
                 </div>
                 <p className="text-sm">请上传 STL 文件以开始逆向工程</p>
              </div>
            )}
            
            {/* Action Bar Overlay - Only show when NOT analyzing and has geometry */}
            {geometry && appState !== AppState.ANALYZING && appState !== AppState.LOADING_STL && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full flex justify-center z-20 pointer-events-none">
                <button
                  onClick={handleGenerate}
                  className={`
                    pointer-events-auto flex items-center space-x-2 px-6 py-3 rounded-full shadow-lg shadow-indigo-900/20 font-semibold text-white transition-all transform hover:scale-105
                    bg-gradient-to-r from-indigo-600 to-violet-600 hover:shadow-indigo-500/25
                  `}
                >
                  <Eye size={18} />
                  <span>{result ? '重新分析' : '36 视角球形重构'}</span>
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Right Panel: Code Output */}
        <section className="flex-1 p-4 flex flex-col min-h-[50vh] bg-[#0b1120]">
           <div className="flex items-center justify-between mb-3 px-1">
             <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">生成的脚本 (SCAD)</h2>
           </div>

           <div className="flex-1 flex flex-col min-h-0">
             {errorMsg ? (
               <div className="h-full w-full flex flex-col items-center justify-center bg-red-900/10 border border-red-900/30 rounded-lg p-6 text-center">
                 <AlertCircle size={48} className="text-red-500 mb-4" />
                 <h3 className="text-red-400 font-semibold mb-2">重构失败</h3>
                 <p className="text-red-300/70 text-sm max-w-md">{errorMsg}</p>
                 <button 
                    onClick={() => setAppState(AppState.READY_TO_CONVERT)}
                    className="mt-6 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm text-white transition-colors"
                 >
                   重试
                 </button>
               </div>
             ) : (
               <div className="flex flex-col h-full space-y-4">
                  <div className="flex-1 min-h-0 relative">
                    <CodeEditor 
                        code={result?.code || ''} 
                        loading={false} 
                    />
                  </div>
                  
                  {/* AI Explanation Area */}
                  {result?.explanation && (
                    <div className="h-1/4 min-h-[120px] bg-slate-900/50 rounded-lg border border-slate-800 p-4 overflow-y-auto">
                        <h4 className="text-xs font-semibold text-indigo-400 uppercase mb-2">AI 建模思路 (Gemini 3 Pro)</h4>
                        <p className="text-sm text-slate-400 leading-relaxed">{result.explanation}</p>
                    </div>
                  )}
               </div>
             )}
           </div>
        </section>
      </main>
    </div>
  );
};

export default App;