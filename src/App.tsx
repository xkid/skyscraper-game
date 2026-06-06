import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gesture, useGestureRecognizer, detectGesture } from './useGesture';
import { addScoreToLeaderboard, getTopScores, LeaderboardEntry } from './firebase';
import { useWebcam } from './useWebcam';
import { Play, Trophy, Camera, RefreshCw, Volume2, VolumeX } from 'lucide-react';
import { audioSystem } from './audio';

const GESTURE_ICONS: Record<Gesture, string> = {
  rock: '✊',
  paper: '🖐️',
  scissors: '✌️',
  unknown: '❓'
};

const NUMBER_TO_CHINESE = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
function toChineseFloor(n: number) {
  if (n <= 10) return NUMBER_TO_CHINESE[n];
  const tens = Math.floor(n / 10);
  const units = n % 10;
  if (n < 20) return `十${units === 0 ? '' : NUMBER_TO_CHINESE[units]}`;
  return `${NUMBER_TO_CHINESE[tens]}十${units === 0 ? '' : NUMBER_TO_CHINESE[units]}`;
}

function speak(text: string, rate: number = 1.0): Promise<void> {
  return new Promise((resolve) => {
    window.speechSynthesis.cancel();
    if (audioSystem.getMuted()) {
      return resolve();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = rate;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    // Safety timeout in case TTS hangs
    setTimeout(() => resolve(), 3000 / rate);
    window.speechSynthesis.speak(utterance);
  });
}

export default function App() {
  const { recognizer, isReady } = useGestureRecognizer();
  const videoRef = useRef<HTMLVideoElement>(null);
  useWebcam(videoRef);
  
  const [appState, setAppState] = useState<'name_input' | 'ready' | 'playing' | 'collapsed' | 'gameover'>('name_input');
  const [score, setScore] = useState(0);

  const [actionText, setActionText] = useState('准备建楼！');
  const [playerGesture, setPlayerGesture] = useState<Gesture>('unknown');
  const [computerGesture, setComputerGesture] = useState<Gesture>('unknown');
  
  const [playerName, setPlayerName] = useState('挑战者');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  
  const playingRef = useRef(false);

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(prev => {
      const next = !prev;
      audioSystem.setMuted(next);
      return next;
    });
  };

  useEffect(() => {
    refreshLeaderboard();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (appState === 'ready' || appState === 'gameover') {
          e.preventDefault();
          startGame();
        } else if (appState === 'collapsed') {
          e.preventDefault();
          setAppState('gameover');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appState, isReady]);

  const handleScreenTap = () => {
    if (appState === 'ready' || appState === 'gameover') {
      startGame();
    } else if (appState === 'collapsed') {
      setAppState('gameover');
    }
  };

  const refreshLeaderboard = async () => {
    const scores = await getTopScores();
    setLeaderboard(scores);
  };

  const startGame = async () => {
    if (!isReady || !recognizer) return;
    
    audioSystem.startBGM();
    audioSystem.playStart();

    setAppState('playing');
    setScore(0);
    setPlayerGesture('unknown');
    setComputerGesture('unknown');
    playingRef.current = true;
    
    setActionText('高！楼！大！厦！');
    await speak('高楼大厦', 2.0);
    
    if (playingRef.current) {
      runGameLoop(0);
    }
  };

  const stopGame = () => {
    playingRef.current = false;
    setAppState('ready');
  };

  const runGameLoop = async (currentScore: number) => {
    if (!playingRef.current) return;
    
    const speedLevel = Math.floor(currentScore / 10);
    const speechRate = Math.min(2.0, 1.2 + (speedLevel * 0.1));
    
    const floorSpeech = `${toChineseFloor(currentScore + 1)}楼！`;
    setActionText(floorSpeech);
    setComputerGesture('unknown');
    setPlayerGesture('unknown');
    
    await speak(floorSpeech, speechRate);
    
    if (!playingRef.current) return;
    if (!recognizer || !videoRef.current) return;
    
    let finalGesture: Gesture = 'unknown';
    const startTime = Date.now();
    
    // Game speed increases every 10 floors
    const timeLimit = Math.max(600, 1500 - (speedLevel * 200));
    const winWaitTime = Math.max(300, 800 - (speedLevel * 100));
    
    // Give player time to show gesture, continuously sampling
    while (Date.now() - startTime < timeLimit) {
      await new Promise(r => setTimeout(r, 50)); // Sample faster
      if (!playingRef.current) return;
      
      if (videoRef.current.readyState >= 2) {
        const g = detectGesture(recognizer, videoRef.current);
        if (g !== 'unknown') {
          finalGesture = g;
        }
        setPlayerGesture(g); // Real-time feedback
      }
    }
    
    if (!playingRef.current) return;

    const pGesture = finalGesture;
    setPlayerGesture(pGesture); // Lock the final gesture
    
    const gestures: Gesture[] = ['rock', 'paper', 'scissors'];
    const compGesture = gestures[Math.floor(Math.random() * 3)];
    
    setComputerGesture(compGesture);
    
    if (pGesture === compGesture || pGesture === 'unknown') {
      // LOSE
      playingRef.current = false;
      audioSystem.playCollapse();
      setAppState('collapsed');
      setActionText(pGesture === 'unknown' ? '未侦测到手势，塌楼！' : '平局，塌楼！');
      await speak('塌楼！');
      
      if (playerName && currentScore > 0) {
         await addScoreToLeaderboard(playerName, currentScore);
         refreshLeaderboard();
      }
    } else {
      // WIN
      audioSystem.playBuildSuccess();
      setScore(currentScore + 1);
      await new Promise(r => setTimeout(r, winWaitTime));
      if (playingRef.current) {
        runGameLoop(currentScore + 1);
      }
    }
  };

  return (
    <div 
      className="flex flex-col h-[100dvh] w-full overflow-hidden bg-[#050B18] text-slate-100 font-sans selection:bg-cyan-500/30 relative"
      onClick={handleScreenTap}
    >
      {/* Background Atmosphere */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px]"></div>
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZmlsdGVyIGlkPSdub2lzZSc+PGZlVHVyYnVsZW5jZSB0eXBlPSdmcmFjdGFsTm9pc2UnIGJhc2VGcmVxdWVuY3k9JzAuNjUnIG51bVRpbGVzPSc0JyBzdGlja2U9J3RydWUnLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9J3VybCgjbm9pc2UpJyBvcGFjaXR5PScwLjA1Jy8+PC9zdmc+')] opacity-20"></div>
      </div>

      {/* Camera Background (Always rendered for ref initialization) */}
      <video 
        ref={videoRef} 
        className={`absolute inset-0 w-full h-full object-cover mirrored ${appState === 'name_input' ? 'opacity-10' : 'opacity-30'}`} 
        playsInline 
        muted 
        autoPlay
      />

      {appState === 'name_input' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-sm px-4" onClick={(e) => e.stopPropagation()}>
           <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center w-full">
              <h1 className="text-5xl md:text-6xl font-black italic text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-500 mb-8 uppercase text-center drop-shadow-2xl">
                高楼大厦<br/>
                <span className="text-2xl md:text-3xl text-cyan-400 mt-2 block tracking-widest bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">BUILDING TOWER</span>
              </h1>
              
              <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-8 shadow-2xl backdrop-blur-xl w-full max-w-sm flex flex-col gap-8">
                <div className="flex flex-col gap-3">
                  <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Player Name</label>
                  <input 
                    type="text" 
                    value={playerName}
                    onChange={e => setPlayerName(e.target.value)}
                    onKeyDown={e => {
                       if (e.key === 'Enter' && playerName.trim()) {
                          setAppState('ready');
                       }
                    }}
                    className="bg-black/30 border border-cyan-500/30 text-cyan-300 focus:outline-none focus:border-cyan-400 w-full font-mono text-lg px-4 py-3 rounded-xl transition-colors"
                    placeholder="ENTER NAME"
                  />
                </div>
                
                <button 
                  onClick={() => playerName.trim() && setAppState('ready')}
                  disabled={!playerName.trim()}
                  className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:hover:bg-cyan-500 text-slate-900 font-black py-4 rounded-xl shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-all active:scale-95 text-lg tracking-widest uppercase"
                >
                  START INITIATION
                </button>
              </div>
           </motion.div>
        </div>
      )}

      {appState !== 'name_input' && (
         <>
            {/* Overlay Gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#050B18] via-transparent to-[#050B18]/50 pointer-events-none"></div>

            {/* Support button to close back to name manually? */}
            <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
               <button 
                 onClick={handleToggleMute} 
                 className="bg-black/50 text-cyan-400 p-2 rounded-full border border-cyan-400/30 hover:bg-cyan-900/50 transition-colors"
               >
                 {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
               </button>
               {appState === 'playing' && (
                 <button onClick={(e) => { e.stopPropagation(); stopGame(); }} className="bg-red-500/20 text-red-500 px-4 py-2 rounded-full text-xs font-bold font-mono tracking-widest border border-red-500/30">ABORT</button>
               )}
            </div>

            {/* Top Gestures Area */}
            <div className="absolute top-10 md:top-20 inset-x-0 flex justify-between px-8 md:px-32 pointer-events-none z-20">
               <div className="flex flex-col items-center">
                 <span className="text-[10px] md:text-xs text-cyan-400 font-mono font-bold tracking-widest uppercase bg-black/60 border border-white/5 px-4 py-1.5 rounded-full backdrop-blur">AI System</span>
                 <div className="mt-4 text-7xl md:text-[100px] drop-shadow-[0_0_20px_rgba(34,211,238,0.5)]">
                    {(appState === 'playing' || appState === 'collapsed') ? GESTURE_ICONS[computerGesture] : '🤖'}
                 </div>
               </div>
               
               <div className="flex flex-col items-center">
                 <span className="text-[10px] md:text-xs text-purple-400 font-mono font-bold tracking-widest uppercase bg-black/60 border border-white/5 px-4 py-1.5 rounded-full backdrop-blur">{playerName}</span>
                 <div className="mt-4 text-7xl md:text-[100px] drop-shadow-[0_0_20px_rgba(168,85,247,0.5)]">
                    {(appState === 'playing' || appState === 'collapsed') ? GESTURE_ICONS[playerGesture] : '👤'}
                 </div>
               </div>
            </div>

            {/* Action Text Area */}
            <div className="absolute top-[30%] left-1/2 -translate-x-1/2 text-center pointer-events-none z-20 w-full px-4">
               {(appState === 'playing' || appState === 'collapsed') && (
                 <motion.h1 
                    key={actionText}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`text-5xl md:text-7xl font-black tracking-tighter uppercase italic drop-shadow-[0_5px_15px_rgba(0,0,0,0.5)] ${
                      appState === 'collapsed' 
                        ? 'text-red-500 bg-none' 
                        : 'text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-300'
                    }`}>
                   {actionText}
                 </motion.h1>
               )}
               {appState === 'collapsed' && (
                 <motion.div
                   initial={{ opacity: 0 }}
                   animate={{ opacity: 1 }}
                   transition={{ delay: 2 }}
                   className="mt-8"
                 >
                   <span className="text-xs md:text-sm border border-white/20 bg-black/50 backdrop-blur-md px-6 py-2 rounded-full font-bold text-slate-300 tracking-widest font-mono animate-pulse">
                     [ TAP OR SPACE FOR LEADERBOARD ]
                   </span>
                 </motion.div>
               )}
               {appState === 'ready' && (
                 <h2 className="text-xl md:text-3xl font-black text-white tracking-widest animate-pulse drop-shadow-2xl bg-black/40 border border-white/10 px-8 py-4 rounded-full backdrop-blur-md inline-block">
                   {isReady ? 'TAP OR SPACE TO START' : 'CALIBRATING CAMERA...'}
                 </h2>
               )}
            </div>

            {/* Tower Section (Bottom Center) */}
            <div className="absolute bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 flex flex-col-reverse w-full max-h-[50vh] pb-4 pointer-events-none z-20 overflow-visible">
               <motion.div 
                 className="flex flex-col-reverse items-center w-full gap-1"
                 animate={{ y: score > 5 ? (score - 5) * 48 : 0 }}
                 transition={{ type: 'spring', bounce: 0.2 }}
               >
                 {/* Ground Base */}
                 <div className="w-56 md:w-64 h-10 flex-shrink-0 bg-slate-800 border-t-2 border-slate-600 rounded-sm shadow-2xl z-20 flex items-center justify-center">
                   <span className="text-slate-500 font-black tracking-widest text-[10px] uppercase">FOUNDATION</span>
                 </div>
                 
                 {/* Floors */}
                 <AnimatePresence>
                   {(appState === 'playing' || appState === 'collapsed') && Array.from({ length: score }).map((_, i) => {
                      const isGameOver = appState === 'collapsed';
                      const isTop = i === score - 1;
                      
                      // Physical properties for collapse
                      const dir = i % 2 === 0 ? 1 : -1;
                      const rotate = dir * (Math.random() * 60 + 30);
                      const throwX = dir * (Math.random() * 300 + 100);

                      return (
                        <motion.div
                           key={i}
                           initial={{ y: -100, opacity: 0 }}
                           animate={isGameOver ? {
                              y: 600 + (Math.random() * 400), 
                              x: throwX,
                              rotate: rotate,
                              opacity: 0,
                              transition: { duration: 1.8, type: 'spring', bounce: 0.2, delay: i * 0.08 }
                           } : { 
                              y: 0, 
                              x: 0,
                              rotate: 0,
                              opacity: 1,
                              transition: { type: 'spring', bounce: 0.4 }
                           }}
                           exit={{ opacity: 0, transition: { duration: 0.2 } }}
                           className={`h-10 md:h-12 border rounded-sm flex items-center justify-center relative flex-shrink-0 z-10 ${
                             isTop ? 'bg-blue-600/90 border-cyan-400 border-2 shadow-[0_0_20px_rgba(37,99,235,0.4)]' : 'bg-slate-700/80 border-white/10'
                           }`}
                           style={{ width: `${Math.max(100, 160 - (i * 2))}px` }}
                        >
                          {/* Windows */}
                          <span className="absolute -left-12 text-[10px] font-mono text-cyan-400 font-bold">{i + 1}F</span>
                          <div className="flex gap-2">
                            <div className={`w-3 md:w-4 h-5 md:h-6 ${isTop ? 'bg-white/40' : 'bg-cyan-400/20 border border-cyan-400/30'}`}></div>
                            <div className={`w-3 md:w-4 h-5 md:h-6 ${isTop ? 'bg-white/40' : 'bg-cyan-400/20 border border-cyan-400/30'}`}></div>
                          </div>
                        </motion.div>
                      )
                   })}
                 </AnimatePresence>
               </motion.div>
            </div>
            
            {/* Height Display absolute bottom left */}
            <div className="absolute bottom-6 md:bottom-12 left-6 md:left-12 flex flex-col z-20 pointer-events-none">
              <div className="text-6xl md:text-8xl font-black italic tracking-tighter text-cyan-400 drop-shadow-[0_0_20px_rgba(34,211,238,0.5)]">
                {score}
              </div>
              <div className="text-[10px] md:text-xs tracking-[0.4em] uppercase font-bold text-slate-400">Floors</div>
            </div>

            {/* Scanner Line while playing */}
            {appState === 'playing' && (
              <motion.div 
                animate={{ top: ['0%', '100%', '0%'] }} 
                transition={{ duration: 3, ease: 'linear', repeat: Infinity }}
                className="absolute left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_cyan] opacity-30 z-30 pointer-events-none"
              />
            )}
         </>
      )}

      {/* Leaderboard Overlay (Screen 3) */}
      <AnimatePresence>
      {appState === 'gameover' && (
         <motion.div 
           initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
           className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md px-4"
         >
            {/* GAME OVER TEXT */}
            <div className="mb-8 text-center pointer-events-none">
              <h1 className="text-6xl md:text-8xl font-black italic text-red-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.8)] uppercase tracking-tighter">
                 COLLAPSE
              </h1>
              <p className="text-xl font-bold mt-4 text-white font-mono bg-red-500/20 px-6 py-2 rounded-full border border-red-500/30 inline-block">FINAL HEIGHT: {score}F</p>
            </div>

            {/* Leaderboard Panel */}
            <div className="w-full max-w-md bg-white/[0.03] border border-white/10 rounded-3xl p-6 flex flex-col max-h-[40vh] shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                   <h2 className="text-lg font-black italic uppercase tracking-widest text-white flex gap-2 items-center">
                     <Trophy className="w-5 h-5 text-amber-400" /> Leaderboard
                   </h2>
                </div>
                
                <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar">
                    {leaderboard.map((entry, idx) => (
                      <div key={entry.id || idx} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                        <div className="flex items-center gap-4">
                          <span className={`text-xl font-black italic ${idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-amber-700' : 'text-slate-600'}`}>
                            {(idx + 1).toString().padStart(2, '0')}
                          </span>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-200">{entry.playerName || 'GUEST'}</span>
                          </div>
                        </div>
                        <span className="text-lg font-mono font-bold text-cyan-400">{entry.score}F</span>
                      </div>
                    ))}
                    {leaderboard.length === 0 && <div className="text-center text-slate-500 py-8 text-sm font-mono tracking-widest uppercase">No records found.</div>}
                </div>
            </div>

            <h2 className="mt-12 text-sm md:text-lg font-bold text-slate-300 tracking-[0.3em] font-mono animate-pulse pointer-events-none">
               [ TAP OR SPACE TO RESTART ]
            </h2>
         </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
