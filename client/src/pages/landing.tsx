import { motion, AnimatePresence } from "framer-motion";
import { Shield, Ghost, Activity, Zap, ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import heroImage from "@assets/IMG_9375_1764357743647.jpeg";
import monadLogo from "@assets/image_1764181488788.png";
import nekomancerLogo from "@assets/nekomancer-logo.png";
import { useState, useEffect } from "react";
import { getCurrentChainId } from "@/lib/token";

export default function Landing() {
  const [location, setLocation] = useLocation();
  const [isLaunching, setIsLaunching] = useState(false);
  const [stats, setStats] = useState({ totalValue: "$0", lockCount: "0", totalAmount: "$0", avgLockTime: "∞" });
  const chainId = getCurrentChainId();
  const networkName = chainId === 41455 ? "Monad Mainnet" : "Monad Testnet";

  // Fetch and calculate stats from locks
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/locks/all');
        if (response.ok) {
          const locks = await response.json();
          const totalValue = locks.reduce((sum: number, lock: any) => sum + (parseFloat(lock.amount) || 0), 0);
          const avgTime = locks.length > 0 
            ? locks.reduce((sum: number, lock: any) => sum + (lock.unlockTime - Math.floor(Date.now() / 1000)), 0) / locks.length
            : 0;
          const avgDays = avgTime > 0 ? Math.floor(avgTime / 86400) : 0;
          
          setStats({
            totalValue: totalValue > 0 ? `$${(totalValue / 1e6).toFixed(1)}M` : "$0",
            lockCount: locks.length.toString(),
            totalAmount: `${(totalValue / 1e18).toFixed(2)}`,
            avgLockTime: avgDays > 0 ? `${avgDays}d` : "∞",
          });
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };
    fetchStats();
  }, []);

  const handleLaunch = () => {
    setIsLaunching(true);
    setTimeout(() => {
      setLocation("/swap");
    }, 800); // Wait for animation
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden selection:bg-primary selection:text-black font-sans flex flex-col">
      
      {/* Cinematic Background - Fixed, no zoom on scroll */}
      <div 
        className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
        style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background z-10" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay z-20"></div>
        
        <img 
          src={heroImage} 
          alt="Nekomancer Background" 
          className="absolute inset-0 w-full h-full object-cover opacity-60"
          style={{ 
            transform: 'translate3d(0, 0, 0)', 
            willChange: 'auto',
            imageRendering: 'auto'
          }}
        />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-30 border-b border-primary/10 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="relative w-10 h-10 flex items-center justify-center">
              <div className="absolute inset-0 bg-primary/20 rounded-lg rotate-3 group-hover:rotate-6 transition-transform duration-300" />
              <div className="absolute inset-0 bg-black border border-primary/50 rounded-lg -rotate-3 group-hover:-rotate-6 transition-transform duration-300 flex items-center justify-center overflow-hidden p-1">
                <img src={nekomancerLogo} alt="Nekomancer Logo" className="w-full h-full object-contain" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-display text-2xl text-white tracking-widest leading-none group-hover:text-[#836EF9] transition-colors">NEKO<span className="text-[#836EF9]">MANCER</span></span>
              <span className="text-[10px] font-mono text-muted-foreground tracking-[0.2em] uppercase">DEX Aggregator</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 container mx-auto px-4 flex-grow flex flex-col items-center justify-center py-20 pt-40">
        
        {/* Hero Content */}
        <div className="text-center mb-16 relative max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <Badge variant="outline" className="mb-8 border-primary/50 text-primary bg-primary/5 hover:bg-primary/10 px-4 py-1 text-xs font-mono tracking-widest uppercase inline-flex items-center gap-2">
              <Zap className="w-3 h-3 fill-primary" /> Monad Mainnet Live
            </Badge>
            
            <h1 className="text-6xl md:text-8xl lg:text-9xl font-display text-white mb-8 tracking-tight leading-none drop-shadow-[0_0_30px_rgba(16,185,129,0.3)]">
              TRADE ACROSS <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-green-200 to-primary animate-pulse">REALMS</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-12 font-light leading-relaxed">
              One swap. Multiple DEXes. Maximum output.
            </p>

            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
              <div className="relative">
                <AnimatePresence>
                  {!isLaunching && (
                    <motion.div
                      exit={{ opacity: 0, scale: 1.5, filter: "blur(10px)" }}
                      transition={{ duration: 0.2 }}
                    >
                       <Button 
                        onClick={handleLaunch}
                        className="h-16 px-12 text-xl font-display tracking-wider bg-primary text-white shadow-[0_0_30px_rgba(131,110,249,0.4)] hover:shadow-[0_0_60px_rgba(131,110,249,0.6)] transition-all duration-300 relative overflow-hidden group clip-path-cyber border-2 border-transparent hover:border-white/20"
                      >
                        {/* Glitch effect layers */}
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 skew-y-12" />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:animate-shine" />
                        
                        {/* Tech corners */}
                        <div className="absolute top-0 left-0 w-4 h-[2px] bg-white/50 group-hover:bg-white transition-colors" />
                        <div className="absolute top-0 left-0 w-[2px] h-4 bg-white/50 group-hover:bg-white transition-colors" />
                        
                        <div className="absolute bottom-0 right-0 w-4 h-[2px] bg-white/50 group-hover:bg-white transition-colors" />
                        <div className="absolute bottom-0 right-0 w-[2px] h-4 bg-white/50 group-hover:bg-white transition-colors" />
                        
                        <span className="relative z-10 flex items-center gap-3 group-hover:scale-105 transition-transform">
                          LAUNCH APP <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                        </span>
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Shatter Animation */}
                <AnimatePresence>
                  {isLaunching && (
                    <div className="absolute inset-0 pointer-events-none">
                      {/* Main Body - Cracking */}
                      <motion.div
                        initial={{ opacity: 1, scale: 1 }}
                        animate={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
                        transition={{ duration: 0.4 }}
                        className="absolute inset-0 bg-primary flex items-center justify-center clip-path-cyber"
                      >
                         <span className="text-xl font-display tracking-wider text-white flex items-center gap-3">
                          LAUNCH APP <ArrowRight className="w-6 h-6" />
                        </span>
                      </motion.div>

                      {/* Electric Crack Overlay */}
                      <motion.div
                         initial={{ opacity: 0, pathLength: 0 }}
                         animate={{ opacity: 1, pathLength: 1 }}
                         transition={{ duration: 0.2 }}
                         className="absolute inset-0 z-20 flex items-center justify-center"
                      >
                        <svg width="100%" height="100%" viewBox="0 0 300 64" fill="none">
                          <motion.path 
                            d="M10 32 L100 32 L120 10 L140 50 L160 20 L180 40 L290 32" 
                            stroke="white" 
                            strokeWidth="2"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: 1, opacity: [0, 1, 0] }}
                            transition={{ duration: 0.4 }}
                          />
                        </svg>
                      </motion.div>

                      {/* Flash Effect */}
                       <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{ duration: 0.3, delay: 0.1 }}
                        className="absolute inset-0 bg-white mix-blend-overlay z-50 clip-path-cyber"
                      />
                    </div>
                  )}
                </AnimatePresence>
              </div>
              
              <Button className="h-16 px-10 text-lg font-mono bg-transparent text-white border border-white/20 hover:border-[#836EF9] hover:bg-[#836EF9]/10 hover:text-[#836EF9] hover:shadow-[0_0_30px_rgba(131,110,249,0.3)] transition-all duration-300 relative overflow-hidden group clip-path-cyber backdrop-blur-sm">
                <span className="relative z-10">READ DOCS</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-shine" />
              </Button>
            </div>
          </motion.div>
        </div>


      </main>
      
      <footer className="relative z-10 border-t border-white/5 bg-black py-8 mt-auto">
        <div className="container mx-auto px-4 text-center">
           <p className="font-mono text-xs text-muted-foreground">
             BUILT WITH <span className="text-red-500">♥</span> FOR THE MONAD COMMUNITY
           </p>
        </div>
      </footer>
    </div>
  );
}