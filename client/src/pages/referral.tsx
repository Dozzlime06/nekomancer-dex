import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, ArrowDownUp, Lock, Menu, X, LogOut, Trophy, Gift, Users, Copy, Check, Share2, Coins, ExternalLink } from "lucide-react";
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { toast } from "sonner";
import nekomancerLogo from "@assets/nekomancer-logo.png";
import { encodeFunctionData, parseAbi, formatEther, createPublicClient, http } from 'viem';
import { ensureMonadChain } from '@/lib/web3';

const REFERRAL_VAULT_ADDRESS = '0x28e123cfd53EA9B39BCec297eba161F0742764F2';
const MIN_CLAIM_USD = 10; // $10 minimum
const REFERRAL_VAULT_ABI = parseAbi([
  'function claim() external',
  'function claimAmount(uint256 amount) external',
  'function getReferrerStats(address referrer) external view returns (uint256 pending, uint256 claimed, uint256 count)',
  'function minClaimAmount() external view returns (uint256)'
]);

const monadChain = {
  id: 143,
  name: 'Monad',
  rpcUrls: { default: { http: ['https://rpc3.monad.xyz/'] } },
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }
} as const;

interface ReferralStats {
  code: string | null;
  referralCount: number;
  totalEarnings: string;
  claimableEarnings: string;
}

