import React, { useState, useRef, useEffect } from 'react';
import { ScriptScene, SceneStatus } from '../types';

interface ReelPlayerProps {
  scenes: ScriptScene[];
  onClose: () => void;
}

export const ReelPlayer: React.FC<ReelPlayerProps> = ({ scenes, onClose }) => {
  // Filter only completed scenes with valid URIs
  const playableScenes = scenes.filter(
    s => s.status === SceneStatus.COMPLETED && s.videoUri
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Auto-play when component mounts or index changes
    const video = videoRef.current;
    if (video) {
      video.play().catch(e => console.error("Autoplay failed:", e));
      setIsPlaying(true);
    }
  }, [currentIndex]);

  const handleVideoEnd = () => {
    const nextIndex = currentIndex + 1;

    // Check if we reached the end
    if (nextIndex >= playableScenes.length) {
      setIsPlaying(false);
      return;
    }

    const nextScene = playableScenes[nextIndex];
    const isDirectCut = nextScene.isExtension;

    if (isDirectCut) {
      // DIRECT CUT: Immediate switch
      setCurrentIndex(nextIndex);
    } else {
      // FADE EFFECT: Fade out -> Switch -> Fade In
      setOpacity(0); // Fade out
      setTimeout(() => {
        setCurrentIndex(nextIndex);
        // Allow DOM to update source then fade back in
        setTimeout(() => {
          setOpacity(1);
        }, 100); 
      }, 600); // Wait for CSS transition (500ms)
    }
  };

  const currentScene = playableScenes[currentIndex];

  if (!currentScene) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center animate-in fade-in duration-300">
      {/* Player Container */}
      <div className="relative w-full h-full max-w-7xl max-h-screen flex items-center justify-center">
        <video
          ref={videoRef}
          src={currentScene.videoUri}
          className="max-w-full max-h-full transition-opacity duration-500 ease-in-out"
          style={{ opacity: opacity }}
          onEnded={handleVideoEnd}
          onClick={() => {
            if (videoRef.current?.paused) videoRef.current.play();
            else videoRef.current?.pause();
          }}
          controls={false} // Custom controls or click to pause
        />
        
        {/* Overlay Info (Briefly shows scene info on start or hover) */}
        <div className="absolute bottom-12 left-0 right-0 p-8 pointer-events-none opacity-0 hover:opacity-100 transition-opacity duration-300 flex justify-center">
          <div className="bg-black/60 backdrop-blur-md px-6 py-3 rounded-full text-white font-mono text-sm border border-white/10">
            Playing Scene {currentScene.id}: {currentScene.title}
          </div>
        </div>
      </div>

      {/* Close Button */}
      <button 
        onClick={onClose}
        className="absolute top-6 right-6 z-50 p-3 bg-zinc-900/80 rounded-full text-white hover:bg-zinc-800 border border-zinc-700 transition-all hover:scale-110"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Replay / End Screen */}
      {!isPlaying && currentIndex >= playableScenes.length - 1 && videoRef.current?.ended && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center flex-col gap-6">
          <h2 className="text-3xl font-bold tracking-widest uppercase text-white">Production Wrapped</h2>
          <button 
            onClick={() => { setCurrentIndex(0); setIsPlaying(true); setOpacity(1); }}
            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold tracking-wider transition-all shadow-[0_0_20px_rgba(79,70,229,0.5)]"
          >
            Watch Again
          </button>
          <button 
            onClick={onClose}
            className="text-zinc-400 hover:text-white font-mono text-sm"
          >
            Back to Studio
          </button>
        </div>
      )}
    </div>
  );
};