import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Layout } from './components/Layout';
import { AgentCard } from './components/AgentCard';
import { ConsoleLog } from './components/ConsoleLog';
import { ReelPlayer } from './components/ReelPlayer';
import { 
  ScriptScene, 
  AgentLog, 
  AgentRole, 
  SceneStatus 
} from './types';
import { 
  parseScriptWithGemini, 
  checkContinuity, 
  generateVeoVideo,
  generateStageHandImage,
  fetchImageAsBase64
} from './services/geminiService';

// Default script placeholder
const DEFAULT_SCRIPT = `# Holmes on Code: The Bargain Build Disaster

SCENE 1: The Call
Visual: Exterior wide shot of a sleek but obviously fake tech startup office. Modern glass building but with glitchy holographic signage.
Context: Mike narrates getting a call from a startup with a failing backend.

SCENE 2: No Permits
Visual: Interior. Mike holds a clipboard, looking skeptical while talking to a nervous CTO in a hoodie.
Context: Mike asks for documentation, CTO admits they just "figured it out as they went".

SCENE 3: The Spaghetti Code
Visual: Close up of a computer monitor showing chaotic code scrolling rapidly with red error messages popping up.
Context: Mike discovers they reused abandoned libraries.

SCENE 4: Structural Violation
Visual: Mike points at a server rack that is literally held together with duct tape and glowing red.
Context: Analogy for bypassing security layers for analytics.`;

