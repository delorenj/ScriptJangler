import React from 'react';
import { AgentRole } from '../types';

interface AgentCardProps {
  role: AgentRole;
  isActive: boolean;
  statusMessage?: string;
  icon: React.ReactNode;
}

export const AgentCard: React.FC<AgentCardProps> = ({ role, isActive, statusMessage, icon }) => {
  const getBorderColor = () => {
    switch (role) {
      case AgentRole.DIRECTOR: return 'border-red-500';
      case AgentRole.CONTINUITY_QA: return 'border-blue-500';
      case AgentRole.GENERATOR: return 'border-green-500';
      case AgentRole.PARSER: return 'border-yellow-500';
      case AgentRole.STAGE_HAND: return 'border-pink-500';
      default: return 'border-zinc-700';
    }
  };

  const getGlow = () => {
    switch (role) {
      case AgentRole.DIRECTOR: return 'shadow-[0_0_15px_rgba(239,68,68,0.3)]';
      case AgentRole.CONTINUITY_QA: return 'shadow-[0_0_15px_rgba(59,130,246,0.3)]';
      case AgentRole.GENERATOR: return 'shadow-[0_0_15px_rgba(34,197,94,0.3)]';
      case AgentRole.PARSER: return 'shadow-[0_0_15px_rgba(234,179,8,0.3)]';
      case AgentRole.STAGE_HAND: return 'shadow-[0_0_15px_rgba(236,72,153,0.3)]';
      default: return '';
    }
  };

  return (
    <div 
      className={`
        relative p-4 rounded-xl border-l-4 bg-zinc-900 transition-all duration-300
        ${isActive ? `${getBorderColor()} ${getGlow()} scale-105 z-10` : 'border-zinc-800 opacity-60 scale-100 grayscale'}
      `}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg bg-zinc-800 ${isActive ? 'animate-pulse' : ''}`}>
          {icon}
        </div>
        <div>
          <h3 className="font-bold text-sm tracking-wide">{role}</h3>
          {isActive && (
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-mono">
              Active Process
            </span>
          )}
        </div>
      </div>
      
      <div className="h-12 flex items-center">
         <p className="text-xs text-zinc-300 line-clamp-2 font-mono leading-relaxed">
            {isActive ? statusMessage || "Waiting for task..." : "Idle"}
         </p>
      </div>
    </div>
  );
};