import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, ArrowDownUp, Lock, Menu, X, LogOut, Loader, AlertTriangle, Copy, Check } from "lucide-react";
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import nekomancerLogo from "@assets/nekomancer-logo.png";

const STAKING_VAULT = "0x448317114cf3017fb8e2686c000b70c6a75735dc";

export default function Staking() {
  const [activeTab, setActiveTab] = useState("stake");
  const [stakeAmount, setStakeAmount] = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();

  const tokenSymbol = "MANCER";
  const totalStaked = "0";
  const userStaked = "0";
  const userRewards = "0";
  const userBalance = "0";
  const unstakeRequestTime = 0;
  const unstakeRequestAmount = "0";
  const canCompleteUnstake = false;
  const timeUntilUnlock = 0;

  const formatTime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const handleStake = async () => {
    if (!stakeAmount || !authenticated) return;
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setStakeAmount("");
    }, 2000);
  };

  const handleRequestUnstake = async () => {
    if (!unstakeAmount || !authenticated) return;
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setUnstakeAmount("");
    }, 2000);
  };

  const handleCompleteUnstake = async () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 2000);
  };

  const handleEmergencyUnstake = async () => {
    if (!confirm("WARNING: Emergency unstake will burn 20% of your tokens and forfeit all rewards. Continue?")) return;
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 2000);
  };

  const handleClaimRewards = async () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 2000);
  };

  const copyContract = () => {
    navigator.clipboard.writeText(STAKING_VAULT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
                  <span className="text-[10px] font-mono text-muted-foreground tracking-[0.2em] uppercase">Staking</span>
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
                    {wallets[0]?.address ? `${wallets[0].address.slice(0, 6)}...${wallets[0].address.slice(-4)}` : 'Connected'}
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

      <main className="relative z-10 container mx-auto px-4 py-12 max-w-2xl pt-24">
        
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/50 to-purple-600/50 rounded-xl blur opacity-20 group-hover:opacity-40 transition" />
            <Card className="relative bg-black border-primary/20 p-4">
              <div className="text-xs text-muted-foreground font-mono uppercase mb-1 whitespace-nowrap">TVL</div>
              <div className="text-lg font-bold text-white font-mono">{totalStaked}</div>
              <div className="text-xs text-primary">{tokenSymbol}</div>
            </Card>
          </div>
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/50 to-purple-600/50 rounded-xl blur opacity-20 group-hover:opacity-40 transition" />
            <Card className="relative bg-black border-primary/20 p-4">
              <div className="text-xs text-muted-foreground font-mono uppercase mb-1">Your Stake</div>
              <div className="text-lg font-bold text-white font-mono">{userStaked}</div>
              <div className="text-xs text-primary">{tokenSymbol}</div>
            </Card>
          </div>
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500/50 to-emerald-600/50 rounded-xl blur opacity-20 group-hover:opacity-40 transition" />
            <Card className="relative bg-black border-green-500/20 p-4">
              <div className="text-xs text-muted-foreground font-mono uppercase mb-1">Rewards</div>
              <div className="text-lg font-bold text-green-400 font-mono">{userRewards}</div>
              <div className="text-xs text-green-400">MON</div>
            </Card>
          </div>
        </div>

        {/* Claim Rewards Button */}
        {parseFloat(userRewards) > 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <Button onClick={handleClaimRewards} disabled={isLoading} className="w-full h-12 bg-green-600 hover:bg-green-500 text-white font-display tracking-wider">
              {isLoading ? <Loader className="w-5 h-5 animate-spin" /> : `CLAIM ${userRewards} MON`}
            </Button>
          </motion.div>
        )}

        {/* Pending Unstake Request */}
        {unstakeRequestTime > 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-yellow-500/50 to-orange-500/50 rounded-xl blur opacity-30" />
              <Card className="relative bg-black border-yellow-500/30 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-yellow-400 font-mono">Pending Unstake Request</span>
                  <span className="text-sm font-mono text-white">{unstakeRequestAmount} {tokenSymbol}</span>
                </div>
                {canCompleteUnstake ? (
                  <Button onClick={handleCompleteUnstake} disabled={isLoading} className="w-full h-10 bg-yellow-600 hover:bg-yellow-500 text-black font-display tracking-wider">
                    {isLoading ? <Loader className="w-5 h-5 animate-spin" /> : "COMPLETE UNSTAKE"}
                  </Button>
                ) : (
                  <div className="text-center text-sm text-yellow-400/70">
                    Time remaining: <span className="font-mono text-yellow-400">{formatTime(timeUntilUnlock)}</span>
                  </div>
                )}
              </Card>
            </div>
          </motion.div>
        )}

        {/* Main Card - COMING SOON */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-purple-600 rounded-xl blur opacity-30" />
          <Card className="relative bg-black border-primary/30 overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-primary via-purple-500 to-primary" />
            
            {/* Coming Soon Overlay */}
            <div className="relative">
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center">
                <div className="text-center p-8">
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <Lock className="w-16 h-16 text-primary mx-auto mb-4 opacity-50" />
                    <h3 className="font-display text-2xl text-white tracking-widest mb-2">COMING SOON</h3>
                    <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                      Staking will be available after MANCER token launch
                    </p>
                    <div className="mt-4 px-4 py-2 bg-primary/10 border border-primary/30 rounded-lg inline-block">
                      <span className="text-primary text-xs font-mono">AWAITING TOKEN DEPLOYMENT</span>
                    </div>
                  </motion.div>
                </div>
              </div>

              {/* Blurred content behind */}
              <div className="opacity-30 pointer-events-none">
                <div className="p-4 border-b border-white/10">
                  <div className="w-full h-12 p-1 bg-white/5 rounded-lg flex">
                    <div className="flex-1 h-full bg-primary rounded flex items-center justify-center">
                      <span className="font-display tracking-wider text-sm text-white">STAKE</span>
                    </div>
                    <div className="flex-1 h-full flex items-center justify-center">
                      <span className="font-display tracking-wider text-sm text-muted-foreground">UNSTAKE</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between text-sm p-3 rounded-lg bg-white/5 border border-white/10">
                    <span className="text-muted-foreground">Your Balance</span>
                    <span className="font-mono text-white">0 {tokenSymbol}</span>
                  </div>
                  <div className="h-14 bg-white/5 border border-white/10 rounded-md" />
                  <div className="text-xs text-muted-foreground text-center">
                    Minimum stake: 100,000 {tokenSymbol}
                  </div>
                  <div className="w-full h-14 bg-primary/20 rounded-md" />
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* How It Works */}
        <div className="relative group mt-6">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 to-purple-600/30 rounded-xl blur opacity-20" />
          <Card className="relative bg-black border-primary/20 p-5">
            <h3 className="font-display text-base text-white tracking-wider mb-4">HOW IT WORKS</h3>
            
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm shrink-0">1</div>
                <div>
                  <div className="text-sm font-bold text-white">Stake {tokenSymbol}</div>
                  <div className="text-xs text-muted-foreground">Deposit minimum 100,000 tokens to start earning</div>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm shrink-0">2</div>
                <div>
                  <div className="text-sm font-bold text-white">Earn MON Rewards</div>
                  <div className="text-xs text-muted-foreground">Get 50% of all swap fees distributed based on your share</div>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm shrink-0">3</div>
                <div>
                  <div className="text-sm font-bold text-white">Claim Rewards Anytime</div>
                  <div className="text-xs text-muted-foreground">Claim your MON rewards whenever you want</div>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 font-bold text-sm shrink-0">4</div>
                <div>
                  <div className="text-sm font-bold text-white">Unstake with 3-Day Wait</div>
                  <div className="text-xs text-muted-foreground">Request unstake, wait 3 days, then withdraw</div>
                </div>
              </div>
            </div>

            <div className="mt-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="text-xs text-red-400">
                  <strong>Warning:</strong> Emergency unstake burns 20% of your tokens to the dead address and you lose all pending rewards.
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Contract Info */}
        <div className="relative group mt-6">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-purple-600/20 rounded-xl blur opacity-20" />
          <Card className="relative bg-black border-primary/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Staking Contract</div>
                <div className="font-mono text-xs md:text-sm text-white break-all">{STAKING_VAULT}</div>
              </div>
              <button
                onClick={copyContract}
                className="p-2.5 bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors border border-primary/20 shrink-0 ml-3"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-primary" />}
              </button>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
