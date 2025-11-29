import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import solc from 'solc';
import fs from 'fs';
import path from 'path';

const MONAD_RPC = 'https://rpc3.monad.xyz/';
const CHAIN_ID = 143;

async function compileContract() {
  const contractPath = path.join(process.cwd(), 'contracts/TokenLockerStandalone.sol');
  const contractCode = fs.readFileSync(contractPath, 'utf-8');

  const input = {
    language: 'Solidity',
    sources: {
      'TokenLockerStandalone.sol': {
        content: contractCode,
      },
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode'],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const errors = output.errors.filter((e: any) => e.severity === 'error');
    if (errors.length > 0) {
      throw new Error(JSON.stringify(errors));
    }
  }

  const contract = output.contracts['TokenLockerStandalone.sol']['TokenLocker'];
  return {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object,
  };
}

async function deploy() {
  console.log('\n🚀 TokenLocker Deployment to Monad Chain 143');
  console.log('='.repeat(55) + '\n');

  try {
    const privateKey = process.env.WALLET_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('WALLET_PRIVATE_KEY not set');
    }

    console.log('📝 Compiling TokenLocker...');
    const { abi, bytecode } = await compileContract();
    console.log('✅ Compilation successful\n');

    const account = privateKeyToAccount(
      privateKey.startsWith('0x') ? (privateKey as `0x${string}`) : (`0x${privateKey}` as `0x${string}`)
    );
    console.log(`👤 Deployer: ${account.address}\n`);

    const publicClient = createPublicClient({
      transport: http(MONAD_RPC),
    });

    const walletClient = createWalletClient({
      account,
      transport: http(MONAD_RPC),
    });

    const balance = await publicClient.getBalance({
      address: account.address,
    });
    const balanceMON = Number(balance) / 1e18;
    console.log(`💰 Wallet Balance: ${balanceMON.toFixed(4)} MON`);

    if (balance === BigInt(0)) {
      throw new Error('Insufficient balance');
    }

    console.log('\n📤 Deploying contract...\n');

    const txHash = await walletClient.deployContract({
      abi: abi,
      bytecode: (`0x${bytecode}` as `0x${string}`),
    });

    console.log(`📋 Tx Hash: ${txHash}`);
    console.log('⏳ Waiting for confirmation...\n');

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    if (receipt.status === 'success' && receipt.contractAddress) {
      console.log('✅ DEPLOYMENT SUCCESSFUL!\n');
      console.log('🎯 CONTRACT ADDRESS:');
      console.log(`   ${receipt.contractAddress}\n`);

      console.log('📊 Details:');
      console.log(`   Chain: Monad (143)`);
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Gas: ${receipt.gasUsed}`);
      console.log(`   Link: https://monadvision.com/address/${receipt.contractAddress}\n`);

      // Save to .env
      fs.writeFileSync('.env.local', `VITE_LOCKER_CONTRACT_ADDRESS=${receipt.contractAddress}\n`);
      console.log('✅ Saved to .env.local\n');

      console.log('📋 Add this to your environment:');
      console.log(`VITE_LOCKER_CONTRACT_ADDRESS=${receipt.contractAddress}\n`);

      process.exit(0);
    } else {
      throw new Error('Deployment failed');
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

deploy();