export default function Referral() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [monPriceUSD, setMonPriceUSD] = useState<number>(0);

  const walletAddress = wallets[0]?.address;
  
  const minClaimMON = monPriceUSD > 0 ? MIN_CLAIM_USD / monPriceUSD : 0;
  const claimableAmount = parseFloat(stats?.claimableEarnings || '0');
  const claimableUSD = claimableAmount * monPriceUSD;
  const canClaim = claimableUSD >= MIN_CLAIM_USD;

  useEffect(() => {
    fetchMonPrice();
  }, []);

  useEffect(() => {
    if (walletAddress) {
      fetchReferralStats();
    }
  }, [walletAddress]);

  const fetchMonPrice = async () => {
    try {
      const res = await fetch('/api/swap/mon-price');
      if (res.ok) {
        const data = await res.json();
        setMonPriceUSD(data.price || 0);
      }
    } catch (error) {
      console.error('Error fetching MON price:', error);
    }
  };

  const fetchReferralStats = async () => {
    if (!walletAddress) return;
    setLoading(true);
    try {
      const [apiRes, onChainStats] = await Promise.all([
        fetch(`/api/referral/stats?wallet=${walletAddress}`),
        fetchOnChainStats(walletAddress)
      ]);
      
      if (apiRes.ok) {
        const data = await apiRes.json();
        if (onChainStats) {
          data.claimableEarnings = onChainStats.pending;
          data.totalEarnings = (parseFloat(onChainStats.pending) + parseFloat(onChainStats.claimed)).toString();
          data.referralCount = parseInt(onChainStats.count);
        }
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching referral stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOnChainStats = async (wallet: string): Promise<{pending: string, claimed: string, count: string} | null> => {
    try {
      const client = createPublicClient({
        chain: monadChain,
        transport: http('https://rpc3.monad.xyz/')
      });
      
      const result = await client.readContract({
        address: REFERRAL_VAULT_ADDRESS,
        abi: REFERRAL_VAULT_ABI,
        functionName: 'getReferrerStats',
        args: [wallet as `0x${string}`]
      }) as [bigint, bigint, bigint];
      
      return {
        pending: formatEther(result[0]),
        claimed: formatEther(result[1]),
        count: result[2].toString()
      };
    } catch (error) {
      console.error('Error fetching on-chain stats:', error);
      return null;
    }
  };

  const generateCode = async () => {
    if (!walletAddress) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/referral/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      });
      if (res.ok) {
        const data = await res.json();
        setStats(prev => prev ? { ...prev, code: data.code } : { code: data.code, referralCount: 0, totalEarnings: '0', claimableEarnings: '0' });
        toast.success('Referral code generated!');
      } else {
        const error = await res.json();
        toast.error(error.message || 'Failed to generate code');
      }
    } catch (error) {
      toast.error('Failed to generate code');
    } finally {
      setGenerating(false);
    }
  };

  const claimEarnings = async () => {
    if (!walletAddress || !stats?.claimableEarnings || parseFloat(stats.claimableEarnings) <= 0) return;
    if (!wallets[0]) {
      toast.error('Wallet not connected');
      return;
    }
    
    setClaiming(true);
    try {
      const provider = await wallets[0].getEthereumProvider();
      await ensureMonadChain(provider);
      
      const data = encodeFunctionData({
        abi: REFERRAL_VAULT_ABI,
        functionName: 'claim',
      });
      
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: walletAddress as `0x${string}`,
          to: REFERRAL_VAULT_ADDRESS,
          data: data,
          chainId: '0x8f',
        }]
      });
      
      toast.success(
        <div className="flex items-center gap-2">
          <span>Claim submitted!</span>
          <a 
            href={`https://testnet.monadexplorer.com/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            View TX
          </a>
        </div>
      );
      
      setTimeout(() => fetchReferralStats(), 3000);
    } catch (error: any) {
      console.error('Claim error:', error);
      if (error.message?.includes('User rejected') || error.code === 4001) {
        toast.error('Transaction cancelled');
      } else {
        toast.error(error.message || 'Failed to claim earnings');
      }
    } finally {
      setClaiming(false);
    }
  };

  const copyReferralLink = () => {
    if (!stats?.code) return;
    const link = `${window.location.origin}/swap?ref=${stats.code}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success('Referral link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-black via-purple-950/20 to-black" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-green-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
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
                  <span className="text-[10px] font-mono text-muted-foreground tracking-[0.2em] uppercase">Referral Program</span>
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

                <Link href="/referral" onClick={() => setMobileMenuOpen(false)} className="block">
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-all">
                    <Gift className="w-4 h-4" />
                    <span className="font-display tracking-wider">REFERRAL</span>
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

      <main className="relative z-10 container mx-auto px-4 py-12 max-w-xl pt-24">
        
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl md:text-4xl text-white tracking-widest mb-2">REFERRAL</h1>
          <p className="text-muted-foreground text-sm">Earn 20% of swap fees from your referrals</p>
        </div>

        {!authenticated ? (
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/50 to-green-600/50 rounded-xl blur opacity-30" />
            <Card className="relative bg-black border-primary/20 p-8 text-center">
              <Gift className="w-16 h-16 text-primary mx-auto mb-4 opacity-50" />
              <h2 className="font-display text-xl text-white tracking-wider mb-2">CONNECT WALLET</h2>
              <p className="text-muted-foreground text-sm mb-6">Connect your wallet to generate your unique referral code</p>
              <button onClick={() => login()} className="neko-button-primary px-8 py-3" data-testid="button-connect-main">
                <span className="font-display tracking-wider">CONNECT WALLET</span>
              </button>
            </Card>
          </div>
        ) : loading ? (
          <div className="py-16 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <div className="text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : (
          <div className="space-y-4">
            
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500/50 to-primary/50 rounded-xl blur opacity-30 group-hover:opacity-50 transition" />
              <Card className="relative bg-black border-green-500/20 overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-green-500 via-primary to-green-500" />
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                      <Share2 className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <div className="text-sm font-display text-white tracking-wider">YOUR REFERRAL CODE</div>
                      <div className="text-xs text-muted-foreground">Share this to earn 20% of fees</div>
                    </div>
                  </div>

                  {stats?.code ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-white/5 border border-green-500/30 rounded-lg px-4 py-3 font-mono text-xl text-green-400 tracking-widest text-center">
                          {stats.code}
                        </div>
                        <button 
                          onClick={copyReferralLink}
                          className="p-3 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg transition-colors"
                          data-testid="button-copy-link"
                        >
                          {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5 text-green-400" />}
                        </button>
                      </div>
                      <div className="text-xs text-muted-foreground text-center">
                        Click to copy: {window.location.origin}/swap?ref={stats.code}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={generateCode}
                      disabled={generating}
                      className="w-full neko-button-primary py-3 flex items-center justify-center gap-2"
                      data-testid="button-generate-code"
                    >
                      {generating ? (
                        <>
                          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                          <span className="font-display tracking-wider">GENERATING...</span>
                        </>
                      ) : (
                        <>
                          <Gift className="w-4 h-4" />
                          <span className="font-display tracking-wider">GENERATE CODE</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/50 to-purple-600/50 rounded-xl blur opacity-20 group-hover:opacity-40 transition" />
                <Card className="relative bg-black border-primary/20 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground font-mono uppercase">Referrals</div>
                      <div className="text-2xl font-bold text-white font-mono">{stats?.referralCount || 0}</div>
                    </div>
                  </div>
                </Card>
              </div>
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-yellow-500/50 to-orange-500/50 rounded-xl blur opacity-20 group-hover:opacity-40 transition" />
                <Card className="relative bg-black border-yellow-500/20 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center">
                      <Coins className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground font-mono uppercase">Total Earned</div>
                      <div className="text-lg font-bold text-white font-mono">{parseFloat(stats?.totalEarnings || '0').toFixed(4)} MON</div>
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500/50 to-emerald-500/50 rounded-xl blur opacity-30 group-hover:opacity-50 transition" />
              <Card className="relative bg-black border-green-500/20 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                      <Gift className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground font-mono uppercase">Claimable Earnings</div>
                      <div className="text-2xl font-bold text-green-400 font-mono">{claimableAmount.toFixed(4)} MON</div>
                      {monPriceUSD > 0 && <div className="text-xs text-muted-foreground">${claimableUSD.toFixed(2)} USD</div>}
                    </div>
                  </div>
                </div>
                {claimableAmount > 0 && !canClaim && monPriceUSD > 0 && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs text-center">
                  Minimum claim: ${MIN_CLAIM_USD} (~{minClaimMON.toFixed(0)} MON). You have ${claimableUSD.toFixed(2)} (${(MIN_CLAIM_USD - claimableUSD).toFixed(2)} more needed)
                </div>
              )}
              <button
                  onClick={claimEarnings}
                  disabled={claiming || !canClaim}
                  className="w-full py-3 rounded-lg font-display tracking-wider transition-all flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-black disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="button-claim"
                >
                  {claiming ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-black border-t-transparent rounded-full" />
                      <span>CLAIMING...</span>
                    </>
                  ) : (
                    <>
                      <Gift className="w-4 h-4" />
                      <span>CLAIM EARNINGS</span>
                    </>
                  )}
                </button>
              </Card>
            </div>

            <Card className="bg-black/50 border-white/10 p-4">
              <h3 className="font-display text-sm text-white tracking-wider mb-3">HOW IT WORKS</h3>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <span className="text-green-400 font-bold">1.</span>
                  <span>Generate your unique referral code</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-400 font-bold">2.</span>
                  <span>Share your referral link with friends</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-400 font-bold">3.</span>
                  <span>Earn 20% of the 1% swap fee when they trade</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-400 font-bold">4.</span>
                  <span>Claim your MON earnings anytime</span>
                </div>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
