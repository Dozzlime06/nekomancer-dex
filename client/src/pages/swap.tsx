import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDownUp, ChevronDown, Loader, AlertCircle, Search, Copy, X, Settings, Check, ExternalLink, TrendingUp, TrendingDown, Zap, Lock, Wallet, Menu, LogOut } from "lucide-react";
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { toast } from "sonner";
import { getTokenData, getCurrentChainId } from "@/lib/token";
import { getWalletAddress, sendTransactionWithValue, sendTransactionViaProvider, checkAllowance, encodeApproveData, getBestProvider } from "@/lib/web3";
import { 
  SWAP_AGGREGATOR_ADDRESS, 
  WMON_ADDRESS,
  getSwapFunctionData,
  isNativeMON,
  isWMON,
  getDeadline
} from "@/lib/swapAggregator";
import { parseUnits, formatUnits, type Address } from 'viem';
import nekomancerLogo from "@assets/nekomancer-logo.png";

// Slippage presets
const SLIPPAGE_PRESETS = [0.5, 1, 2, 3];
const DEFAULT_SLIPPAGE = 1;

// Smart price formatter - 6 decimals for consistency
function formatSmartPrice(price: number): string {
  if (price === 0) return '0.000000';
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(6);
  return price.toFixed(6);
}

export default function Swap() {
  const [tokens, setTokens] = useState<any[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [fromToken, setFromToken] = useState<any>(null);
  const [toToken, setToToken] = useState<any>(null);
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [openSelector, setOpenSelector] = useState<"from" | "to" | null>(null);
  const [fromBalance, setFromBalance] = useState("0");
  const [fromPrice, setFromPrice] = useState<number>(0);
  const [toPrice, setToPrice] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [bestDex, setBestDex] = useState<string>("");
  const [bestV3Fee, setBestV3Fee] = useState<number>(3000);
  const [allQuotes, setAllQuotes] = useState<any>({});
  const [splitRoutes, setSplitRoutes] = useState<any[]>([]);
  const [rawMinAmountOut, setRawMinAmountOut] = useState<bigint>(0n); // Raw wei value from pathfinder
  const [isSplitBetter, setIsSplitBetter] = useState(false);
  const [customTokenData, setCustomTokenData] = useState<any>(null);
  const [slippage, setSlippage] = useState<number>(DEFAULT_SLIPPAGE);
  const [customSlippage, setCustomSlippage] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);
  const [protocolFee] = useState<number>(0.3); // 0.3% protocol fee
  const [priceImpact, setPriceImpact] = useState<string>("0");
  const [swapStatus, setSwapStatus] = useState<'idle' | 'approving' | 'swapping' | 'success' | 'error'>('idle');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [directWallet, setDirectWallet] = useState<{ address: string; provider: any } | null>(null);

  // Privy hooks - must be called unconditionally at top level
  const { ready: privyReady, authenticated: privyAuthenticated, login: privyLogin, logout: privyLogout } = usePrivy();
  const { wallets: privyWallets = [] } = useWallets();

  const chainId = getCurrentChainId();

  // Direct wallet connection (bypasses Privy)
  const connectDirectWallet = async () => {
    const provider = (window as any).okxwallet || (window as any).ethereum;
    if (!provider) {
      toast.error("No wallet found. Install OKX or MetaMask.");
      return;
    }
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts.length > 0) {
        setDirectWallet({ address: accounts[0], provider });
        toast.success("Wallet connected: " + accounts[0].slice(0, 8) + "...");
        
        // Switch to Monad chain
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x8f' }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x8f',
                chainName: 'Monad',
                nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
                rpcUrls: ['https://rpc3.monad.xyz/'],
              }],
            });
          }
        }
      }
    } catch (e: any) {
      toast.error("Failed to connect: " + e.message);
    }
  };

  // Use direct wallet or Privy wallet
  const isConnected = directWallet || privyAuthenticated;
  const currentAddress = directWallet?.address || (privyWallets[0]?.address);
  const currentProvider = directWallet?.provider;

  // Get the best wallet for Monad chain - prefer direct wallet, then external Privy wallets
  const getActiveWallet = () => {
    // Direct wallet takes priority
    if (directWallet) {
      console.log('[WALLET] Using direct wallet:', directWallet.address.slice(0, 10));
      return { address: directWallet.address, getEthereumProvider: async () => directWallet.provider };
    }
    
    if (!privyWallets || privyWallets.length === 0) {
      console.log('[WALLET] No wallets available');
      return null;
    }
    
    // Find external wallet from Privy
    const externalWallet = privyWallets.find((w: any) => {
      const type = w.walletClientType?.toLowerCase() || '';
      const connector = w.connectorType?.toLowerCase() || '';
      if (type === 'coinbase_smart_wallet' || type === 'privy' || connector === 'embedded') {
        return false;
      }
      return true;
    });
    
    if (externalWallet) {
      console.log('[WALLET] Selected Privy wallet:', externalWallet.walletClientType);
      return externalWallet;
    }
    
    return privyWallets[0];
  };

  const activeWallet = getActiveWallet();

  // Track if initial load is done
  const [hasInitialized, setHasInitialized] = useState(false);

  // Fetch tokens from backend on mount and auto-refresh every 30 seconds
  useEffect(() => {
    const fetchTokens = async () => {
      try {
        console.log('[SWAP] Fetching tokens, hasInitialized:', hasInitialized);
        if (!hasInitialized) setTokensLoading(true);
        const response = await fetch('/api/tokens?chainId=143&t=' + Date.now());
        console.log('[SWAP] Token response status:', response.status);
        if (response.ok) {
          const fetchedTokens = await response.json();
          console.log('[SWAP] Fetched tokens count:', fetchedTokens.length);
          setTokens(fetchedTokens);
          
          // Set default tokens only on first load when not yet initialized
          if (!hasInitialized && fetchedTokens.length >= 2) {
            console.log('[SWAP] Setting default tokens:', fetchedTokens[0]?.symbol, fetchedTokens[1]?.symbol);
            setFromToken(fetchedTokens[0]);
            setToToken(fetchedTokens[1]);
            setHasInitialized(true);
          }
        }
      } catch (error) {
        console.error('[SWAP] Error fetching tokens:', error);
      } finally {
        setTokensLoading(false);
      }
    };

    fetchTokens();
    
    // Auto-refresh prices every 30 seconds
    const interval = setInterval(fetchTokens, 30000);
    return () => clearInterval(interval);
  }, [hasInitialized]);

  // Sync prices when tokens change or when token list updates
  useEffect(() => {
    if (fromToken) {
      const updated = tokens.find((t: any) => t.address.toLowerCase() === fromToken.address.toLowerCase());
      if (updated?.price !== undefined) {
        setFromPrice(updated.price);
      } else if (fromToken.price !== undefined) {
        setFromPrice(fromToken.price);
      }
    }
  }, [fromToken, tokens]);

  useEffect(() => {
    if (toToken) {
      const updated = tokens.find((t: any) => t.address.toLowerCase() === toToken.address.toLowerCase());
      if (updated?.price !== undefined) {
        setToPrice(updated.price);
      } else if (toToken.price !== undefined) {
        setToPrice(toToken.price);
      }
    }
  }, [toToken, tokens]);

  // Fetch balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (!isConnected || !activeWallet || !fromToken) return;
      
      try {
        const userAddress = getWalletAddress(activeWallet);
        if (!userAddress) return;

        const response = await fetch('/api/balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokenAddress: fromToken.address,
            userAddress,
            chainId
          })
        });

        if (response.ok) {
          const data = await response.json();
          setFromBalance(data.balance);
        }
      } catch (error) {
        console.error('Error fetching balance:', error);
      }
    };

    fetchBalance();
  }, [isConnected, activeWallet, fromToken, chainId]);

  // Fetch swap quotes via pathfinder (split routing)
  useEffect(() => {
    const fetchQuotes = async () => {
      if (!fromToken || !toToken || !fromAmount) return;
      
      try {
        setSwapLoading(true);
        
        // Use pathfinder for optimal split routing
        const slippageBps = Math.floor(slippage * 100);
        const response = await fetch('/api/swap/pathfinder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokenIn: fromToken.address,
            tokenOut: toToken.address,
            amountIn: fromAmount,
            slippageBps,
            tokenInDecimals: fromToken.decimals || 18
          })
        });

        if (response.ok) {
          const data = await response.json();
          
          // Set routes for split display
          setSplitRoutes(data.routes || []);
          setIsSplitBetter(data.isSplitBetter || false);
          setBestDex(data.bestSingleDex || "");
          
          // Store raw minOut from pathfinder (already calculated with slippage)
          if (data.totalMinOut) {
            const minOutValue = BigInt(data.totalMinOut);
            setRawMinAmountOut(minOutValue);
          }
          
          // Calculate total output from routes
          if (data.routes && data.routes.length > 0) {
            // Use output token's actual decimals for proper formatting
            const outDecimals = toToken?.decimals || 18;
            const divisor = Math.pow(10, outDecimals);
            const totalOut = data.routes.reduce((sum: number, r: any) => 
              sum + parseFloat(r.expectedOut) / divisor, 0);
            setToAmount(totalOut.toFixed(6));
            
            // Extract V3 fee from first V3 route
            const v3Route = data.routes.find((r: any) => r.dexId === 2);
            if (v3Route) {
              setBestV3Fee(v3Route.v3Fee);
            }
            
            // Calculate exchange rate
            const inputAmount = parseFloat(fromAmount || '1');
            const rate = inputAmount > 0 ? totalOut / inputAmount : 0;
            setExchangeRate(rate);
          }
          
          // Extract price impact
          if (data.priceImpact) {
            setPriceImpact(data.priceImpact.toFixed(2));
          }
          
          // Build quotes object from routes (use output token decimals)
          const outDecimals = toToken?.decimals || 18;
          const divisor = Math.pow(10, outDecimals);
          const quotesObj: Record<string, number> = {};
          for (const route of data.routes || []) {
            quotesObj[route.dexName] = parseFloat(route.expectedOut) / divisor;
          }
          setAllQuotes(quotesObj);
          
          // If no routes found, clear the output amount
          if (!data.routes || data.routes.length === 0) {
            setToAmount("");
            setExchangeRate(null);
            setPriceImpact("0");
          }
        }
      } catch (error) {
        console.error('Error fetching quotes:', error);
      } finally {
        setSwapLoading(false);
      }
    };

    const debounceTimer = setTimeout(fetchQuotes, 500);
    return () => clearTimeout(debounceTimer);
  }, [fromToken, toToken, fromAmount, slippage]);

  // Note: toAmount is now set ONLY by the quote fetch, not by price calculation
  // This ensures "what you see = what you get" - display matches actual swap output
  // The exchange rate is calculated from the quote, not from price estimates

  // Wrapper for login - use direct wallet if available, else Privy
  const handleLogin = () => {
    if ((window as any).okxwallet || (window as any).ethereum) {
      connectDirectWallet();
    } else {
      privyLogin();
    }
  };
  
  // Wrapper for logout
  const handleLogout = () => {
    setDirectWallet(null);
    privyLogout();
  };

  const handleSwap = async () => {
    if (!isConnected) {
      toast.error("Please connect your wallet first");
      handleLogin();
      return;
    }

    if (!fromAmount || !toAmount) {
      toast.error("Please enter an amount to swap");
      return;
    }

    if (!fromToken || !toToken) {
      toast.error("Please select tokens");
      return;
    }

    if (!activeWallet) {
      toast.error("No wallet connected");
      return;
    }

    setSwapLoading(true);
    setSwapError(null);
    setSwapStatus('idle');

    try {
      const userAddress = getWalletAddress(activeWallet);
      if (!userAddress) {
        throw new Error("Could not get wallet address");
      }

      console.log('[SWAP] Using wallet:', (activeWallet as any).walletClientType || 'direct', 'Address:', userAddress);
      
      // Try direct provider first (OKX, MetaMask) to bypass Privy's Coinbase Smart Wallet issues
      const privyProvider = await activeWallet.getEthereumProvider();
      const provider = await getBestProvider(privyProvider);
      console.log('[SWAP] Provider type:', provider === privyProvider ? 'Privy' : 'Direct');
      
      const decimals = fromToken.decimals || 18;
      const amountIn = parseUnits(fromAmount, decimals);
      
      // Calculate minAmountOut from splitRoutes directly (not from separate state)
      // This avoids any state synchronization issues
      let minAmountOut = 0n;
      if (splitRoutes && splitRoutes.length > 0) {
        // Sum up all route minOut values
        for (const route of splitRoutes) {
          if (route.minOut) {
            minAmountOut += BigInt(route.minOut);
          }
        }
      }
      
      // Fallback to rawMinAmountOut state if routes don't have minOut
      if (minAmountOut === 0n && rawMinAmountOut > 0n) {
        minAmountOut = rawMinAmountOut;
      }
      
      // Validate that minAmountOut is reasonable (not 0 and not astronomically large)
      if (minAmountOut === 0n) {
        toast.error("Please wait for quote to load");
        setSwapLoading(false);
        return;
      }
      
      // Check for obviously wrong values (more than 10^30 is suspicious for any token)
      const MAX_REASONABLE_OUTPUT = BigInt("1000000000000000000000000000000"); // 10^30
      if (minAmountOut > MAX_REASONABLE_OUTPUT) {
        console.error('[SWAP] ERROR - minAmountOut is too large:', minAmountOut.toString());
        toast.error("Invalid quote - please refresh and try again");
        setSwapLoading(false);
        return;
      }
      
      const deadline = getDeadline(20);

      const tokenInAddress = fromToken.address as Address;
      const tokenOutAddress = toToken.address as Address;

      if (!isNativeMON(tokenInAddress)) {
        // Set approval target based on which contract will execute the swap
        let targetAddress: Address;
        if (isWMON(tokenOutAddress) && isWMON(tokenInAddress)) {
          targetAddress = WMON_ADDRESS;
        } else {
          // All swaps (including nadfun) go through SwapAggregatorV6
          targetAddress = SWAP_AGGREGATOR_ADDRESS;
        }

        setSwapStatus('approving');
        const allowance = await checkAllowance(
          provider,
          tokenInAddress,
          userAddress,
          targetAddress
        );

        if (allowance < amountIn) {
          toast.loading(`Approving ${fromToken.symbol}...`, { id: 'approval' });
          const approveData = encodeApproveData(
            targetAddress,
            amountIn * 2n
          );
          
          const approveTxHash = await sendTransactionViaProvider(
            provider,
            userAddress,
            tokenInAddress,
            approveData
          );
          
          toast.success(`${fromToken.symbol} approved`, { id: 'approval' });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      setSwapStatus('swapping');
      toast.loading('Executing swap...', { id: 'swap' });

      const monToken = tokens.find((t: any) => 
        t.symbol === 'MON' || t.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      );
      const monPriceUSD = monToken?.price || 0.04;
      
      const effectiveFromPrice = fromPrice && fromPrice > 0 ? fromPrice : 0.0001;

      let txHash: string;

      {
        const isV3Swap = bestDex.includes("V3");
        const swapParams = {
          tokenIn: tokenInAddress,
          tokenOut: tokenOutAddress,
          amountIn,
          minAmountOut,
          deadline,
          fromTokenPriceUSD: effectiveFromPrice,
          monPriceUSD,
          fromTokenDecimals: decimals,
          dex: bestDex,
          isV3: isV3Swap,
          v3Fee: bestV3Fee,
          userAddress: userAddress as Address,
          routes: splitRoutes,
        };
        console.log('[SWAP] Params:', {
          ...swapParams,
          amountIn: swapParams.amountIn.toString(),
          minAmountOut: swapParams.minAmountOut.toString(),
          deadline: swapParams.deadline.toString(),
          isV3: isV3Swap,
          v3Fee: bestV3Fee,
        });
        const { data, value, targetContract } = getSwapFunctionData(swapParams);
        console.log('[SWAP] Result:', { data: data.slice(0, 20) + '...', value: value.toString(), targetContract });

        if (value > 0n) {
          const valueHex = `0x${value.toString(16)}`;
          txHash = await sendTransactionWithValue(
            provider,
            userAddress,
            targetContract,
            data,
            valueHex
          );
        } else {
          txHash = await sendTransactionViaProvider(
            provider,
            userAddress,
            targetContract,
            data
          );
        }
      }

      setSwapStatus('success');
      setSwapError(null);
      toast.dismiss('swap');
      
      // Record swap to Google Sheets leaderboard
      try {
        const isBuyingWithMON = fromToken?.symbol === 'MON' || fromToken?.address?.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
        const volumeInMON = isBuyingWithMON ? fromAmount : toAmount;
        
        await fetch('/api/swaps/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            txHash,
            walletAddress: userAddress,
            tokenIn: fromToken?.address || '',
            tokenInSymbol: fromToken?.symbol || '',
            tokenOut: toToken?.address || '',
            tokenOutSymbol: toToken?.symbol || '',
            amountIn: fromAmount,
            amountOut: toAmount,
            volumeMon: volumeInMON,
            dex: bestDex,
          }),
        });
        console.log('[SWAP] Recorded to leaderboard');
      } catch (recordError) {
        console.error('[SWAP] Failed to record swap:', recordError);
      }
      
      toast.success(
        <div className="flex flex-col gap-1">
          <div className="font-semibold">Swap Successful!</div>
          <div className="text-sm opacity-80">{fromAmount} {fromToken?.symbol} → {toAmount} {toToken?.symbol}</div>
          <a 
            href={`https://monvision.io/tx/${txHash}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
          >
            View on Explorer <ExternalLink className="w-3 h-3" />
          </a>
        </div>,
        { duration: 8000 }
      );
      
      setFromAmount("");
      setToAmount("");
      
      setTimeout(() => {
        setSwapStatus('idle');
      }, 3000);

    } catch (error: any) {
      console.error('Swap error:', error);
      setSwapStatus('error');
      toast.dismiss('swap');
      
      let errorMessage = "Swap failed";
      if (error.code === 4001) {
        errorMessage = "Transaction rejected by user";
      } else if (error.message?.includes('insufficient funds')) {
        errorMessage = "Insufficient balance for this swap";
      } else if (error.message) {
        errorMessage = error.message.slice(0, 80);
      }
      
      toast.error(errorMessage, { duration: 5000 });
      
      setSwapError(errorMessage);
      setTimeout(() => {
        setSwapStatus('idle');
        setSwapError(null);
      }, 5000);
    } finally {
      setSwapLoading(false);
    }
  };

  const handleMaxClick = () => {
    setFromAmount(fromBalance);
  };

  const handleSwapTokens = () => {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    setFromAmount("");
    setToAmount("");
  };

  // Search for custom token by address
  useEffect(() => {
    const searchForCustomToken = async () => {
      // Check if search query looks like a valid address
      if (!searchQuery.startsWith('0x') || searchQuery.length !== 42) {
        setCustomTokenData(null);
        return;
      }

      try {
        const response = await fetch(`/api/token-data?address=${searchQuery}&chainId=143`);
        if (response.ok) {
          const data = await response.json();
          
          setCustomTokenData({
            address: searchQuery,
            symbol: data.symbol,
            name: data.name,
            decimals: data.decimals,
            logo: data.logo,
            price: data.price || 0
          });
        } else {
          setCustomTokenData(null);
        }
      } catch (error) {
        console.error('Error fetching custom token:', error);
        setCustomTokenData(null);
      }
    };

    const debounceTimer = setTimeout(searchForCustomToken, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden selection:bg-primary selection:text-black font-sans pt-24 pb-12">
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background z-10" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay z-20"></div>
      </div>

      {/* Navigation - Matching Dashboard Style */}
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
                <span className="text-[10px] font-mono text-muted-foreground tracking-[0.2em] uppercase">Swap</span>
              </div>
            </div>
          </Link>

          {/* Right: Wallet + Hamburger */}
          <div className="flex items-center gap-2">
            {/* Wallet - Same style as Dashboard */}
            {isConnected ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30">
                <Wallet className="w-4 h-4 text-primary" />
                <span className="text-xs md:text-sm font-mono text-primary">
                  {activeWallet && getWalletAddress(activeWallet)?.slice(0, 6)}...{activeWallet && getWalletAddress(activeWallet)?.slice(-4)}
                </span>
              </div>
            ) : (
              <button 
                onClick={handleLogin} 
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
                <div className="absolute top-1/2 right-10 w-32 h-32 bg-primary/10 rounded-full blur-2xl" />
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

                <Link href="/leaderboard" onClick={() => setMobileMenuOpen(false)} className="block">
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 transition-all">
                    <TrendingUp className="w-4 h-4" />
                    <span className="font-display tracking-wider">LEADERBOARD</span>
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
                  <a 
                    href="https://docs.nekomancer.io" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-primary/10 hover:border-primary/30 transition-all group"
                    title="Gitbook"
                  >
                    <svg className="w-5 h-5 text-white/70 group-hover:text-white transition" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M10.802 17.77a.703.703 0 11-.002 1.406.703.703 0 01.002-1.406m11.024-4.347a.703.703 0 11.001-1.406.703.703 0 01-.001 1.406m0-2.876a2.176 2.176 0 00-2.174 2.174c0 .233.039.465.115.691l-7.181 3.823a2.165 2.165 0 00-1.784-.937c-.829 0-1.584.475-1.95 1.216l-6.451-3.402c-.682-.358-1.192-1.48-1.138-2.502.028-.533.212-.947.493-1.107.178-.1.392-.092.62.027l.042.023c1.71.9 7.304 3.847 7.54 3.956.363.169.565.237 1.185-.057l11.564-6.014c.17-.064.368-.227.368-.474 0-.342-.354-.477-.355-.477-.658-.315-1.669-.788-2.655-1.25-2.108-.987-4.497-2.105-5.546-2.655-.906-.474-1.635-.074-1.765.006l-.252.125C7.78 6.048 1.46 9.178 1.1 9.397.457 9.789.058 10.57.006 11.539c-.08 1.537.703 3.14 1.824 3.727l6.822 3.518a2.175 2.175 0 002.15 1.862 2.177 2.177 0 002.173-2.14l7.514-4.073c.38.298.853.461 1.337.461A2.176 2.176 0 0024 12.72a2.176 2.176 0 00-2.174-2.174"/>
                    </svg>
                  </a>
                  <a 
                    href="https://x.com/nekomancer" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-primary/10 hover:border-primary/30 transition-all group"
                    title="X"
                  >
                    <svg className="w-5 h-5 text-white/70 group-hover:text-white transition" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </a>
                </div>
              </div>
              
              {/* Disconnect Button */}
              {isConnected && (
                <div className="relative px-5 py-3">
                  <button
                    onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
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

      {/* Main Content */}
      <div className="container mx-auto px-4 max-w-md relative z-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-purple-600 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            
            <Card className="bg-black border-white/10 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
              
              <div className="p-5 space-y-4">
                {/* Header with Title and Settings */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">Swap</h2>
                  <div className="relative">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowSettings(!showSettings)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                        showSettings 
                          ? 'bg-primary text-black' 
                          : 'bg-white/5 hover:bg-white/10 text-white/70'
                      }`}
                      data-testid="button-settings"
                    >
                      <Settings className="w-4 h-4" />
                      <span className="font-mono">{slippage}%</span>
                    </motion.button>
                    
                    {/* Slippage Popover */}
                    <AnimatePresence>
                      {showSettings && (
                        <motion.div
                          initial={{ opacity: 0, y: -10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.95 }}
                          className="absolute right-0 top-12 w-72 p-4 bg-zinc-900 border border-white/10 rounded-xl shadow-xl z-50"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-white">Slippage Tolerance</span>
                            <button onClick={() => setShowSettings(false)} className="text-white/50 hover:text-white">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          
                          <div className="flex gap-2 mb-3">
                            {SLIPPAGE_PRESETS.map((preset) => (
                              <button
                                key={preset}
                                onClick={() => {
                                  setSlippage(preset);
                                  setCustomSlippage("");
                                }}
                                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                                  slippage === preset && !customSlippage
                                    ? 'bg-primary text-black'
                                    : 'bg-white/5 hover:bg-white/10 text-white/70'
                                }`}
                              >
                                {preset}%
                              </button>
                            ))}
                          </div>
                          
                          <div className="relative mb-3">
                            <Input
                              type="number"
                              placeholder="Custom %"
                              value={customSlippage}
                              onChange={(e) => {
                                setCustomSlippage(e.target.value);
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val > 0 && val <= 50) {
                                  setSlippage(val);
                                }
                              }}
                              className="w-full bg-white/5 border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 pr-8"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 text-sm">%</span>
                          </div>
                          
                          {slippage > 5 && (
                            <div className="flex items-center gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-3">
                              <AlertCircle className="w-4 h-4 text-yellow-500" />
                              <span className="text-xs text-yellow-500">High slippage warning</span>
                            </div>
                          )}
                          
                          {/* Dynamic Slippage Recommendation based on Price Impact */}
                          {parseFloat(priceImpact) > 0 && (
                            <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <TrendingUp className="w-4 h-4 text-primary" />
                                  <span className="text-xs text-primary">
                                    Recommended: {Math.max(1, Math.ceil(parseFloat(priceImpact) + 0.5))}%
                                  </span>
                                </div>
                                <button
                                  onClick={() => {
                                    const recommended = Math.max(1, Math.ceil(parseFloat(priceImpact) + 0.5));
                                    setSlippage(recommended);
                                    setCustomSlippage("");
                                  }}
                                  className="px-2 py-1 text-xs bg-primary text-black rounded font-semibold hover:bg-primary/80 transition-colors"
                                >
                                  Apply
                                </button>
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-1">
                                Based on {parseFloat(priceImpact).toFixed(2)}% price impact
                              </div>
                            </div>
                          )}
                          
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* From Token */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-mono uppercase text-primary tracking-widest">From Token</Label>
                    <span className="text-xs text-muted-foreground font-mono">Balance: {parseFloat(fromBalance).toFixed(4)}</span>
                  </div>
                  <div className="neko-input-wrapper p-3 rounded-lg">
                    <div className="flex items-center gap-3">
                      {/* Token Logo & Symbol - Left Side */}
                      <motion.button
                        onClick={() => { setSearchQuery(""); setCustomTokenData(null); setOpenSelector("from"); }}
                        className="flex items-center gap-2 px-2 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition shrink-0"
                        data-testid="button-select-from-token"
                      >
                        <div className="w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center text-xs font-bold text-primary overflow-hidden">
                          {fromToken?.logo ? (
                            <img 
                              src={fromToken.logo} 
                              alt={fromToken.symbol} 
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                (e.target as HTMLImageElement).parentElement!.textContent = fromToken?.symbol?.charAt(0) || '?';
                              }}
                            />
                          ) : (
                            fromToken?.symbol?.charAt(0) || '?'
                          )}
                        </div>
                        <span className="text-white font-mono font-semibold text-sm">{fromToken?.symbol || 'Select'}</span>
                        <ChevronDown className="w-4 h-4 text-primary" />
                      </motion.button>
                      {/* Amount Input - Right Side */}
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={fromAmount}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, '');
                          setFromAmount(val);
                        }}
                        className="bg-transparent border-none outline-none ring-0 focus:ring-0 focus:outline-none font-mono text-xl text-right flex-1 min-w-0 text-white placeholder:text-muted-foreground/50"
                        data-testid="input-from-amount"
                      />
                    </div>
                  </div>
                  {fromAmount && fromPrice > 0 && (
                    <div className="text-xs text-muted-foreground font-mono mt-1 text-right">
                      ≈ ${(parseFloat(fromAmount) * fromPrice).toFixed(2)} USD
                    </div>
                  )}

                  {/* Percentage Buttons */}
                  <div className="grid grid-cols-4 gap-2">
                    {[25, 50, 75, 100].map((percent) => (
                      <motion.button
                        key={percent}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          const balance = parseFloat(fromBalance) || 0;
                          const amount = (balance * percent) / 100;
                          setFromAmount(amount.toString());
                        }}
                        className="py-2 px-3 bg-white/5 border border-white/10 hover:border-primary/40 hover:bg-primary/10 rounded-lg text-xs font-mono font-semibold text-primary transition-all"
                      >
                        {percent}%
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Swap Button */}
                <div className="flex justify-center">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleSwapTokens}
                    className="p-3 rounded-full bg-primary/20 hover:bg-primary/30 transition border border-primary/50 text-primary"
                  >
                    <ArrowDownUp className="w-5 h-5" />
                  </motion.button>
                </div>

                {/* To Token */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-mono uppercase text-primary tracking-widest">To Token</Label>
                    <span className="text-xs text-muted-foreground font-mono">You receive</span>
                  </div>
                  <div className="neko-input-wrapper p-3 rounded-lg">
                    <div className="flex items-center gap-3">
                      {/* Token Logo & Symbol - Left Side */}
                      <motion.button
                        onClick={() => { setSearchQuery(""); setCustomTokenData(null); setOpenSelector("to"); }}
                        className="flex items-center gap-2 px-2 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition shrink-0"
                        data-testid="button-select-to-token"
                      >
                        <div className="w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center text-xs font-bold text-primary overflow-hidden">
                          {toToken?.logo ? (
                            <img 
                              src={toToken.logo} 
                              alt={toToken.symbol} 
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                (e.target as HTMLImageElement).parentElement!.textContent = toToken?.symbol?.charAt(0) || '?';
                              }}
                            />
                          ) : (
                            toToken?.symbol?.charAt(0) || '?'
                          )}
                        </div>
                        <span className="text-white font-mono font-semibold text-sm">{toToken?.symbol || 'Select'}</span>
                        <ChevronDown className="w-4 h-4 text-primary" />
                      </motion.button>
                      {/* Amount Display - Right Side */}
                      <div className="font-mono text-xl text-right flex-1 min-w-0 text-white/70" data-testid="input-to-amount">
                        {toAmount || '0.00'}
                      </div>
                    </div>
                  </div>
                  {toAmount && toPrice > 0 && (
                    <div className="text-xs text-muted-foreground font-mono mt-1 text-right">
                      ≈ ${(parseFloat(toAmount) * toPrice).toFixed(2)} USD
                    </div>
                  )}
                </div>

                {/* Route Visualization - Split Routing Support */}
                {exchangeRate && splitRoutes.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-3"
                  >
                    {/* Route Header */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/50 uppercase tracking-wider">
                        {splitRoutes.length > 1 ? 'Split Route' : 'Best Route'}
                      </span>
                      {splitRoutes.length > 1 && (
                        <span className="text-xs text-green-400 font-mono flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          Optimized
                        </span>
                      )}
                    </div>
                    
                    {/* Split Routes Display */}
                    <div className="space-y-2">
                      {splitRoutes.map((route: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2">
                          {/* From Token */}
                          <div className="flex items-center gap-2 bg-white/5 rounded-lg px-2 py-1.5">
                            {fromToken?.logo ? (
                              <img src={fromToken.logo} alt={fromToken.symbol} className="w-5 h-5 rounded-full" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                                {fromToken?.symbol?.charAt(0)}
                              </div>
                            )}
                            <span className="text-xs font-semibold text-white">{fromToken?.symbol}</span>
                          </div>
                          
                          {/* Connecting Line with DEX */}
                          <div className="flex-1 relative">
                            <div className="absolute inset-y-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/50 via-primary to-primary/50" />
                            <div className="relative flex justify-center">
                              <div className="bg-zinc-900 border border-primary/30 rounded-lg px-2 py-1 flex items-center gap-1.5">
                                <Zap className="w-3 h-3 text-primary" />
                                <span className="text-[10px] font-semibold text-primary">
                                  {route.dexName}
                                </span>
                                <span className="text-[10px] bg-primary/20 text-primary px-1 py-0.5 rounded font-mono">
                                  {route.percentage}%
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          {/* To Token */}
                          <div className="flex items-center gap-2 bg-white/5 rounded-lg px-2 py-1.5">
                            {toToken?.logo ? (
                              <img src={toToken.logo} alt={toToken.symbol} className="w-5 h-5 rounded-full" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                                {toToken?.symbol?.charAt(0)}
                              </div>
                            )}
                            <span className="text-xs font-semibold text-white">{toToken?.symbol}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Rate & Impact Details */}
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                      <div className="space-y-1">
                        <span className="text-[10px] text-white/40 uppercase">Exchange Rate</span>
                        <div className="text-sm font-mono text-white">
                          1 {fromToken?.symbol} = {exchangeRate.toFixed(6)} {toToken?.symbol}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-white/40 uppercase">Price Impact</span>
                        <div className={`text-sm font-mono flex items-center gap-1 ${
                          parseFloat(priceImpact) > 5 
                            ? 'text-red-400' 
                            : parseFloat(priceImpact) > 1 
                              ? 'text-yellow-400' 
                              : 'text-green-400'
                        }`}>
                          {parseFloat(priceImpact) > 0 ? (
                            <>
                              <TrendingDown className="w-3 h-3" />
                              <span>-{parseFloat(priceImpact).toFixed(2)}%</span>
                            </>
                          ) : parseFloat(priceImpact) < 0 ? (
                            <>
                              <TrendingUp className="w-3 h-3" />
                              <span>+{Math.abs(parseFloat(priceImpact)).toFixed(2)}%</span>
                            </>
                          ) : (
                            <span>~0.00%</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                  </motion.div>
                )}

                {/* Error */}
                {swapError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm flex gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{swapError}</span>
                  </div>
                )}

                {/* Swap Button */}
                <Button
                  onClick={handleSwap}
                  disabled={swapLoading || !fromAmount || !toAmount}
                  className={`w-full h-14 text-base font-semibold transition-all ${
                    swapStatus === 'success' 
                      ? 'bg-green-500 hover:bg-green-600' 
                      : swapStatus === 'error'
                        ? 'bg-red-500 hover:bg-red-600'
                        : 'bg-primary hover:bg-primary/90'
                  } text-black rounded-xl`}
                >
                  <span className="flex items-center justify-center gap-2">
                    {swapStatus === 'approving' ? (
                      <>
                        <Loader className="w-5 h-5 animate-spin" />
                        <span>Approving {fromToken?.symbol}...</span>
                      </>
                    ) : swapStatus === 'swapping' ? (
                      <>
                        <Loader className="w-5 h-5 animate-spin" />
                        <span>Swapping via {bestDex || 'DEX'}...</span>
                      </>
                    ) : swapStatus === 'success' ? (
                      <>
                        <Check className="w-5 h-5" />
                        <span>Swap Complete</span>
                      </>
                    ) : swapStatus === 'error' ? (
                      <>
                        <AlertCircle className="w-5 h-5" />
                        <span>Swap Failed</span>
                      </>
                    ) : swapLoading ? (
                      <>
                        <Loader className="w-5 h-5 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : !isConnected ? (
                      <>
                        <Wallet className="w-5 h-5" />
                        <span>Connect Wallet</span>
                      </>
                    ) : !fromAmount || !toAmount ? (
                      <span>Enter Amount</span>
                    ) : (
                      <>
                        <ArrowDownUp className="w-5 h-5" />
                        <span>Swap</span>
                      </>
                    )}
                  </span>
                </Button>

              </div>
            </Card>
          </div>
        </motion.div>
      </div>

      {/* Token Selector Modal */}
      {openSelector && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setOpenSelector(null)}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-black border-t border-white/10 rounded-t-3xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Violet Moss Header Design */}
            <div className="relative h-24 bg-gradient-to-b from-purple-500/20 via-primary/10 to-transparent border-b border-primary/20">
              <div className="absolute inset-0 opacity-30">
                <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 400 100" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <filter id="gooey">
                      <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
                    </filter>
                  </defs>
                  <circle cx="20%" cy="50%" r="15" fill="#836EF9" filter="url(#gooey)" opacity="0.4" />
                  <circle cx="40%" cy="30%" r="12" fill="#8B5CF6" filter="url(#gooey)" opacity="0.3" />
                  <circle cx="60%" cy="60%" r="10" fill="#7C3AED" filter="url(#gooey)" opacity="0.35" />
                  <circle cx="80%" cy="40%" r="13" fill="#836EF9" filter="url(#gooey)" opacity="0.4" />
                </svg>
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent" />
              
              {/* Handle Bar */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 flex justify-center">
                <div className="w-12 h-1.5 bg-gradient-to-r from-transparent via-primary to-transparent rounded-full" />
              </div>

              {/* Title */}
              <div className="relative h-full flex items-center justify-center pt-2">
                <h3 className="text-lg font-display text-primary drop-shadow-lg">
                  {openSelector === "from" ? "From" : "To"} Token
                </h3>
              </div>

              {/* Close Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenSelector(null);
                }}
                className="absolute top-5 right-4 p-1 hover:bg-white/10 rounded-full transition"
                data-testid="button-close-token-selector"
              >
                <X className="w-5 h-5 text-primary hover:text-white transition" />
              </button>
            </div>

            <div className="container mx-auto px-4 py-6 max-w-md relative" onClick={(e) => e.stopPropagation()}>
              {/* Background Gradient Design */}
              <div className="absolute inset-0 opacity-20 pointer-events-none">
                <div className="absolute top-0 left-0 w-32 h-32 bg-primary/30 rounded-full blur-3xl" />
                <div className="absolute bottom-10 right-0 w-40 h-40 bg-purple-600/20 rounded-full blur-3xl" />
                <div className="absolute top-1/3 left-1/2 w-24 h-24 bg-primary/20 rounded-full blur-2xl" />
              </div>

              {/* Search Bar */}
              <div className="relative mb-4 z-10" onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="Search token or paste address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value.toLowerCase())}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  autoComplete="off"
                  className="w-full pl-4 pr-10 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  data-testid="input-token-search"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>

              {/* Filtered Token List */}
              <div className="space-y-2 max-h-[50vh] overflow-y-auto relative z-10">
                {tokensLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading tokens...</div>
                ) : (
                  <>
                    {/* Show custom token if valid address was pasted */}
                    {customTokenData && searchQuery.startsWith('0x') && searchQuery.length === 42 && (
                      <motion.button
                        whileHover={{ scale: 1.02, x: 4 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (openSelector === "from") {
                            setFromToken(customTokenData);
                            setFromPrice(customTokenData.price || 0);
                          } else {
                            setToToken(customTokenData);
                            setToPrice(customTokenData.price || 0);
                          }
                          setOpenSelector(null);
                          setCustomTokenData(null);
                        }}
                        className="w-full p-4 bg-gradient-to-r from-primary/20 to-white/5 hover:from-primary/30 hover:to-white/10 border border-primary/40 hover:border-primary/60 rounded-lg transition text-left flex items-center justify-between group backdrop-blur-sm"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/60 to-purple-600/50 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {customTokenData.logo ? (
                              <img src={customTokenData.logo} alt={customTokenData.symbol} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.textContent = customTokenData.symbol.charAt(0); }} />
                            ) : null}
                            {!customTokenData.logo && <span className="text-xs font-bold text-white">{customTokenData.symbol.charAt(0)}</span>}
                          </div>
                          <div className="flex-1">
                            <div className="font-mono font-semibold text-white">{customTokenData.symbol}</div>
                            <div className="flex items-center gap-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(customTokenData.address); }}>
                              <span className="text-xs text-muted-foreground">
                                {customTokenData.address.slice(0, 6)}...{customTokenData.address.slice(-4)}
                              </span>
                              <Copy className="w-3 h-3 text-muted-foreground hover:text-primary transition" data-testid="copy-custom-address" />
                            </div>
                          </div>
                        </div>
                      </motion.button>
                    )}
                    {/* List discovered tokens */}
                    {tokens.filter(token => 
                      !searchQuery || 
                      token.symbol.toLowerCase().includes(searchQuery) || 
                      token.name.toLowerCase().includes(searchQuery) || 
                      token.address.toLowerCase().includes(searchQuery)
                    ).map((token) => (
                  <motion.button
                    key={token.address}
                    whileHover={{ scale: 1.02, x: 4 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (openSelector === "from") {
                        setFromToken(token);
                        setFromPrice(token.price || 0);
                      } else {
                        setToToken(token);
                        setToPrice(token.price || 0);
                      }
                      setOpenSelector(null);
                    }}
                    className="w-full p-4 bg-gradient-to-r from-white/8 to-white/5 hover:from-white/15 hover:to-white/10 border border-white/15 hover:border-primary/40 rounded-lg transition text-left flex items-center justify-between group backdrop-blur-sm"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/40 to-purple-600/30 flex items-center justify-center group-hover:from-primary/60 group-hover:to-purple-600/50 transition overflow-hidden flex-shrink-0">
                        {token.logo ? (
                          <img src={token.logo} alt={token.symbol} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.textContent = token.symbol.charAt(0); }} />
                        ) : null}
                        {!token.logo && <span className="text-xs font-bold text-primary">{token.symbol.charAt(0)}</span>}
                      </div>
                      <div className="flex-1">
                        <div className="font-mono font-semibold text-white">{token.symbol}</div>
                        <div className="flex items-center gap-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(token.address); }}>
                          <span className="text-xs text-muted-foreground">
                            {token.address.slice(0, 6)}...{token.address.slice(-4)}
                          </span>
                          <Copy className="w-3 h-3 text-muted-foreground hover:text-primary transition" data-testid={`copy-address-${token.symbol}`} />
                        </div>
                      </div>
                    </div>
                  </motion.button>
                    ))}
                    {!tokensLoading && tokens.filter(token => 
                      !searchQuery || 
                      token.symbol.toLowerCase().includes(searchQuery) || 
                      token.name.toLowerCase().includes(searchQuery) || 
                      token.address.toLowerCase().includes(searchQuery)
                    ).length === 0 && !customTokenData && (
                      <div className="text-center py-8 text-muted-foreground">
                        No tokens found. Try another search.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
