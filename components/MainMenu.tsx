
import React, { useState } from 'react';
import { useGameStore } from '../store.ts';
import { Trophy, LogOut, User, Ghost, Play, ArrowRight, Zap, Shield, UserCircle, X, LogIn, Lock, Target, Gem, Crown, Bot } from 'lucide-react';
import { WinCondition, WinType } from '../types.ts';

const AVATAR_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#ec4899'  // Pink
];

const AVATAR_ICONS = [
  { id: 'user', icon: User },
  { id: 'zap', icon: Zap },
  { id: 'shield', icon: Shield },
  { id: 'ghost', icon: Ghost },
];

type AuthMode = 'GUEST' | 'LOGIN' | 'REGISTER' | null;

const MainMenu: React.FC = () => {
  // Use granular selectors to prevent unnecessary re-renders and ensure stable function references
  const user = useGameStore(state => state.user);
  const hasActiveSession = useGameStore(state => state.hasActiveSession);
  
  const startNewGame = useGameStore(state => state.startNewGame);
  const setUIState = useGameStore(state => state.setUIState);
  const logout = useGameStore(state => state.logout);
  const loginAsGuest = useGameStore(state => state.loginAsGuest);
  const loginUser = useGameStore(state => state.loginUser);
  const registerUser = useGameStore(state => state.registerUser);
  const abandonSession = useGameStore(state => state.abandonSession);

  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [showMissionConfig, setShowMissionConfig] = useState(false);
  const [inputName, setInputName] = useState('');
  const [inputPassword, setInputPassword] = useState('');
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[5]); 
  const [selectedIconId, setSelectedIconId] = useState('user');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Mission Config State
  const [selectedWinType, setSelectedWinType] = useState<WinType>('WEALTH');
  const [selectedTarget, setSelectedTarget] = useState<number>(100);
  const [botCount, setBotCount] = useState<number>(1);

  const resetForm = () => {
    setInputName('');
    setInputPassword('');
    setErrorMessage(null);
  };

  const handleNewGameClick = () => {
    if (hasActiveSession) {
      if (window.confirm("Abandon current session and configure a new mission?")) {
        setShowMissionConfig(true);
      }
    } else {
      setShowMissionConfig(true);
    }
  };

  const confirmMissionStart = () => {
    const winCondition: WinCondition = {
      type: selectedWinType,
      target: selectedTarget,
      botCount: botCount,
      label: selectedWinType === 'WEALTH' 
        ? `Accumulate ${selectedTarget} Coins` 
        : `Reach Level ${selectedTarget}`
    };
    startNewGame(winCondition);
    setShowMissionConfig(false);
  };

  const handleLogout = () => {
    if (hasActiveSession) {
      if (window.confirm("Logging out will end your current session. All progress is saved to your profile.")) {
        logout();
      }
    } else {
      logout();
    }
  };

  const handleAuthSubmit = () => {
    setErrorMessage(null);
    if (!inputName.trim()) {
      setErrorMessage("Name is required.");
      return;
    }

    if (authMode === 'GUEST') {
      loginAsGuest(inputName, selectedColor, selectedIconId);
      setAuthMode(null);
      resetForm();
    } else if (authMode === 'LOGIN') {
      if (!inputPassword.trim()) {
        setErrorMessage("Password is required.");
        return;
      }
      const res = loginUser(inputName, inputPassword);
      if (res.success) {
        setAuthMode(null);
        resetForm();
      } else {
        setErrorMessage(res.message || "Login failed.");
      }
    } else if (authMode === 'REGISTER') {
      if (!inputPassword.trim()) {
        setErrorMessage("Password is required.");
        return;
      }
      const res = registerUser(inputName, inputPassword, selectedColor, selectedIconId);
      if (res.success) {
        setAuthMode(null);
        resetForm();
      } else {
        setErrorMessage(res.message || "Registration failed.");
      }
    }
  };

  const renderAvatar = (color: string, iconId: string, size = 'md') => {
    const IconComponent = AVATAR_ICONS.find(i => i.id === iconId)?.icon || User;
    const dims = size === 'lg' ? 'w-16 h-16' : 'w-8 h-8';
    const iconSize = size === 'lg' ? 'w-8 h-8' : 'w-4 h-4';
    
    return (
      <div className={`${dims} rounded-full flex items-center justify-center border-2 border-white/20 shadow-lg`} style={{ backgroundColor: color }}>
        <IconComponent className={`${iconSize} text-white`} />
      </div>
    );
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center pointer-events-auto">
      
      {/* AUTH WIDGET (Top Right) */}
      <div className="absolute top-6 right-6 flex flex-col items-end gap-4 z-50 pointer-events-auto">
        {!user ? (
          <div className="flex gap-3">
             <button 
              onClick={() => { setAuthMode('GUEST'); resetForm(); }}
              className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-slate-800/80 hover:bg-slate-700 backdrop-blur-md rounded-lg border border-slate-600 text-slate-300 hover:text-white transition-all text-xs font-bold uppercase tracking-wider"
            >
              <Ghost className="w-4 h-4" /> Guest
            </button>
             <button 
              onClick={() => { setAuthMode('LOGIN'); resetForm(); }}
              className="cursor-pointer px-4 py-2 bg-slate-900/50 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Login
            </button>
             <button 
              onClick={() => { setAuthMode('REGISTER'); resetForm(); }}
              className="cursor-pointer px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-200 rounded-lg border border-indigo-500/30 text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Register
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4 bg-slate-900/90 p-2 pl-4 rounded-full border border-slate-700 shadow-2xl">
            <div className="flex flex-col items-end">
              <span className="text-sm font-bold text-white leading-tight">{user.nickname}</span>
              <span className="text-[10px] text-slate-400 uppercase tracking-widest">{user.isGuest ? 'Guest Access' : 'Commander'}</span>
            </div>
            {renderAvatar(user.avatarColor, user.avatarIcon, 'md')}
            <div className="h-8 w-px bg-slate-700 mx-1"></div>
            <button 
              onClick={handleLogout}
              className="cursor-pointer p-2 hover:bg-red-500/20 rounded-full text-slate-400 hover:text-red-400 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* CENTER MENU */}
      <div className="flex flex-col gap-6 w-96 z-10">
        
        {/* Title */}
        <div className="text-center mb-6"> {/* Reduced from mb-8 */}
          <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-amber-400 to-amber-600 italic tracking-tighter drop-shadow-[0_0_25px_rgba(245,158,11,0.4)]">
            HexQuest
          </h1>
          <p className="text-xs text-slate-500 font-mono tracking-[0.6em] uppercase mt-2 opacity-60">
            Strategic Expansion Protocol
          </p>
        </div>

        {/* Navigation */}
        <div className="flex flex-col gap-3">
          
          <MenuButton 
            onClick={handleNewGameClick}
            primary 
            icon={<Play className="w-5 h-5 fill-current" />}
            label="New Game"
            subLabel={hasActiveSession ? "Abandon current session" : "Initialize new world"}
          />

          {hasActiveSession && (
             <MenuButton 
              onClick={() => setUIState('GAME')}
              icon={<ArrowRight className="w-5 h-5" />}
              label="Resume Session"
              subLabel="Return to active command"
            />
          )}

          <MenuButton 
            onClick={() => setUIState('LEADERBOARD')}
            icon={<Trophy className="w-5 h-5" />}
            label="Leaderboard"
            subLabel="Global rankings"
          />

          {hasActiveSession && (
            <MenuButton 
              onClick={() => {
                 if (window.confirm("Are you sure you want to end this session? The map will be closed.")) {
                    abandonSession();
                 }
              }}
              icon={<X className="w-5 h-5" />}
              label="End Session"
              subLabel="Close current map"
              danger
            />
          )}

          <MenuButton 
            onClick={() => {
              if (hasActiveSession && !window.confirm("Active session will be closed. Exit?")) return;
              window.close();
              alert("Application Exit Simulated");
            }}
            icon={<LogOut className="w-5 h-5" />}
            label="Exit to Desktop"
          />
        </div>
      </div>

      {/* AUTH MODAL */}
      {authMode && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl shadow-2xl w-96 relative">
            <button 
              onClick={() => setAuthMode(null)}
              className="cursor-pointer absolute top-4 right-4 text-slate-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              {authMode === 'GUEST' && <Ghost className="w-6 h-6 text-indigo-400" />}
              {authMode === 'LOGIN' && <LogIn className="w-6 h-6 text-indigo-400" />}
              {authMode === 'REGISTER' && <UserCircle className="w-6 h-6 text-indigo-400" />}
              
              {authMode === 'GUEST' ? 'Guest Identity' : (authMode === 'LOGIN' ? 'Access Terminal' : 'New Commission')}
            </h2>

            <div className="space-y-4">
              {errorMessage && (
                <div className="p-3 bg-red-950/50 border border-red-900 rounded-lg text-red-400 text-xs font-bold text-center">
                  {errorMessage}
                </div>
              )}

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2 block">
                  {authMode === 'LOGIN' ? 'Username' : 'Callsign'}
                </label>
                <input 
                  type="text" 
                  value={inputName}
                  onChange={(e) => setInputName(e.target.value)}
                  placeholder="Enter name..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  maxLength={16}
                />
              </div>

              {authMode !== 'GUEST' && (
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2 block">
                    Password
                  </label>
                  <div className="relative">
                    <input 
                      type="password" 
                      value={inputPassword}
                      onChange={(e) => setInputPassword(e.target.value)}
                      placeholder="******"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors pl-10"
                    />
                    <Lock className="w-4 h-4 text-slate-600 absolute left-3 top-3.5" />
                  </div>
                </div>
              )}

              {authMode === 'REGISTER' && (
                <>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2 block">Avatar Color</label>
                    <div className="flex gap-2 flex-wrap">
                      {AVATAR_COLORS.map(c => (
                        <button 
                          key={c}
                          onClick={() => setSelectedColor(c)}
                          className={`cursor-pointer w-8 h-8 rounded-full border-2 ${selectedColor === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'} transition-all`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2 block">Insignia</label>
                    <div className="flex gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800">
                      {AVATAR_ICONS.map(i => {
                        const Icon = i.icon;
                        return (
                          <button 
                            key={i.id}
                            onClick={() => setSelectedIconId(i.id)}
                            className={`cursor-pointer flex-1 h-10 rounded-lg flex items-center justify-center transition-all ${selectedIconId === i.id ? 'bg-slate-800 text-white shadow-inner' : 'text-slate-600 hover:text-slate-400'}`}
                          >
                            <Icon className="w-5 h-5" />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Action Buttons */}
              <button 
                onClick={handleAuthSubmit}
                className="cursor-pointer w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95 mt-4"
              >
                {authMode === 'LOGIN' ? 'Authenticate' : 'Establish Link'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MISSION CONFIG MODAL */}
      {showMissionConfig && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl shadow-2xl w-[500px] relative overflow-hidden">
             {/* Decorative header line */}
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-indigo-500 to-amber-500"></div>

             <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tight flex items-center gap-3">
               <Target className="w-8 h-8 text-amber-500" /> Mission Config
             </h2>
             <p className="text-slate-500 font-mono text-xs uppercase tracking-widest mb-8">Select Victory Parameters</p>

             <div className="grid grid-cols-2 gap-4 mb-6">
                <button 
                  onClick={() => { setSelectedWinType('WEALTH'); setSelectedTarget(100); }}
                  className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all ${selectedWinType === 'WEALTH' ? 'bg-amber-500/10 border-amber-500' : 'bg-slate-950 border-slate-800 opacity-50 hover:opacity-100'}`}
                >
                   <Gem className={`w-8 h-8 ${selectedWinType === 'WEALTH' ? 'text-amber-500' : 'text-slate-500'}`} />
                   <span className="font-bold text-sm uppercase">Wealth</span>
                </button>
                <button 
                  onClick={() => { setSelectedWinType('DOMINATION'); setSelectedTarget(5); }}
                  className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all ${selectedWinType === 'DOMINATION' ? 'bg-indigo-500/10 border-indigo-500' : 'bg-slate-950 border-slate-800 opacity-50 hover:opacity-100'}`}
                >
                   <Crown className={`w-8 h-8 ${selectedWinType === 'DOMINATION' ? 'text-indigo-500' : 'text-slate-500'}`} />
                   <span className="font-bold text-sm uppercase">Domination</span>
                </button>
             </div>

             <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 mb-6">
               <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-4 block text-center">
                 {selectedWinType === 'WEALTH' ? 'Target Accumulation (Credits)' : 'Target Rank (Level)'}
               </label>
               <div className="flex justify-between gap-2">
                 {selectedWinType === 'WEALTH' ? (
                   [100, 500, 1000].map(val => (
                     <button 
                      key={val}
                      onClick={() => setSelectedTarget(val)}
                      className={`flex-1 py-3 rounded-xl font-mono font-bold border transition-all ${selectedTarget === val ? 'bg-amber-500 text-slate-900 border-amber-500' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-600'}`}
                     >
                       {val}
                     </button>
                   ))
                 ) : (
                   [5, 7, 10].map(val => (
                     <button 
                      key={val}
                      onClick={() => setSelectedTarget(val)}
                      className={`flex-1 py-3 rounded-xl font-mono font-bold border transition-all ${selectedTarget === val ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-600'}`}
                     >
                       L{val}
                     </button>
                   ))
                 )}
               </div>
             </div>

             {/* BOT COUNT SELECTOR */}
             <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 mb-8">
               <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-4 block text-center flex items-center justify-center gap-2">
                 <Bot className="w-3 h-3"/> Threat Level (Bots)
               </label>
               <div className="flex justify-between gap-2">
                   {[1, 2, 3].map(val => (
                     <button 
                      key={val}
                      onClick={() => setBotCount(val)}
                      className={`flex-1 py-3 rounded-xl font-mono font-bold border transition-all ${botCount === val ? 'bg-red-500 text-white border-red-500' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-600'}`}
                     >
                       {val}
                     </button>
                   ))}
               </div>
             </div>

             <div className="flex gap-4">
               <button 
                 onClick={() => setShowMissionConfig(false)}
                 className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors uppercase text-xs tracking-wider"
               >
                 Cancel
               </button>
               <button 
                 onClick={confirmMissionStart}
                 className="flex-1 py-4 bg-white hover:bg-slate-200 text-slate-900 font-bold rounded-xl shadow-lg transition-colors uppercase text-xs tracking-wider"
               >
                 Initialize
               </button>
             </div>

          </div>
        </div>
      )}

    </div>
  );
};

// Sub-component for Menu Buttons
const MenuButton = ({ onClick, icon, label, subLabel, primary, danger }: any) => (
  <button 
    onClick={onClick}
    className={`cursor-pointer group w-full text-left px-6 py-4 rounded-2xl border transition-all duration-300 relative overflow-hidden
      ${primary 
        ? 'bg-amber-500 border-amber-400 text-slate-900 shadow-[0_0_30px_rgba(245,158,11,0.3)] hover:shadow-[0_0_50px_rgba(245,158,11,0.5)]' 
        : danger 
          ? 'bg-red-950/30 border-red-900/50 hover:bg-red-900/50 hover:border-red-500/50 text-red-200'
          : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800/80 hover:border-slate-600 text-slate-300'
      }
    `}
  >
    <div className="flex items-center justify-between relative z-10">
      <div className="flex items-center gap-4">
        <div className={`p-2 rounded-lg ${primary ? 'bg-black/10' : 'bg-slate-950/50'}`}>
          {icon}
        </div>
        <div>
          <div className={`font-black uppercase tracking-wider text-sm ${primary ? 'text-slate-900' : 'text-white'}`}>{label}</div>
          {subLabel && <div className={`text-[10px] font-mono mt-0.5 ${primary ? 'text-slate-800/70' : 'text-slate-500 group-hover:text-slate-400'}`}>{subLabel}</div>}
        </div>
      </div>
      <ArrowRight className={`w-4 h-4 transition-transform group-hover:translate-x-1 ${primary ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
    </div>
  </button>
);

export default MainMenu;
