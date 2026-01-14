import React from 'react';
import { useGameStore } from '../store.ts';
import { Trophy, Coins, Layers, ArrowLeft, User, Zap, Shield, Ghost, Bot } from 'lucide-react';

const Leaderboard: React.FC = () => {
  const leaderboard = useGameStore(state => state.leaderboard);
  const user = useGameStore(state => state.user);
  const setUIState = useGameStore(state => state.setUIState);

  const getIconComponent = (id: string) => {
    switch(id) {
        case 'bot': return Bot;
        case 'zap': return Zap;
        case 'shield': return Shield;
        case 'ghost': return Ghost;
        default: return User;
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center p-12 pointer-events-auto">
      <div className="w-full max-w-4xl bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-full">
        
        {/* Header */}
        <div className="p-8 border-b border-slate-800 flex items-center justify-between bg-black/20">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20">
              <Trophy className="w-8 h-8 text-amber-500" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white uppercase tracking-wider">Hall of Fame</h2>
              <p className="text-slate-500 text-xs font-mono tracking-widest uppercase">Best Recorded Performance</p>
            </div>
          </div>
          <button 
            onClick={() => setUIState('MENU')}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-xs font-bold uppercase tracking-wider"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Menu
          </button>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-8 py-4 bg-slate-950/50 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] border-b border-slate-800">
          <div className="col-span-1 text-center">#</div>
          <div className="col-span-7">Commander</div>
          <div className="col-span-2 text-right">Max Credits</div>
          <div className="col-span-2 text-right">Max Rank</div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 no-scrollbar">
          {leaderboard.map((entry, index) => {
            const IconCmp = getIconComponent(entry.avatarIcon);
            const isSelf = user && entry.nickname === user.nickname;
            
            return (
            <div 
              key={`${entry.nickname}-${index}`}
              className={`grid grid-cols-12 gap-4 px-8 py-5 items-center border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors
                ${isSelf ? 'bg-indigo-900/20 border-l-4 border-l-indigo-500' : ''}
              `}
            >
              <div className="col-span-1 text-center font-mono text-slate-500 font-bold">{index + 1}</div>
              
              <div className="col-span-7 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full flex-shrink-0 border border-white/10 flex items-center justify-center shadow-lg" style={{ backgroundColor: entry.avatarColor }}>
                  <IconCmp className="w-5 h-5 text-white" />
                </div>
                <div className="flex flex-col">
                  <span className={`font-bold ${isSelf ? 'text-indigo-400' : 'text-white'}`}>{entry.nickname}</span>
                  <span className="text-[9px] text-slate-600 font-mono mt-0.5">
                    {new Date(entry.timestamp).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="col-span-2 text-right font-mono text-amber-500 font-bold flex items-center justify-end gap-2">
                {entry.maxCoins} <Coins className="w-3 h-3 opacity-50" />
              </div>

              <div className="col-span-2 text-right font-mono text-emerald-400 font-bold flex items-center justify-end gap-2">
                L{entry.maxLevel} <Layers className="w-3 h-3 opacity-50" />
              </div>
            </div>
            );
          })}
          
          {leaderboard.length === 0 && (
            <div className="p-8 text-center text-slate-500">No records found.</div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Leaderboard;