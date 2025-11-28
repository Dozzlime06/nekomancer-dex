import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PrivyProvider } from '@privy-io/react-auth';
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Swap from "@/pages/swap";
import Staking from "@/pages/staking";
import Leaderboard from "@/pages/leaderboard";
import Admin from "@/pages/admin";

const monadChain = {
  id: 143,
  name: 'Monad',
  nativeCurrency: {
    name: 'MON',
    symbol: 'MON',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc3.monad.xyz/'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Monad Vision',
      url: 'https://monadvision.com/',
    },
  },
};

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/app" component={Dashboard} />
      <Route path="/swap" component={Swap} />
      <Route path="/staking" component={Staking} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <PrivyProvider
      appId="cmigfq0mr004ljf0c1j36gpk3"
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#836EF9',
          showWalletLoginFirst: true,
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'off',
          },
        },
        loginMethods: ['wallet'],
        supportedChains: [monadChain],
        defaultChain: monadChain,
      }}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <SonnerToaster 
            position="top-center" 
            toastOptions={{
              duration: 5000,
              style: {
                background: '#1a1a1a',
                border: '1px solid rgba(131, 110, 249, 0.3)',
                color: '#fff',
              },
            }}
          />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

export default App;
