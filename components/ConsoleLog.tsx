import React, { useEffect, useRef } from 'react';
import { AgentLog, AgentRole } from '../types';

interface ConsoleLogProps {
  logs: AgentLog[];
}

export const ConsoleLog: React.FC<ConsoleLogProps> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getRoleColor = (role: AgentRole) => {
    switch(role) {
      case AgentRole.DIRECTOR: return 'text-red-400';
      case AgentRole.CONTINUITY_QA: return 'text-blue-400';
      case AgentRole.GENERATOR: return 'text-green-400';
      case AgentRole.PARSER: return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="flex flex-col h-full bg-black/40 rounded-lg border border-zinc-800 font-mono text-xs p-4 overflow-hidden">
      <div className="mb-2 flex items-center gap-2 border-b border-zinc-800 pb-2">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
        <span className="text-zinc-400 uppercase tracking-widest text-[10px]">System Neuro-Link</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-2">
        {logs.map((log) => (
          <div key={log.id} className="flex gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
            <span className="text-zinc-600 shrink-0">[{log.timestamp.toLocaleTimeString().split(' ')[0]}]</span>
            <span className={`font-bold shrink-0 w-24 ${getRoleColor(log.role)}`}>{log.role}</span>
            <span className="text-zinc-300 break-words">{log.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};