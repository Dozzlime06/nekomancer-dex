import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Shield, Lock, ExternalLink, Info, Search, ArrowRight, 
  Ghost, Skull, Zap, Cat, TrendingUp, Activity
} from "lucide-react";
import { ConnectButton } from "@/components/ui/connect-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import heroImage from "@assets/generated_images/mystical_cyber-cat_necromancer_summoning_digital_liquidity_in_a_dark_void.png";
import monadLogo from "@assets/image_1764181488788.png";

// --- Mock Data Constants ---
const RECENT_LOCKS = [
  { id: 1, pair: "NEKO / MON", address: "0x7a...92f", amount: "$124,500", duration: "Forever", icon: "🐱" },
  { id: 2, pair: "PEPE / MON", address: "0x3d...11a", amount: "$42,069", duration: "6 months", icon: "🐸" },
  { id: 3, pair: "WIF / MON", address: "0x8b...44c", amount: "$89,200", duration: "1 year", icon: "🧢" },
  { id: 4, pair: "BOBO / MON", address: "0x1c...55e", amount: "$15,300", duration: "3 months", icon: "🐻" },
  { id: 5, pair: "MOG / MON", address: "0x9f...77d", amount: "$256,000", duration: "Forever", icon: "😹" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState("lock");
  const [isLoaded, setIsLoaded] = useState(false);

  // Force "loading" state to clear immediately to prevent stuck UI
  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (!isLoaded) {
    // A very brief simple loading state just to prevent flash of unstyled content
    return <div className="min-h-screen bg-black flex items-center justify-center text-primary font-mono">Summoning...</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden selection:bg-primary selection:text-black font-sans">
      
      {/* Cinematic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background z-10" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay z-20"></div>
        
        <img 
          src={heroImage} 
          alt="Nekomancer Background" 
          className="w-full h-full object-cover opacity-40"
        />
      </div>

      {/* Navigation */}
      <nav className="relative z-30 border-b border-primary/10 bg-background/80 backdrop-blur-xl sticky top-0">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="relative w-10 h-10 flex items-center justify-center">
              <div className="absolute inset-0 bg-primary/20 rounded-lg rotate-3 group-hover:rotate-6 transition-transform duration-300" />
              <div className="absolute inset-0 bg-black border border-primary/50 rounded-lg -rotate-3 group-hover:-rotate-6 transition-transform duration-300 flex items-center justify-center overflow-hidden">
                <img src={monadLogo} alt="Monad Logo" className="w-full h-full object-cover" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-display text-2xl text-white tracking-widest leading-none group-hover:text-primary transition-colors">NEKO<span className="text-primary">MANCER</span></span>
              <span className="text-[10px] font-mono text-muted-foreground tracking-[0.2em] uppercase">Liquidity Resurrection</span>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <a href="#" className="text-xs font-mono text-muted-foreground hover:text-primary hover:shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all">GRIMOIRE</a>
            <a href="#" className="text-xs font-mono text-muted-foreground hover:text-primary hover:shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all">RITUALS</a>
            <a href="#" className="text-xs font-mono text-muted-foreground hover:text-primary hover:shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all">COVEN</a>
          </div>

          <ConnectButton />
        </div>
      </nav>

      <main className="relative z-10 container mx-auto px-4 py-12 max-w-7xl">
        
        {/* Hero Section */}
        <div className="text-center mb-20 relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <Badge variant="outline" className="mb-6 border-primary/50 text-primary bg-primary/5 hover:bg-primary/10 px-4 py-1 text-xs font-mono tracking-widest uppercase">
              <Zap className="w-3 h-3 mr-2 fill-primary" /> Monad Testnet Live
            </Badge>
            <h1 className="text-6xl md:text-8xl font-display text-white mb-6 tracking-tight leading-none">
              BIND YOUR <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-green-200 to-primary animate-pulse">SOUL</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 font-light">
              The premier liquidity locker for the Monad ecosystem. 
              Prove your devotion. Resurrect trust. secure the bag.
            </p>
          </motion.div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {[
              { label: "Value Locked", value: "$42.0M", icon: Lock, color: "text-primary" },
              { label: "Pairs Secured", value: "842", icon: Shield, color: "text-purple-400" },
              { label: "MON Locked", value: "1.2M", icon: Ghost, color: "text-blue-400" },
              { label: "Avg Lock Time", value: "∞", icon: Activity, color: "text-pink-400" },
            ].map((stat, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + (i * 0.1) }}
                className="bg-black/40 backdrop-blur border border-white/10 p-4 rounded-lg hover:border-primary/30 transition-colors group"
              >
                <stat.icon className={`w-5 h-5 ${stat.color} mb-2 group-hover:scale-110 transition-transform`} />
                <div className="text-2xl font-bold text-white font-mono">{stat.value}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>

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
                  <div className="p-6 pb-0">
                    <TabsList className="w-full bg-white/5 border border-white/5 p-1 h-14">
                      <TabsTrigger value="lock" className="flex-1 h-full data-[state=active]:bg-primary data-[state=active]:text-black font-mono text-sm uppercase tracking-wider font-bold skew-x-0 data-[state=active]:skew-x-0 transition-all">
                        <Ghost className="w-4 h-4 mr-2" /> Summon Lock
                      </TabsTrigger>
                      <TabsTrigger value="manage" className="flex-1 h-full data-[state=active]:bg-purple-500 data-[state=active]:text-white font-mono text-sm uppercase tracking-wider font-bold">
                        <Skull className="w-4 h-4 mr-2" /> Manage Souls
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="lock" className="p-6 pt-8 space-y-8">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-mono uppercase text-primary tracking-widest">Target Contract</Label>
                        <div className="relative group/input">
                          <Input 
                            placeholder="0x..." 
                            className="bg-white/5 border-white/10 focus:border-primary/50 font-mono pl-12 h-14 text-lg transition-all group-hover/input:bg-white/10"
                          />
                          <div className="absolute left-4 top-4 p-1 bg-primary/20 rounded">
                            <Search className="w-4 h-4 text-primary" />
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1 pl-1">
                          <Info className="w-3 h-3" />
                          Paste the LP token address or Pair address you wish to bind.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-xs font-mono uppercase text-primary tracking-widest">Quantity</Label>
                          <div className="relative">
                             <Input 
                              type="number" 
                              placeholder="0.00" 
                              className="bg-white/5 border-white/10 focus:border-primary/50 font-mono h-14 text-lg pr-16"
                            />
                            <button className="absolute right-2 top-2 bottom-2 px-3 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-mono rounded transition-colors uppercase">
                              Max
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-mono uppercase text-primary tracking-widest">Unlock Date</Label>
                          <Input 
                            type="date" 
                            className="bg-white/5 border-white/10 focus:border-primary/50 font-mono h-14 text-white/80"
                          />
                        </div>
                      </div>

                      {/* Summary Box */}
                      <div className="p-6 rounded-xl bg-gradient-to-br from-white/5 to-transparent border border-white/5 space-y-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                          <Shield className="w-24 h-24 rotate-12" />
                        </div>
                        
                        <div className="flex justify-between text-sm relative z-10">
                          <span className="text-muted-foreground">Protocol Tribute</span>
                          <span className="font-mono text-primary">10 MON</span>
                        </div>
                         <div className="flex justify-between text-sm relative z-10">
                          <span className="text-muted-foreground">Security Audit</span>
                          <span className="font-mono text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Verified</span>
                        </div>
                        <div className="h-px bg-white/10 my-2" />
                        <div className="flex justify-between items-end relative z-10">
                          <span className="text-muted-foreground text-xs uppercase tracking-wider">Total Locked Value</span>
                          <span className="font-mono text-2xl text-white font-bold">0.00 <span className="text-sm text-muted-foreground">LP</span></span>
                        </div>
                      </div>
                    </div>

                    <Button className="w-full h-16 text-xl font-display tracking-wider bg-primary text-black hover:bg-primary/90 hover:shadow-[0_0_40px_rgba(16,185,129,0.3)] transition-all duration-300 relative overflow-hidden group">
                      <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 skew-y-12" />
                      <span className="relative z-10 flex items-center gap-2">
                        <Lock className="w-5 h-5" /> CAST ETERNAL LOCK
                      </span>
                    </Button>
                  </TabsContent>

                  <TabsContent value="manage" className="p-6 pt-8">
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-6 border-2 border-dashed border-white/10 rounded-xl">
                      <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center animate-pulse">
                        <Ghost className="w-10 h-10 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-xl font-display text-white mb-2">No Souls Bound</p>
                        <p className="text-sm text-muted-foreground max-w-xs mx-auto">Connect your wallet to view and manage your active liquidity locks.</p>
                      </div>
                      <Button variant="outline" className="border-white/20 hover:bg-white/10">
                        Connect Wallet
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </Card>
            </div>
          </div>

          {/* Right Column: Feed (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
             
             {/* Live Feed */}
             <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden flex flex-col h-full max-h-[600px]">
               <div className="p-5 border-b border-white/10 bg-white/5 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-ping" />
                    <h3 className="font-mono font-bold text-sm text-primary uppercase tracking-widest">Recent Rituals</h3>
                 </div>
                 <Badge variant="secondary" className="bg-white/5 hover:bg-white/10 text-xs font-mono">Live Feed</Badge>
               </div>
               
               <div className="divide-y divide-white/5 overflow-y-auto custom-scrollbar">
                 {RECENT_LOCKS.map((lock) => (
                   <div key={lock.id} className="p-4 hover:bg-white/5 transition-colors cursor-pointer group relative overflow-hidden">
                     <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary scale-y-0 group-hover:scale-y-100 transition-transform duration-300" />
                     
                     <div className="flex justify-between items-start mb-3">
                       <div className="flex items-center gap-3">
                         <div className="relative w-10 h-10">
                           {/* Main Token Icon */}
                           <div className="w-8 h-8 absolute top-0 left-0 rounded bg-gradient-to-br from-white/10 to-black border border-white/10 flex items-center justify-center text-sm shadow-inner z-10">
                             {lock.icon}
                           </div>
                           {/* Monad Token Icon (Background) */}
                           <div className="w-8 h-8 absolute bottom-0 right-0 rounded bg-purple-900 border border-purple-500/30 flex items-center justify-center overflow-hidden z-0">
                              <img src={monadLogo} alt="MON" className="w-full h-full object-cover opacity-80" />
                           </div>
                         </div>
                         <div className="pl-2">
                           <div className="text-sm font-bold text-white group-hover:text-primary transition-colors font-mono">{lock.pair}</div>
                           <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                             {lock.address} <ExternalLink className="w-2 h-2 opacity-50 hover:opacity-100" />
                           </div>
                         </div>
                       </div>
                       <div className="text-right">
                         <div className="text-sm font-mono text-white font-bold">{lock.amount}</div>
                         <div className="text-[10px] text-green-400 font-mono bg-green-400/10 px-2 py-0.5 rounded inline-block mt-1">
                           Locked: {lock.duration}
                         </div>
                       </div>
                     </div>
                     
                     <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                       <motion.div 
                         initial={{ width: 0 }}
                         whileInView={{ width: "100%" }}
                         transition={{ duration: 1, delay: 0.2 }}
                         className="bg-gradient-to-r from-primary to-blue-500 h-full" 
                       />
                     </div>
                   </div>
                 ))}
               </div>
               
               <div className="p-4 border-t border-white/10 bg-white/5 text-center">
                 <button className="text-xs font-mono text-muted-foreground hover:text-primary transition-colors flex items-center justify-center mx-auto gap-2 uppercase tracking-widest group">
                   View All History <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                 </button>
               </div>
             </div>

             {/* Promo Card */}
             <div className="relative rounded-xl overflow-hidden border border-white/10 group">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-900/50 to-black z-0" />
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-30 mix-blend-overlay z-0"></div>
                
                <div className="relative z-10 p-6">
                  <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center mb-4 border border-purple-500/50">
                    <Shield className="w-6 h-6 text-purple-400" />
                  </div>
                  <h4 className="font-display text-xl text-white mb-2">Audited Security</h4>
                  <p className="text-sm text-gray-400 mb-4 leading-relaxed">
                    Our necromantic rituals are verified by top security firms. Your liquidity is bound by unbreakable smart contracts.
                  </p>
                  <Button size="sm" className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/10 font-mono text-xs">
                    Read Audit Report
                  </Button>
                </div>
             </div>

          </div>

        </div>
      </main>
      
      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 bg-black mt-20 py-12">
        <div className="container mx-auto px-4 text-center">
           <p className="font-mono text-xs text-muted-foreground mb-4">
             BUILT WITH <span className="text-red-500">♥</span> FOR THE MONAD COMMUNITY
           </p>
           <div className="flex justify-center gap-6 opacity-50">
             <Cat className="w-6 h-6" />
             <Ghost className="w-6 h-6" />
             <Skull className="w-6 h-6" />
           </div>
        </div>
      </footer>
    </div>
  );
}

function CheckCircle2({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}