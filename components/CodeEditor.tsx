import React from 'react';
import { Clipboard, Check } from 'lucide-react';

interface CodeEditorProps {
  code: string;
  loading: boolean;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ code, loading }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center space-y-4 bg-slate-900 rounded-lg border border-slate-700 animate-pulse">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-indigo-400 font-mono text-sm">正在深度分析几何特征...</p>
        <p className="text-slate-500 text-xs max-w-xs text-center">Gemini 3 Pro 正在计算数学参数并推导拓扑结构...</p>
      </div>
    );
  }

  if (!code) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-900 rounded-lg border border-slate-700 text-slate-500">
        <p className="text-sm">生成的 OpenSCAD 代码将显示在这里。</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-slate-900 rounded-lg border border-slate-700 overflow-hidden shadow-lg">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center space-x-2">
           <span className="w-3 h-3 rounded-full bg-red-500"></span>
           <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
           <span className="w-3 h-3 rounded-full bg-green-500"></span>
           <span className="ml-2 text-slate-300 font-mono text-xs">output.scad</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 text-xs font-medium text-slate-400 hover:text-white transition-colors bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded"
        >
          {copied ? <Check size={14} className="text-green-400" /> : <Clipboard size={14} />}
          <span>{copied ? '已复制' : '复制代码'}</span>
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4 bg-[#0d1117]">
        <pre className="font-mono text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};

export default CodeEditor;