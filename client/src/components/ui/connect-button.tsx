import { Button } from "@/components/ui/button";
import { Wallet, LogOut } from "lucide-react";
import { usePrivy } from '@privy-io/react-auth';

export function ConnectButton() {
  const { ready, authenticated, user, login, logout } = usePrivy();

  if (!ready) {
    return (
      <Button 
        disabled
        className="font-mono tracking-tight transition-all duration-300 neko-button-primary border-none shadow-none"
      >
        <Wallet className="w-4 h-4 mr-2" />
        Loading...
      </Button>
    );
  }

  if (authenticated && user) {
    const walletAddress = user.wallet?.address;
    const displayAddress = walletAddress 
      ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
      : 'Connected';

    return (
      <Button 
        variant="outline"
        className="font-mono tracking-tight transition-all duration-300 border-primary/50 text-primary hover:bg-primary/10 hover:text-white"
      >
        <Wallet className="w-4 h-4 mr-2" />
        {displayAddress}
      </Button>
    );
  }

  return (
    <Button 
      className="font-mono tracking-tight transition-all duration-300 neko-button-primary border-none shadow-none"
      onClick={login}
    >
      <Wallet className="w-4 h-4 mr-2" />
      Connect
    </Button>
  );
}