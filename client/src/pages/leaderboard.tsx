import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, ArrowDownUp, Lock, Menu, X, LogOut, Trophy, TrendingUp, Users } from "lucide-react";
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import nekomancerLogo from "@assets/nekomancer-logo.png";

interface SwapLeaderboardEntry {
  walletAddress: string;
  totalVolumeMon: number;
  swapCount: number;
}

interface StakingLeaderboardEntry {
  walletAddress: string;
  totalStaked: number;
  stakeCount: number;
}

export default function Leaderboard() {
  const [activeTab, setActiveTab] = useState("swappers");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();

  const [swapLeaderboard, setSwapLeaderboard] = useState<SwapLeaderboardEntry[]>([]);
  const [stakingLeaderboard, setStakingLeaderboard] = useState<StakingLeaderboardEntry[]>([]);
  const [totalVolume, setTotalVolume] = useState(0);
  const [totalSwappers, setTotalSwappers] = useState(0);
  const [totalStaked, setTotalStaked] = useState(0);
  const [totalStakers, setTotalStakers] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboards = async () => {
      try {
        const [swapRes, stakingRes] = await Promise.all([
          fetch('/api/leaderboard'),
          fetch('/api/staking/leaderboard'),
        ]);
        
        if (swapRes.ok) {
          const swapData = await swapRes.json();
          setSwapLeaderboard(swapData.leaderboard || []);
          setTotalVolume(swapData.totalVolume || 0);
          setTotalSwappers(swapData.totalSwappers || 0);
        }
        
        if (stakingRes.ok) {
          const stakingData = await stakingRes.json();
          setStakingLeaderboard(stakingData.leaderboard || []);
          setTotalStaked(stakingData.totalStaked || 0);
          setTotalStakers(stakingData.totalStakers || 0);
        }
      } catch (error) {
        console.error('Error fetching leaderboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboards();
    const interval = setInterval(fetchLeaderboards, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-black via-purple-950/20 to-black" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <header className="fixed top-0 left-0 right-0 z-50 border-b border-primary/20 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link href="/">
              <div className="flex items-center gap-3 cursor-pointer group">
                <div className="w-10 h-10 rounded-lg bg-black border border-primary/50 flex items-center justify-center overflow-hidden p-1.5 group-hover:border-primary transition-colors">
                  <img src={nekomancerLogo} alt="Logo" className="w-full h-full object-contain" />
                </div>
                <div className="flex flex-col">
                  <span className="font-display text-xl md:text-2xl text-white tracking-widest leading-none group-hover:text-primary transition-colors">NEKO<span className="text-primary">MANCER</span></span>
                  <span className="text-[10px] font-mono text-muted-foreground tracking-[0.2em] uppercase">Leaderboard</span>
                </div>
              </div>
            </Link>

            <div className="flex items-center gap-3">
              {!authenticated ? (
                <button onClick={() => login()} className="neko-button-primary flex items-center gap-2 px-4 py-2 text-sm" data-testid="button-connect">
                  <Wallet className="w-4 h-4" />
                  <span className="font-display tracking-wider">CONNECT</span>
                </button>
              ) : (
                <button className="neko-button-primary flex items-center gap-2 px-4 py-2 text-sm" data-testid="button-connected">
                  <Wallet className="w-4 h-4" />
                  <span className="font-mono text-xs">
                    {wallets[0]?.address ? formatAddress(wallets[0].address) : 'Connected'}
                  </span>
                </button>
              )}

              <button onClick={() => setMobileMenuOpen(true)} className="p-2 bg-white/5 hover:bg-primary/20 rounded-lg transition-colors border border-white/10" data-testid="button-menu">
                <Menu className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]" onClick={() => setMobileMenuOpen(false)} />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="fixed top-0 right-0 bottom-0 w-80 max-w-[85vw] bg-black border-l border-primary/30 z-[101] overflow-y-auto">
              <div className="relative flex items-center justify-between p-5 border-b border-primary/20 bg-black/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-black border border-primary/50 flex items-center justify-center overflow-hidden p-1">
                    <img src={nekomancerLogo} alt="Logo" className="w-full h-full object-contain" />
                  </div>
                  <span className="font-display text-xl text-white tracking-wider">MENU</span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="p-2 bg-white/5 hover:bg-primary/20 rounded-lg transition-colors border border-white/10">
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
              
              <div className="relative p-5 space-y-3">
                <Link href="/swap" onClick={() => setMobileMenuOpen(false)} className="block">
                  <button className="w-full neko-button-primary flex items-center justify-center gap-2 px-4 py-3">
                    <ArrowDownUp className="w-4 h-4" />
                    <span className="font-display tracking-wider">SUMMON SWAP</span>
                  </button>
                </Link>
                
                <Link href="/staking" onClick={() => setMobileMenuOpen(false)} className="block">
                  <button className="w-full neko-button-secondary flex items-center justify-center gap-2 px-4 py-3">
                    <Lock className="w-4 h-4" />
                    <span className="font-display tracking-wider">BIND YOUR TOKENS</span>
                  </button>
                </Link>

                <Link href="/leaderboard" onClick={() => setMobileMenuOpen(false)} className="block">
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 transition-all">
                    <Trophy className="w-4 h-4" />
                    <span className="font-display tracking-wider">LEADERBOARD</span>
                  </button>
                </Link>
              </div>
              
              <div className="mx-5 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
              
              <div className="relative px-5 py-3">
                <div className="flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-mono text-white">Monad</span>
                </div>
              </div>
              
              {authenticated && (
                <div className="relative px-5 py-3">
                  <button onClick={() => { logout(); setMobileMenuOpen(false); }} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-all">
                    <LogOut className="w-4 h-4 text-red-400" />
                    <span className="text-xs font-medium text-red-400">Disconnect Wallet</span>
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="relative z-10 container mx-auto px-4 py-12 max-w-3xl pt-24">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl md:text-4xl text-white tracking-widest mb-2">LEADERBOARD</h1>
          <p className="text-muted-foreground text-sm">Top 100 Swappers & Stakers</p>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/50 to-purple-600/50 rounded-xl blur opacity-20 group-hover:opacity-40 transition" />
            <Card className="relative bg-black border-primary/20 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-mono uppercase">Total Volume</div>
                  <div className="text-lg font-bold text-white font-mono">{totalVolume.toFixed(2)} MON</div>
                </div>
              </div>
            </Card>
          </div>
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-yellow-500/50 to-orange-500/50 rounded-xl blur opacity-20 group-hover:opacity-40 transition" />
            <Card className="relative bg-black border-yellow-500/20 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center">
                  <Users className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-mono uppercase">Total Stakers</div>
                  <div className="text-lg font-bold text-white font-mono">{totalStakers}</div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Leaderboard Tabs */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-yellow-500/30 via-primary/30 to-yellow-500/30 rounded-xl blur opacity-30" />
          <Card className="relative bg-black border-primary/20 overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-yellow-500 via-primary to-yellow-500" />
          
          <Tabs defaultValue="swappers" value={activeTab} onValueChange={setActiveTab}>
            <div className="p-4 border-b border-white/10">
              <TabsList className="w-full h-12 p-1 bg-white/5 rounded-lg">
                <TabsTrigger value="swappers" className="flex-1 h-full data-[state=active]:bg-primary data-[state=active]:text-white rounded font-display tracking-wider text-sm">
                  TOP SWAPPERS
                </TabsTrigger>
                <TabsTrigger value="stakers" className="flex-1 h-full data-[state=active]:bg-yellow-600 data-[state=active]:text-black rounded font-display tracking-wider text-sm">
                  TOP STAKERS
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="swappers" className="p-0">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-white/10 text-xs font-mono text-muted-foreground uppercase">
                <div className="col-span-1">#</div>
                <div className="col-span-5">Address</div>
                <div className="col-span-3 text-right">Volume</div>
                <div className="col-span-3 text-right">Swaps</div>
              </div>
              
              {/* Table Body */}
              <div className="max-h-[500px] overflow-y-auto">
                {loading ? (
                  <div className="py-16 text-center">
                    <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                    <div className="text-muted-foreground text-sm">Loading...</div>
                  </div>
                ) : swapLeaderboard.length === 0 ? (
                  <div className="py-16 text-center">
                    <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <div className="text-muted-foreground text-sm">No swap data yet</div>
                    <div className="text-muted-foreground/50 text-xs mt-1">Be the first to swap!</div>
                  </div>
                ) : (
                  swapLeaderboard.map((user, i) => (
                    <motion.div
                      key={user.walletAddress}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className={`grid grid-cols-12 gap-2 px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${i < 3 ? 'bg-primary/5' : ''}`}
                    >
                      <div className="col-span-1 flex items-center justify-center">
                        <span className={`font-mono text-sm font-bold ${
                          i === 0 ? 'text-yellow-400' : 
                          i === 1 ? 'text-gray-300' : 
                          i === 2 ? 'text-orange-400' : 
                          'text-muted-foreground'
                        }`}>{i + 1}</span>
                      </div>
                      <div className="col-span-5 font-mono text-white text-sm flex items-center">{formatAddress(user.walletAddress)}</div>
                      <div className="col-span-3 font-mono text-right text-primary flex items-center justify-end whitespace-nowrap text-xs">{user.totalVolumeMon.toFixed(2)} MON</div>
                      <div className="col-span-3 font-mono text-right text-muted-foreground flex items-center justify-end">{user.swapCount}</div>
                    </motion.div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="stakers" className="p-0">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-white/10 text-xs font-mono text-muted-foreground uppercase">
                <div className="col-span-1">#</div>
                <div className="col-span-5">Address</div>
                <div className="col-span-3 text-right">Staked</div>
                <div className="col-span-3 text-right">Rewards</div>
              </div>
              
              {/* Table Body */}
              <div className="max-h-[500px] overflow-y-auto">
                {loading ? (
                  <div className="py-16 text-center">
                    <div className="animate-spin w-8 h-8 border-2 border-yellow-500 border-t-transparent rounded-full mx-auto mb-4" />
                    <div className="text-muted-foreground text-sm">Loading...</div>
                  </div>
                ) : stakingLeaderboard.length === 0 ? (
                  <div className="py-16 text-center">
                    <Lock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <div className="text-muted-foreground text-sm">No staking data yet</div>
                    <div className="text-muted-foreground/50 text-xs mt-1">Be the first to stake!</div>
                  </div>
                ) : (
                  stakingLeaderboard.map((user, i) => (
                    <motion.div
                      key={user.walletAddress}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className={`grid grid-cols-12 gap-2 px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${i < 3 ? 'bg-yellow-500/5' : ''}`}
                    >
                      <div className="col-span-1 flex items-center justify-center">
                        <span className={`font-mono text-sm font-bold ${
                          i === 0 ? 'text-yellow-400' : 
                          i === 1 ? 'text-gray-300' : 
                          i === 2 ? 'text-orange-400' : 
                          'text-muted-foreground'
                        }`}>{i + 1}</span>
                      </div>
                      <div className="col-span-5 font-mono text-white text-sm flex items-center">{formatAddress(user.walletAddress)}</div>
                      <div className="col-span-3 font-mono text-right text-yellow-400 flex items-center justify-end whitespace-nowrap">{user.totalStaked.toFixed(2)}</div>
                      <div className="col-span-3 font-mono text-right text-green-400 flex items-center justify-end">{user.stakeCount}</div>
                    </motion.div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
          </Card>
        </div>

        {/* Info */}
        <div className="mt-6 text-center text-xs text-muted-foreground">
          Data updates every block from on-chain events
        </div>
      </main>
    </div>
  );
}
