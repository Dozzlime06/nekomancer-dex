import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Shield, Lock, ExternalLink, Info, Search, ArrowRight, 
  Ghost, Skull, Cat, Github, ChevronDown, Loader, Menu, X, ArrowDownUp, LogOut, Wallet
} from "lucide-react";
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ConnectButton } from "@/components/ui/connect-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import { getTokenData, getCurrentChainId, getWalletTokens } from "@/lib/token";
import { getTokensForChain } from "@/lib/tokens-list";
import monadLogo from "@assets/image_1764181488788.png";
import nekomancerLogo from "@assets/nekomancer-logo.png";
import heroImage from "@assets/generated_images/mystical_cyber-cat_necromancer_summoning_digital_liquidity_in_a_dark_void.png";
import { getAllLocks, formatLockTime } from "@/lib/contract";
import { dateToUnixTimestamp, getWalletAddress, isWalletConnected, encodeApproveData, encodeLockData, LOCKER_ADDRESS, sendTransactionViaProvider } from "@/lib/web3";

interface LockWithTokenData {
  id?: number;
  owner: string;
  token: string;
  amount: string;
  unlockTime: number;
  withdrawn: boolean;
  tokenName?: string;
  tokenSymbol?: string;
  tokenLogo?: string;
}

// Format address to short form
function formatAddress(address: string): string {
  if (!address) return "unknown";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("lock");
  const [isLoaded, setIsLoaded] = useState(false);
  const [recentLocks, setRecentLocks] = useState<any[]>([]);
  const [tokenAddress, setTokenAddress] = useState("");
  const [selectedToken, setSelectedToken] = useState<string>("");
  const [selectedTokenSymbol, setSelectedTokenSymbol] = useState<string>("");
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [unlockDate, setUnlockDate] = useState("");
  const [userTokens, setUserTokens] = useState<any[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [customTokenInput, setCustomTokenInput] = useState("");
  const [customTokenData, setCustomTokenData] = useState<any>(null);
  const [isLocking, setIsLocking] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const chainId = getCurrentChainId();
  const availableTokens = getTokensForChain(chainId);

  // Fetch recent locks from smart contract and enrich with token data
  useEffect(() => {
    const fetchLocks = async () => {
      try {
        const locks = await getAllLocks();
        const chainId = getCurrentChainId();
        
        const enrichedLocks: LockWithTokenData[] = await Promise.all(
          locks.filter(l => !l.withdrawn).slice(-5).reverse().map(async (lock: any) => {
            try {
              const tokenData = await getTokenData(lock.token, chainId);
              return {
                id: lock.id,
                owner: lock.owner,
                token: lock.token,
                amount: lock.amount,
                unlockTime: lock.unlockTime,
                withdrawn: lock.withdrawn,
                tokenName: tokenData.name,
                tokenSymbol: tokenData.symbol,
                tokenLogo: tokenData.logo,
              };
            } catch (error) {
              console.error('Error fetching token data:', error);
              return lock;
            }
          })
        );
        setRecentLocks(enrichedLocks);
      } catch (error) {
        console.error('Error fetching locks:', error);
        setRecentLocks([]);
      }
    };

    if (isLoaded) {
      fetchLocks();
      // Refresh every 30 seconds
      const interval = setInterval(fetchLocks, 30000);
      return () => clearInterval(interval);
    }
  }, [isLoaded]);

  // Force "loading" state to clear immediately to prevent stuck UI
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Fetch user's actual wallet tokens when authenticated
  useEffect(() => {
    const fetchWalletTokens = async () => {
      if (!authenticated || wallets.length === 0) {
        setUserTokens([]);
        return;
      }

      setLoadingTokens(true);
      try {
        const wallet = wallets[0];
        const address = wallet.address;
        const tokens = await getWalletTokens(address, chainId, availableTokens);
        setUserTokens(tokens);
      } catch (error) {
        console.error('Error fetching wallet tokens:', error);
        setUserTokens([]);
      } finally {
        setLoadingTokens(false);
      }
    };

    fetchWalletTokens();
  }, [authenticated, wallets, chainId, availableTokens]);

  // Fetch wallet balance when token address changes
  useEffect(() => {
    const fetchBalance = async () => {
      if (!tokenAddress || !authenticated || wallets.length === 0) {
        setWalletBalance(null);
        return;
      }

      try {
        const wallet = wallets[0];
        const address = wallet.address;
        
        // Simple ERC20 balance check - call balanceOf
        const response = await fetch('/api/balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            tokenAddress, 
            userAddress: address,
            chainId: getCurrentChainId()
          })
        });

        if (response.ok) {
          const data = await response.json();
          setWalletBalance(data.balance);
          // Auto-fill quantity with wallet balance
          if (quantityInputRef.current) {
            quantityInputRef.current.value = data.balance;
            setQuantity(data.balance);
          }
        }
      } catch (error) {
        console.error('Error fetching balance:', error);
        setWalletBalance(null);
      }
    };

    const debounce = setTimeout(fetchBalance, 500);
    return () => clearTimeout(debounce);
  }, [tokenAddress, authenticated, wallets]);

  // Fetch custom token data and balance
  const fetchCustomToken = async (address: string) => {
    if (!address || address.length < 40 || !authenticated || wallets.length === 0) {
      setCustomTokenData(null);
      return;
    }

    try {
      const userWallet = wallets[0];
      
      // Fetch token data
      const tokenDataResponse = await fetch(`/api/token-data?address=${address}&chainId=${chainId}`);
      let tokenData = { name: 'Unknown', symbol: 'TKN', logo: '' };
      if (tokenDataResponse.ok) {
        tokenData = await tokenDataResponse.json();
      }

      // Fetch balance
      const balanceResponse = await fetch('/api/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenAddress: address,
          userAddress: userWallet.address,
          chainId: chainId
        })
      });

      let balance = '0';
      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        balance = balanceData.balance;
      }

      setCustomTokenData({ 
        address, 
        name: tokenData.name, 
        symbol: tokenData.symbol, 
        balance,
        logo: tokenData.logo
      });
    } catch (error) {
      console.error('Error fetching custom token:', error);
      setCustomTokenData(null);
    }
  };

  if (!isLoaded) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-primary font-mono">Summoning...</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden selection:bg-primary selection:text-black font-sans">
      
      {/* Background Noise Only */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-background">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay z-20"></div>
        <img 
          src={heroImage} 
          alt="Nekomancer Background" 
          className="w-full h-full object-cover opacity-20"
        />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-30 border-b border-primary/10 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          {/* Left: Logo + Name */}
          <Link href="/">
            <div className="flex items-center gap-3 group cursor-pointer">
              <div className="relative w-10 h-10 flex items-center justify-center">
                <div className="absolute inset-0 bg-primary/20 rounded-lg rotate-3 group-hover:rotate-6 transition-transform duration-300" />
                <div className="absolute inset-0 bg-black border border-primary/50 rounded-lg -rotate-3 group-hover:-rotate-6 transition-transform duration-300 flex items-center justify-center overflow-hidden p-1">
                  <img src={nekomancerLogo} alt="Nekomancer Logo" className="w-full h-full object-contain" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="font-display text-xl md:text-2xl text-white tracking-widest leading-none group-hover:text-[#836EF9] transition-colors">NEKO<span className="text-[#836EF9]">MANCER</span></span>
                <span className="text-[10px] font-mono text-muted-foreground tracking-[0.2em] uppercase">Staking</span>
              </div>
            </div>
          </Link>

          {/* Right: Wallet + Hamburger */}
          <div className="flex items-center gap-2">
            {/* Wallet - Same style as Swap page */}
            {authenticated ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30">
                <Wallet className="w-4 h-4 text-primary" />
                <span className="text-xs md:text-sm font-mono text-primary">
                  {wallets[0] && getWalletAddress(wallets[0])?.slice(0, 6)}...{wallets[0] && getWalletAddress(wallets[0])?.slice(-4)}
                </span>
              </div>
            ) : (
              <button 
                onClick={login} 
                className="neko-button-primary flex items-center gap-2 px-4 py-2 text-sm"
              >
                <Wallet className="w-4 h-4" />
                <span>CONNECT</span>
              </button>
            )}
            
            {/* Hamburger Menu */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2.5 bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors border border-primary/30"
              data-testid="button-mobile-menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 text-primary" /> : <Menu className="w-5 h-5 text-primary" />}
            </button>
          </div>
        </div>
      </nav>
      
      {/* Mobile Slide-in Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-md z-40"
            />
            
            {/* Slide-in Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 w-80 bg-gradient-to-b from-black via-zinc-950 to-black border-l border-primary/30 z-50 overflow-hidden"
            >
              {/* Decorative Background */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-20 -right-20 w-60 h-60 bg-primary/20 rounded-full blur-3xl" />
                <div className="absolute bottom-40 -left-10 w-40 h-40 bg-purple-600/20 rounded-full blur-3xl" />
              </div>
              
              {/* Top Gradient Line */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent" />
              
              {/* Header */}
              <div className="relative flex items-center justify-between p-5 border-b border-primary/20 bg-black/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-black border border-primary/50 flex items-center justify-center overflow-hidden p-1">
                    <img src={nekomancerLogo} alt="Logo" className="w-full h-full object-contain" />
                  </div>
                  <span className="font-display text-xl text-white tracking-wider">MENU</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 bg-white/5 hover:bg-primary/20 rounded-lg transition-colors border border-white/10"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
              
              {/* Menu Items - Cyber Buttons Stacked */}
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
              </div>
              
              {/* Divider */}
              <div className="mx-5 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
              
              {/* Network Badge - Compact */}
              <div className="relative px-5 py-3">
                <div className="flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-mono text-white">Monad</span>
                  <span className="text-xs text-green-400">Connected</span>
                </div>
              </div>
              
              {/* Social Links - Icons Only */}
              <div className="relative px-5 py-3">
                <div className="flex gap-2">
                  <a href="https://docs.nekomancer.io" target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-primary/10 hover:border-primary/30 transition-all group"
                    title="Gitbook">
                    <svg className="w-5 h-5 text-white/70 group-hover:text-white transition" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M10.802 17.77a.703.703 0 11-.002 1.406.703.703 0 01.002-1.406m11.024-4.347a.703.703 0 11.001-1.406.703.703 0 01-.001 1.406m0-2.876a2.176 2.176 0 00-2.174 2.174c0 .233.039.465.115.691l-7.181 3.823a2.165 2.165 0 00-1.784-.937c-.829 0-1.584.475-1.95 1.216l-6.451-3.402c-.682-.358-1.192-1.48-1.138-2.502.028-.533.212-.947.493-1.107.178-.1.392-.092.62.027l.042.023c1.71.9 7.304 3.847 7.54 3.956.363.169.565.237 1.185-.057l11.564-6.014c.17-.064.368-.227.368-.474 0-.342-.354-.477-.355-.477-.658-.315-1.669-.788-2.655-1.25-2.108-.987-4.497-2.105-5.546-2.655-.906-.474-1.635-.074-1.765.006l-.252.125C7.78 6.048 1.46 9.178 1.1 9.397.457 9.789.058 10.57.006 11.539c-.08 1.537.703 3.14 1.824 3.727l6.822 3.518a2.175 2.175 0 002.15 1.862 2.177 2.177 0 002.173-2.14l7.514-4.073c.38.298.853.461 1.337.461A2.176 2.176 0 0024 12.72a2.176 2.176 0 00-2.174-2.174"/>
                    </svg>
                  </a>
                  <a href="https://x.com/nekomancer" target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-primary/10 hover:border-primary/30 transition-all group"
                    title="X">
                    <svg className="w-5 h-5 text-white/70 group-hover:text-white transition" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </a>
                </div>
              </div>
              
              {/* Disconnect Button */}
              {authenticated && (
                <div className="relative px-5 py-3">
                  <button
                    onClick={() => { logout(); setMobileMenuOpen(false); }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-all group"
                  >
                    <LogOut className="w-4 h-4 text-red-400" />
                    <span className="text-xs font-medium text-red-400">Disconnect Wallet</span>
                  </button>
                </div>
              )}
              
              {/* Bottom Branding */}
              <div className="absolute bottom-0 left-0 right-0 p-5 border-t border-primary/10 bg-black/50">
                <div className="flex items-center justify-center gap-2">
                  <img src={nekomancerLogo} alt="Logo" className="w-6 h-6" />
                  <span className="font-display text-sm text-primary tracking-widest">NEKOMANCER</span>
                </div>
                              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="relative z-10 container mx-auto px-4 py-12 max-w-7xl pt-32">
        
        {/* Main Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Lock Form (7 cols) */}
          <div className="lg:col-span-7">
            <div className="relative group">
              {/* Glow effect behind card */}
              <div className="absolute -inset-1 bg-gradient-to-r from-primary to-purple-600 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
              
              <Card className="bg-black border-white/10 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
                
                <Tabs defaultValue="lock" value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <div className="p-6 pb-0 relative">
                    <div className="w-full h-14 relative flex items-stretch rounded-xl overflow-hidden border border-white/10 bg-black/40">
                      <TabsList className="w-full h-full p-0 bg-transparent flex relative overflow-visible">
                        <TabsTrigger 
                          value="lock" 
                          className="neko-tab-trigger neko-tab-left w-[55%] shrink-0 z-10 data-[state=active]:bg-primary data-[state=active]:text-white rounded-none"
                        >
                          <Ghost className="w-4 h-4 mr-2" /> Stake Tokens
                        </TabsTrigger>
                        
                        <TabsTrigger 
                          value="manage" 
                          className="neko-tab-trigger neko-tab-right w-[55%] shrink-0 -ml-[10%] z-0 data-[state=active]:bg-purple-500 data-[state=active]:text-white rounded-none"
                        >
                          <Skull className="w-4 h-4 mr-2" /> My Stakes
                        </TabsTrigger>
                      </TabsList>
                      
                      {/* Lightning Divider Overlay */}
                      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-6 z-20 pointer-events-none flex items-center justify-center">
                         <svg width="24" height="56" viewBox="0 0 24 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-[0_0_8px_rgba(131,110,249,0.8)]">
                           <path d="M14 0L4 24L16 28L6 56L20 28L8 24L14 0Z" fill="#836EF9" />
                           <path d="M14 0L4 24L16 28L6 56L20 28L8 24L14 0Z" stroke="white" strokeOpacity="0.5" strokeWidth="1" />
                         </svg>
                      </div>
                    </div>
                  </div>

                  <TabsContent value="lock" className="p-6 pt-8 space-y-8">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-mono uppercase text-primary tracking-widest">Token Contract</Label>
                        <div className="relative neko-input-wrapper p-0.5">
                          <Input
                            type="text"
                            placeholder="Paste token contract address..."
                            value={tokenAddress}
                            onChange={(e) => {
                              setTokenAddress(e.target.value);
                              fetchCustomToken(e.target.value);
                            }}
                            className="bg-black border-none focus:ring-0 focus:outline-none font-mono h-12 px-4 text-white placeholder:text-muted-foreground/50 relative z-10"
                          />
                          <div className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center border-r border-white/10 bg-white/5 z-0 pointer-events-none">
                            <Search className="w-4 h-4 text-primary" />
                          </div>
                        </div>
                        {customTokenData && tokenAddress.length > 40 && (
                          <div className="mt-3 p-3 bg-white/5 border border-white/10 rounded">
                            <div className="text-sm font-mono text-white font-bold">{customTokenData.symbol}</div>
                            <div className="text-xs text-muted-foreground">{customTokenData.name}</div>
                            <div className="text-xs text-yellow-400 mt-1">Balance: {customTokenData.balance}</div>
                          </div>
                        )}
                      </div>

                      <div className="block md:grid md:grid-cols-2 gap-4 w-full">
                        <div className="space-y-2 w-full mb-4 md:mb-0">
                          <Label className="text-xs font-mono uppercase text-primary tracking-widest">Quantity {walletBalance && `(Balance: ${walletBalance})`}</Label>
                          <div className="relative w-full neko-input-wrapper p-0.5">
                             <Input 
                              ref={quantityInputRef}
                              type="number" 
                              placeholder="Auto-detected from wallet..." 
                              value={quantity}
                              onChange={(e) => setQuantity(e.target.value)}
                              className="bg-transparent border-none focus:ring-0 focus:outline-none font-mono h-14 text-lg pr-14 w-full min-w-0 placeholder:text-muted-foreground/50 text-white relative z-10"
                              style={{ maxWidth: '100%' }}
                            />
                            <div className="absolute right-1 top-1 bottom-1 z-20">
                              <button 
                                type="button"
                                onClick={() => {
                                  if (quantityInputRef.current && walletBalance) {
                                    quantityInputRef.current.value = walletBalance;
                                    setQuantity(walletBalance);
                                  }
                                }}
                                className="h-full px-3 bg-primary/10 hover:bg-primary text-primary hover:text-white text-[10px] font-bold font-mono transition-all uppercase tracking-wider rounded flex items-center border border-primary/30 hover:border-primary"
                              >
                                MAX
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2 w-full">
                          <Label className="text-xs font-mono uppercase text-primary tracking-widest">Unlock Date</Label>
                          <div className="relative w-full neko-input-wrapper p-0.5">
                            <Input 
                              type="date" 
                              value={unlockDate}
                              onChange={(e) => setUnlockDate(e.target.value)}
                              className="bg-transparent border-none focus:ring-0 focus:outline-none font-mono h-14 text-lg px-4 w-full min-w-0 appearance-none text-white/90 relative z-10"
                              style={{ maxWidth: '100%', minHeight: '3.5rem' }}
                            />
                          </div>
                        </div>
                      </div>

                    </div>

                    {lockError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
                        {lockError}
                      </div>
                    )}

                    <Button 
                      onClick={async () => {
                        if (!ready) {
                          setLockError("⏳ Privy is initializing...");
                          return;
                        }
                        
                        if (!authenticated) {
                          setLockError("📱 Connecting wallet...");
                          login();
                          return;
                        }
                        
                        if (!wallets.length) {
                          setLockError("⏳ Wallet is being created...");
                          // Give Privy time to create embedded wallet
                          setTimeout(() => {
                            if (wallets.length === 0) {
                              setLockError("⚠️ Wallet not ready. Try connecting again.");
                            }
                          }, 2000);
                          return;
                        }
                        
                        if (!tokenAddress || !quantity || !unlockDate) {
                          setLockError("Please fill in all fields");
                          return;
                        }

                        setIsLocking(true);
                        setLockError(null);

                        try {
                          const wallet = wallets[0];
                          const userAddress = getWalletAddress(wallet);
                          const unlockTime = dateToUnixTimestamp(unlockDate);

                          if (!userAddress) {
                            throw new Error('Could not get wallet address');
                          }

                          setLockError("🔮 Summoning locks through the void...");
                          
                          // Get provider from wallet (Privy embedded or MetaMask)
                          let provider;
                          if (wallet?.getEthereumProvider) {
                            try {
                              provider = await wallet.getEthereumProvider();
                            } catch (e) {
                              provider = (window as any).ethereum;
                            }
                          } else {
                            provider = (window as any).ethereum;
                          }
                          
                          if (!provider) {
                            throw new Error('Wallet provider not available. Please connect a wallet.');
                          }

                          // Step 1: Send approve transaction
                          const approveData = encodeApproveData(LOCKER_ADDRESS, quantity);
                          let approveTxHash: string;
                          try {
                            approveTxHash = await sendTransactionViaProvider(provider, userAddress, tokenAddress, approveData);
                          } catch (txError) {
                            throw new Error(`Approve failed: ${txError instanceof Error ? txError.message : 'Unknown error'}`);
                          }
                          console.log('Approve tx:', approveTxHash);

                          // Wait for confirmation
                          await new Promise(r => setTimeout(r, 3000));

                          // Step 2: Send lock transaction
                          setLockError("🔮 Binding your souls...");
                          const lockData = encodeLockData(tokenAddress, quantity, unlockTime);
                          let lockTxHash: string;
                          try {
                            lockTxHash = await sendTransactionViaProvider(provider, userAddress, LOCKER_ADDRESS, lockData);
                          } catch (txError) {
                            throw new Error(`Lock failed: ${txError instanceof Error ? txError.message : 'Unknown error'}`);
                          }
                          console.log('Lock created:', lockTxHash);

                          // Save to backend
                          await fetch('/api/locks/create', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                              tokenAddress, 
                              amount: quantity, 
                              unlockTime, 
                              ownerAddress: userAddress, 
                              txHash: lockTxHash 
                            })
                          });

                          // Reset form
                          setTokenAddress("");
                          setQuantity("");
                          setUnlockDate("");
                          setCustomTokenData(null);
                          setLockError(null);
                          setActiveTab("lock");

                          // Refetch locks
                          const locks = await getAllLocks();
                          setRecentLocks(locks as any);
                        } catch (error) {
                          const message = error instanceof Error ? error.message : "Failed to create lock";
                          if (!lockError) setLockError(message);
                          console.error("Lock error:", error);
                        } finally {
                          setIsLocking(false);
                        }
                      }}
                      disabled={isLocking}
                      className="w-full h-16 text-xl neko-button-primary group"
                    >
                      <span className="relative z-10 flex items-center gap-2">
                        {isLocking ? (
                          <>
                            <Loader className="w-5 h-5 animate-spin" /> SUMMONING...
                          </>
                        ) : (
                          <>
                            <Lock className="w-5 h-5" /> STAKE NOW
                          </>
                        )}
                      </span>
                    </Button>
                  </TabsContent>

                  <TabsContent value="manage" className="p-6 pt-8">
                    {!authenticated ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center space-y-6 border-2 border-dashed border-white/10 rounded-xl">
                        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center animate-pulse">
                          <Ghost className="w-10 h-10 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-xl font-display text-white mb-2">No Souls Bound</p>
                          <p className="text-sm text-muted-foreground max-w-xs mx-auto">Connect your wallet to view and manage your active liquidity locks.</p>
                        </div>
                        <Button 
                          variant="outline" 
                          className="border-white/20 hover:bg-white/10"
                          onClick={login}
                          data-testid="button-connect-wallet-manage"
                        >
                          Connect Wallet
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 text-center space-y-6 border-2 border-dashed border-white/10 rounded-xl">
                        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center animate-pulse">
                          <Skull className="w-10 h-10 text-primary" />
                        </div>
                        <div>
                          <p className="text-xl font-display text-white mb-2">No Active Locks</p>
                          <p className="text-sm text-muted-foreground max-w-xs mx-auto">You haven't created any token locks yet. Use the "Summon Lock" tab to create your first lock.</p>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </Card>
            </div>
          </div>

          {/* Right Column: Recent Rituals Feed (5 cols) */}
          <div className="lg:col-span-5">
            <div className="relative group h-full">
              {/* Glow effect behind card */}
              <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-primary rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
              
              <Card className="bg-black border-white/10 relative overflow-hidden h-full">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
                
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-primary animate-pulse"></div>
                      <h3 className="text-sm font-mono uppercase text-primary tracking-wider font-bold">Recent Rituals</h3>
                    </div>
                    <Badge variant="secondary" className="text-xs font-mono">Live Feed</Badge>
                  </div>

                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {recentLocks.length === 0 ? (
                      <div className="flex items-center justify-center py-12 text-center">
                        <p className="text-xs text-muted-foreground">No locks summoned yet...</p>
                      </div>
                    ) : (
                      recentLocks.map((lock, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          className="p-3 bg-white/5 border border-white/10 rounded hover:border-primary/50 transition-all group/lock cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Lock className="w-3 h-3 text-primary flex-shrink-0" />
                                <p className="text-xs font-mono text-white truncate">{lock.tokenSymbol || lock.token.slice(0, 8)}</p>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{formatAddress(lock.owner)}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs font-mono text-yellow-400">{parseFloat(lock.amount).toFixed(2)}</p>
                              <p className="text-[10px] text-muted-foreground whitespace-nowrap">{formatLockTime(lock.unlockTime)}</p>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
