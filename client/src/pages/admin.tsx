import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Shield, ArrowLeft, AlertTriangle, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePrivy } from '@privy-io/react-auth';
import nekomancerLogo from "@assets/nekomancer-logo.png";

interface Lock {
  id: number;
  owner: string;
  token: string;
  amount: string;
  unlockTime: number;
  withdrawn: boolean;
}

export default function AdminDashboard() {
  const { ready, authenticated, user } = usePrivy();
  const [locks, setLocks] = useState<Lock[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [withdrawing, setWithdrawing] = useState<number | null>(null);

  // Check if user is contract owner (from env variable)
  useEffect(() => {
    if (!ready || !authenticated) {
      setIsOwner(false);
      return;
    }

    const ownerAddress = import.meta.env.VITE_CONTRACT_OWNER?.toLowerCase();
    const userAddress = user?.wallet?.address?.toLowerCase();
    
    // If owner is not set, allow any authenticated user
    if (!ownerAddress) {
      setIsOwner(true);
    } else {
      setIsOwner(ownerAddress && userAddress && ownerAddress === userAddress);
    }
  }, [user, ready, authenticated]);

  // Fetch all locks from backend
  useEffect(() => {
    const fetchLocks = async () => {
      try {
        const response = await fetch('/api/locks/all');
        if (response.ok) {
          const data = await response.json();
          setLocks(data);
        }
      } catch (error) {
        console.error('Error fetching locks:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isOwner) {
      fetchLocks();
    }
  }, [isOwner]);

  const handleEmergencyWithdraw = async (lockId: number) => {
    setWithdrawing(lockId);
    try {
      const response = await fetch(`/api/locks/${lockId}/emergency-withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        // Remove from UI
        setLocks(locks.filter(l => l.id !== lockId));
      } else {
        alert('Failed to withdraw');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error performing emergency withdrawal');
    } finally {
      setWithdrawing(null);
    }
  };

  // Show loading while Privy is initializing
  if (!ready) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
          <p className="text-muted-foreground font-mono">Initializing...</p>
        </div>
      </div>
    );
  }

  // Show connect prompt if not authenticated
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center space-y-4">
          <Shield className="w-16 h-16 mx-auto text-primary opacity-50" />
          <p className="text-muted-foreground">Connect wallet to access admin dashboard</p>
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Show unauthorized if owner check fails (only if VITE_CONTRACT_OWNER is set)
  if (!isOwner && import.meta.env.VITE_CONTRACT_OWNER) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertTriangle className="w-16 h-16 mx-auto text-red-500" />
          <p className="text-muted-foreground">Unauthorized: Only contract owner can access</p>
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden">
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-background">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay z-20"></div>
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-30 border-b border-primary/10 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-3 group cursor-pointer">
              <div className="relative w-10 h-10 flex items-center justify-center">
                <div className="absolute inset-0 bg-red-500/20 rounded-lg rotate-3 group-hover:rotate-6 transition-transform duration-300" />
                <div className="absolute inset-0 bg-black border border-red-500/50 rounded-lg -rotate-3 group-hover:-rotate-6 transition-transform duration-300 flex items-center justify-center overflow-hidden p-1">
                  <img src={nekomancerLogo} alt="Nekomancer Logo" className="w-full h-full object-contain" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="font-display text-xl text-white tracking-widest leading-none group-hover:text-red-500 transition-colors">ADMIN</span>
                <span className="text-[10px] font-mono text-muted-foreground tracking-[0.2em] uppercase">Emergency Withdrawal</span>
              </div>
            </div>
          </Link>

          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 container mx-auto px-4 py-12 max-w-6xl pt-32">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-display text-white mb-2">Emergency Withdrawal</h1>
          <p className="text-muted-foreground">Platform owner only: manage locks and perform emergency withdrawals</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
              <p className="text-muted-foreground font-mono">Loading locks...</p>
            </div>
          </div>
        ) : locks.length === 0 ? (
          <Card className="bg-black border-white/10 p-12 text-center">
            <Shield className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No active locks found</p>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground font-mono">
              Total Locks: {locks.length}
            </div>

            {locks.map((lock) => (
              <motion.div
                key={lock.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative group"
              >
                <div className="absolute -inset-1 bg-gradient-to-r from-red-500/20 to-orange-500/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition duration-300"></div>

                <Card className="bg-black border-white/10 relative overflow-hidden">
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Left Column */}
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Lock ID</p>
                          <p className="font-mono text-lg text-white font-bold">{lock.id}</p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Owner</p>
                          <p className="font-mono text-sm text-primary truncate">{lock.owner}</p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Token</p>
                          <p className="font-mono text-sm text-white truncate">{lock.token}</p>
                        </div>
                      </div>

                      {/* Right Column */}
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Amount</p>
                          <p className="font-mono text-lg text-white font-bold">{lock.amount}</p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Unlock Date</p>
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-muted-foreground" />
                            <p className="font-mono text-sm text-white">
                              {new Date(lock.unlockTime * 1000).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Status</p>
                          <Badge variant={lock.withdrawn ? "secondary" : "default"} className="bg-red-500/20 text-red-200 border-red-500/30">
                            {lock.withdrawn ? "Withdrawn" : "Active"}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Action */}
                    {!lock.withdrawn && (
                      <div className="mt-6 pt-6 border-t border-white/10">
                        <Button
                          onClick={() => handleEmergencyWithdraw(lock.id)}
                          disabled={withdrawing === lock.id}
                          className="w-full bg-red-600 hover:bg-red-700 text-white"
                          data-testid={`button-emergency-withdraw-${lock.id}`}
                        >
                          {withdrawing === lock.id ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="w-4 h-4 mr-2" />
                              Emergency Withdraw
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
