import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-white overflow-hidden">
      <header className="h-16 border-b border-zinc-800 bg-zinc-900/50 flex items-center px-6 justify-between backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-lg">
            H
          </div>
          <h1 className="font-bold text-xl tracking-tight text-zinc-100">
            Holmes on Code <span className="text-zinc-500 font-normal">| Agentic Director</span>
          </h1>
        </div>
        <div className="text-xs font-mono text-zinc-500">
          Powered by Google Veo & Gemini 2.5
        </div>
      </header>
      <main className="flex-1 flex overflow-hidden">
        {children}
      </main>
    </div>
  );
};