export default function App() {
  // State
  const [apiKeyReady, setApiKeyReady] = useState(false);
  const [scriptText, setScriptText] = useState(DEFAULT_SCRIPT);
  const [scenes, setScenes] = useState<ScriptScene[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Player State
  const [showReelPlayer, setShowReelPlayer] = useState(false);
  
  // Agent Activity State
  const [activeAgent, setActiveAgent] = useState<AgentRole | null>(null);
  const [agentMessage, setAgentMessage] = useState<string>("");

  // Refs for loop control
  const stopSignalRef = useRef(false);

  // Check API Key on Mount
  useEffect(() => {
    const checkKey = async () => {
      // 1. Check environment variable first
      if (process.env.API_KEY) {
        setApiKeyReady(true);
        return;
      }

      // 2. Check for AI Studio environment
      // Cast to any to avoid TS errors if definitions are missing or incorrect
      if ((window as any).aistudio && await (window as any).aistudio.hasSelectedApiKey()) {
        setApiKeyReady(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if ((window as any).aistudio) {
      await (window as any).aistudio.openSelectKey();
      // Verify state to avoid race condition or cancellation
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (hasKey) {
        setApiKeyReady(true);
      }
    } else {
      alert("AI Studio environment not detected. Please set GEMINI_API_KEY in your .env file.");
    }
  };

  // Logger
  const addLog = useCallback((role: AgentRole, message: string, status: 'info' | 'success' | 'warning' | 'error' | 'thinking' = 'info') => {
    setLogs(prev => [...prev, {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      role,
      message,
      status
    }]);
    setAgentMessage(message);
    setActiveAgent(role);
  }, []);

  // -------------------------------------------------------------------------
  // ORCHESTRATOR (The Director Agent Logic)
  // -------------------------------------------------------------------------
  const runDirector = async () => {
    if (!apiKeyReady) return;
    
    setIsProcessing(true);
    stopSignalRef.current = false;
    setLogs([]);
    setScenes([]);

    try {
      // 1. PARSE PHASE
      addLog(AgentRole.DIRECTOR, "Initiating pre-production. Delegating script parsing...");
      setActiveAgent(AgentRole.PARSER);
      
      const parsedScenes = await parseScriptWithGemini(scriptText);
      setScenes(parsedScenes);
      addLog(AgentRole.PARSER, `Script parsed successfully. Identified ${parsedScenes.length} scenes.`, 'success');

      // 2. PRODUCTION LOOP
      let previousScene: ScriptScene | null = null;

      for (let i = 0; i < parsedScenes.length; i++) {
        if (stopSignalRef.current) break;

        const currentScene = parsedScenes[i];
        
        // Update status to analyzing
        updateSceneStatus(currentScene.id, SceneStatus.ANALYZING);
        
        // A. CONTINUITY CHECK
        addLog(AgentRole.DIRECTOR, `Scene ${currentScene.id}: Requesting Continuity QA check.`);
        const continuityCheck = await checkContinuity(currentScene, previousScene);
        
        addLog(AgentRole.CONTINUITY_QA, 
          `Scene ${currentScene.id} Analysis: ${continuityCheck.reasoning} -> Extension: ${continuityCheck.shouldExtend}`, 
          continuityCheck.shouldExtend ? 'warning' : 'info'
        );

        // Update scene with decision
        updateSceneData(currentScene.id, { 
          feedback: continuityCheck.reasoning,
          isExtension: continuityCheck.shouldExtend 
        });

        let imageBase64: string | undefined = undefined;

        // B. STAGE HAND (If not extending)
        // We only generate/fetch a start frame if we are creating a new video, not extending an existing one.
        if (!continuityCheck.shouldExtend) {
          updateSceneStatus(currentScene.id, SceneStatus.PREPARING_ASSETS);
          addLog(AgentRole.DIRECTOR, `Scene ${currentScene.id}: Requesting Stage Hand for visual assets.`);
          
          try {
            if (currentScene.imageUrl) {
               addLog(AgentRole.STAGE_HAND, `Fetching reference image from URL: ${currentScene.imageUrl}`);
               imageBase64 = await fetchImageAsBase64(currentScene.imageUrl);
               addLog(AgentRole.STAGE_HAND, "Image retrieved successfully.", 'success');
            } else {
               addLog(AgentRole.STAGE_HAND, `No reference image provided. Generating start frame with Nano Banana...`);
               imageBase64 = await generateStageHandImage(currentScene.visualPrompt);
               addLog(AgentRole.STAGE_HAND, "Start frame generated successfully.", 'success');
            }
            
            // Save the asset to the scene state so we can potentially display it (though not displaying strictly in UI yet)
            updateSceneData(currentScene.id, { imageBase64 });

          } catch (err: any) {
             addLog(AgentRole.STAGE_HAND, `Asset preparation failed: ${err.message}. Proceeding with text-only generation.`, 'warning');
             // Proceed without image if stage hand fails
          }
        }

        // C. GENERATION
        updateSceneStatus(currentScene.id, SceneStatus.GENERATING);
        addLog(AgentRole.DIRECTOR, `Scene ${currentScene.id}: Greenlit for Veo generation.`);

        // Determine if we can actually extend (requires handle)
        const canExtend = continuityCheck.shouldExtend && previousScene?.videoHandle;
        
        const videoResult = await generateVeoVideo(
          currentScene,
          previousScene?.videoHandle,
          canExtend,
          imageBase64,
          (log) => addLog(log.role, log.message, log.status)
        );

        console.log('--- VEO GENERATION RESULT ---');
        console.log('Scene ID:', currentScene.id);
        console.log('Video URI:', videoResult.uri);
        console.log('Full Result:', videoResult);
        console.log('-----------------------------');

        // Update Scene with Video
        const updatedSceneData = {
          videoUri: videoResult.uri, // Use raw URI (likely a signed GCS URL)
          videoHandle: videoResult.handle, // Store for next iteration
          status: SceneStatus.COMPLETED
        };

        updateSceneData(currentScene.id, updatedSceneData);
        addLog(AgentRole.GENERATOR, `Scene ${currentScene.id} wrapped. Video ready.`, 'success');

        // Update previousScene pointer (get the latest state)
        previousScene = { ...currentScene, ...updatedSceneData };
      }

      addLog(AgentRole.DIRECTOR, "That's a wrap! All scenes processed.", 'success');

    } catch (error: any) {
      addLog(AgentRole.DIRECTOR, `Critical failure: ${error.message}`, 'error');
    } finally {
      setIsProcessing(false);
      setActiveAgent(null);
    }
  };

  // Helper to update scene state safely
  const updateSceneStatus = (id: number, status: SceneStatus) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  };

  const updateSceneData = (id: number, data: Partial<ScriptScene>) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
  };

  // Helper to check if any videos are ready to play
  const hasPlayableScenes = scenes.some(s => s.status === SceneStatus.COMPLETED && s.videoUri);

  return (
    <Layout>
      {/* FULLSCREEN PLAYER OVERLAY */}
      {showReelPlayer && (
        <ReelPlayer 
          scenes={scenes} 
          onClose={() => setShowReelPlayer(false)} 
        />
      )}

      {/* LEFT PANEL: INPUT & CONTROLS */}
      <div className="w-1/3 border-r border-zinc-800 flex flex-col bg-zinc-900/30">
        <div className="p-6 flex-1 flex flex-col overflow-hidden">
          <div className="mb-4 flex justify-between items-center">
             <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Script Input</h2>
             {!apiKeyReady ? (
               <button 
                onClick={handleSelectKey}
                className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded transition-colors"
               >
                 Connect Google Cloud Billing
               </button>
             ) : (
               <span className="text-xs text-green-500 font-mono">● System Online</span>
             )}
          </div>
          <textarea
            className="flex-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-sm font-mono text-zinc-300 focus:outline-none focus:border-indigo-500 resize-none mb-4"
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            placeholder="Paste your script here... (Optional: Add image URL in description)"
            disabled={isProcessing}
          />
          
          <button
            onClick={runDirector}
            disabled={isProcessing || !apiKeyReady}
            className={`
              w-full py-4 rounded-lg font-bold text-lg tracking-widest uppercase transition-all
              ${isProcessing 
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                : apiKeyReady
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_20px_rgba(79,70,229,0.3)]'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }
            `}
          >
            {isProcessing ? 'Production In Progress...' : 'Action!'}
          </button>
        </div>
      </div>

      {/* CENTER PANEL: AGENT VISUALIZATION */}
      <div className="w-1/3 border-r border-zinc-800 flex flex-col p-6 bg-zinc-950/50">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-6">Agent Topology</h2>
        
        <div className="space-y-4 mb-8">
          <AgentCard 
            role={AgentRole.DIRECTOR}
            isActive={activeAgent === AgentRole.DIRECTOR}
            statusMessage={activeAgent === AgentRole.DIRECTOR ? agentMessage : undefined}
            icon={
              <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            }
          />
          
          <div className="flex gap-4">
             <div className="flex-1">
                <AgentCard 
                  role={AgentRole.PARSER}
                  isActive={activeAgent === AgentRole.PARSER}
                  statusMessage={activeAgent === AgentRole.PARSER ? agentMessage : undefined}
                  icon={<svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                />
             </div>
             <div className="flex-1">
                <AgentCard 
                  role={AgentRole.CONTINUITY_QA}
                  isActive={activeAgent === AgentRole.CONTINUITY_QA}
                  statusMessage={activeAgent === AgentRole.CONTINUITY_QA ? agentMessage : undefined}
                  icon={<svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>}
                />
             </div>
          </div>
          
          <AgentCard 
            role={AgentRole.STAGE_HAND}
            isActive={activeAgent === AgentRole.STAGE_HAND}
            statusMessage={activeAgent === AgentRole.STAGE_HAND ? agentMessage : undefined}
            icon={
              <svg className="w-6 h-6 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            }
          />

          <AgentCard 
            role={AgentRole.GENERATOR}
            isActive={activeAgent === AgentRole.GENERATOR}
            statusMessage={activeAgent === AgentRole.GENERATOR ? agentMessage : undefined}
            icon={
              <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            }
          />
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-2">Neural Logs</h2>
          <ConsoleLog logs={logs} />
        </div>
      </div>

      {/* RIGHT PANEL: OUTPUT GALLERY */}
      <div className="w-1/3 flex flex-col bg-zinc-900/30 overflow-hidden">
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
           <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Scene Gallery</h2>
           {hasPlayableScenes && (
             <button
               onClick={() => setShowReelPlayer(true)}
               className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded flex items-center gap-2 transition-all animate-in fade-in"
             >
               <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
               Play Reel
             </button>
           )}
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {scenes.length === 0 && !isProcessing && (
            <div className="text-zinc-600 text-center mt-20 font-mono text-sm">
              Waiting for production start...
            </div>
          )}
          
          {scenes.map((scene, index) => (
            <React.Fragment key={scene.id}>
              {/* SCENE CARD */}
              <div className="bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800 shadow-xl relative z-10">
                <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
                  <div>
                     <h3 className="font-bold text-zinc-200">Scene {scene.id}: {scene.title}</h3>
                     <div className="flex gap-2 mt-1">
                        <span className={`text-[10px] uppercase px-2 py-0.5 rounded font-bold ${
                          scene.status === SceneStatus.COMPLETED ? 'bg-green-900 text-green-300' : 
                          scene.status === SceneStatus.GENERATING ? 'bg-indigo-900 text-indigo-300 animate-pulse' :
                          scene.status === SceneStatus.PREPARING_ASSETS ? 'bg-pink-900 text-pink-300 animate-pulse' :
                          scene.status === SceneStatus.ANALYZING ? 'bg-blue-900 text-blue-300' :
                          'bg-zinc-800 text-zinc-500'
                        }`}>
                          {scene.status}
                        </span>
                        {scene.isExtension && (
                          <span className="text-[10px] uppercase px-2 py-0.5 rounded font-bold bg-purple-900 text-purple-300">
                             Extended Cut
                          </span>
                        )}
                        {scene.imageUrl && (
                          <span className="text-[10px] uppercase px-2 py-0.5 rounded font-bold bg-zinc-700 text-zinc-300">
                             Has Img Ref
                          </span>
                        )}
                     </div>
                  </div>
                </div>
                
                <div className="aspect-video bg-zinc-900 relative group">
                  {scene.videoUri ? (
                    <video 
                      src={scene.videoUri} 
                      controls 
                      loop 
                      className="w-full h-full object-cover" 
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center relative">
                      {/* Background image preview if available from Stage Hand */}
                      {scene.imageBase64 && (
                        <div className="absolute inset-0 opacity-30">
                          <img 
                            src={`data:image/png;base64,${scene.imageBase64}`} 
                            alt="Stage Hand generated asset"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      
                      <div className="z-10 relative">
                        {scene.status === SceneStatus.GENERATING ? (
                           <div className="flex flex-col items-center gap-4">
                             <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                             <p className="text-xs font-mono text-indigo-400 animate-pulse">Rendering on Google Cloud...</p>
                           </div>
                        ) : scene.status === SceneStatus.PREPARING_ASSETS ? (
                           <div className="flex flex-col items-center gap-4">
                             <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
                             <p className="text-xs font-mono text-pink-400 animate-pulse">Stage Hand: Preparing Assets...</p>
                           </div>
                        ) : (
                           <p className="text-xs font-mono text-zinc-600 line-clamp-3">{scene.visualPrompt}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {scene.feedback && (
                  <div className="p-3 bg-blue-900/10 border-t border-zinc-800">
                     <p className="text-[10px] font-mono text-blue-300">
                       <span className="font-bold text-blue-400">QA Note:</span> {scene.feedback}
                     </p>
                  </div>
                )}
              </div>

              {/* TRANSITION DIVIDER */}
              {index < scenes.length - 1 && (
                <div className="flex flex-col items-center justify-center py-4 relative opacity-60">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-800 -z-10"></div>
                  
                  {scenes[index + 1].isExtension ? (
                    // DIRECT CUT VISUAL
                    <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1 rounded-full border border-zinc-800 text-purple-400">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span className="text-[10px] font-bold tracking-widest uppercase">Direct Cut</span>
                    </div>
                  ) : (
                    // FADE VISUAL
                    <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1 rounded-full border border-zinc-800 text-blue-400">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-[10px] font-bold tracking-widest uppercase">Cross Fade</span>
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          ))}
          
          {/* Spacer for bottom */}
          <div className="h-12"></div>
        </div>
      </div>
    </Layout>
  );
}