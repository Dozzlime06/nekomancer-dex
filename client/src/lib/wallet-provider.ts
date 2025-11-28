const MONAD_CHAIN_HEX = '0x8f';

export async function sendTransactionViaWallet(
  privy_wallet: any,
  txData: { to: `0x${string}`; data: `0x${string}` }
): Promise<string> {
  const provider = (window as any).ethereum;
  if (!provider) throw new Error('MetaMask not found');

  // Switch to Monad
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MONAD_CHAIN_HEX }] });
  } catch (e: any) {
    if (e.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: MONAD_CHAIN_HEX, chainName: 'Monad', rpcUrls: ['https://rpc3.monad.xyz/'], nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, blockExplorerUrls: ['https://monadvision.com/'] }],
      });
    }
  }

  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  return await provider.request({ method: 'eth_sendTransaction', params: [{ from: accounts[0], to: txData.to, data: txData.data }] });
}
