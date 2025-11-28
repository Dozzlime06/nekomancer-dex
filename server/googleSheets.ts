import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-sheet',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Sheet not connected');
  }
  return accessToken;
}

export async function getGoogleSheetsClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
}

export async function getGoogleDriveClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

let spreadsheetId: string | null = null;
const SPREADSHEET_NAME = 'Nekomancer_Leaderboard';

export async function getOrCreateSpreadsheet(): Promise<string> {
  if (spreadsheetId) return spreadsheetId;

  const sheets = await getGoogleSheetsClient();
  const drive = await getGoogleDriveClient();

  try {
    const response = await drive.files.list({
      q: `name='${SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      fields: 'files(id, name)',
    });

    if (response.data.files && response.data.files.length > 0) {
      spreadsheetId = response.data.files[0].id!;
      console.log(`[SHEETS] Found existing spreadsheet: ${spreadsheetId}`);
      return spreadsheetId;
    }
  } catch (error) {
    console.log('[SHEETS] Error searching for spreadsheet, will create new one');
  }

  const createResponse = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: SPREADSHEET_NAME,
      },
      sheets: [
        {
          properties: { title: 'Swaps', index: 0 },
          data: [{
            startRow: 0,
            startColumn: 0,
            rowData: [{
              values: [
                { userEnteredValue: { stringValue: 'TxHash' } },
                { userEnteredValue: { stringValue: 'WalletAddress' } },
                { userEnteredValue: { stringValue: 'TokenIn' } },
                { userEnteredValue: { stringValue: 'TokenInSymbol' } },
                { userEnteredValue: { stringValue: 'TokenOut' } },
                { userEnteredValue: { stringValue: 'TokenOutSymbol' } },
                { userEnteredValue: { stringValue: 'AmountIn' } },
                { userEnteredValue: { stringValue: 'AmountOut' } },
                { userEnteredValue: { stringValue: 'VolumeMON' } },
                { userEnteredValue: { stringValue: 'DEX' } },
                { userEnteredValue: { stringValue: 'Timestamp' } },
              ]
            }]
          }]
        },
        {
          properties: { title: 'Stakes', index: 1 },
          data: [{
            startRow: 0,
            startColumn: 0,
            rowData: [{
              values: [
                { userEnteredValue: { stringValue: 'TxHash' } },
                { userEnteredValue: { stringValue: 'WalletAddress' } },
                { userEnteredValue: { stringValue: 'Action' } },
                { userEnteredValue: { stringValue: 'Amount' } },
                { userEnteredValue: { stringValue: 'Timestamp' } },
              ]
            }]
          }]
        },
      ],
    },
  });

  spreadsheetId = createResponse.data.spreadsheetId!;
  console.log(`[SHEETS] Created new spreadsheet: ${spreadsheetId}`);
  return spreadsheetId;
}

export interface SwapRecord {
  txHash: string;
  walletAddress: string;
  tokenIn: string;
  tokenInSymbol: string;
  tokenOut: string;
  tokenOutSymbol: string;
  amountIn: string;
  amountOut: string;
  volumeMon: string;
  dex: string;
}

export interface StakeRecord {
  txHash: string;
  walletAddress: string;
  action: string;
  amount: string;
}

export async function recordSwapToSheet(swap: SwapRecord): Promise<void> {
  const sheets = await getGoogleSheetsClient();
  const sheetId = await getOrCreateSpreadsheet();

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Swaps!A:K',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        swap.txHash,
        swap.walletAddress,
        swap.tokenIn,
        swap.tokenInSymbol,
        swap.tokenOut,
        swap.tokenOutSymbol,
        swap.amountIn,
        swap.amountOut,
        swap.volumeMon,
        swap.dex,
        new Date().toISOString(),
      ]]
    }
  });
  
  console.log(`[SHEETS] Recorded swap: ${swap.txHash.slice(0, 10)}... volume=${swap.volumeMon} MON`);
}

export async function recordStakeToSheet(stake: StakeRecord): Promise<void> {
  const sheets = await getGoogleSheetsClient();
  const sheetId = await getOrCreateSpreadsheet();

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Stakes!A:E',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        stake.txHash,
        stake.walletAddress,
        stake.action,
        stake.amount,
        new Date().toISOString(),
      ]]
    }
  });
  
  console.log(`[SHEETS] Recorded stake: ${stake.txHash.slice(0, 10)}... action=${stake.action} amount=${stake.amount}`);
}

export async function getSwapLeaderboard(limit: number = 100): Promise<{ walletAddress: string; totalVolumeMon: number; swapCount: number }[]> {
  const sheets = await getGoogleSheetsClient();
  const sheetId = await getOrCreateSpreadsheet();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'Swaps!A2:K',
  });

  const rows = response.data.values || [];
  
  const walletStats = new Map<string, { volume: number; count: number }>();
  
  for (const row of rows) {
    const wallet = (row[1] || '').toLowerCase();
    const volume = parseFloat(row[8] || '0');
    
    if (wallet) {
      const existing = walletStats.get(wallet) || { volume: 0, count: 0 };
      existing.volume += volume;
      existing.count += 1;
      walletStats.set(wallet, existing);
    }
  }

  return Array.from(walletStats.entries())
    .map(([walletAddress, stats]) => ({
      walletAddress,
      totalVolumeMon: stats.volume,
      swapCount: stats.count,
    }))
    .sort((a, b) => b.totalVolumeMon - a.totalVolumeMon)
    .slice(0, limit);
}

export async function getStakingLeaderboard(limit: number = 100): Promise<{ walletAddress: string; totalStaked: number; stakeCount: number }[]> {
  const sheets = await getGoogleSheetsClient();
  const sheetId = await getOrCreateSpreadsheet();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'Stakes!A2:E',
  });

  const rows = response.data.values || [];
  
  const walletStats = new Map<string, { staked: number; count: number }>();
  
  for (const row of rows) {
    const wallet = (row[1] || '').toLowerCase();
    const action = row[2] || '';
    const amount = parseFloat(row[3] || '0');
    
    if (wallet) {
      const existing = walletStats.get(wallet) || { staked: 0, count: 0 };
      
      if (action === 'stake') {
        existing.staked += amount;
      } else if (action === 'unstake' || action === 'emergency_unstake') {
        existing.staked -= amount;
      }
      existing.count += 1;
      walletStats.set(wallet, existing);
    }
  }

  return Array.from(walletStats.entries())
    .filter(([_, stats]) => stats.staked > 0)
    .map(([walletAddress, stats]) => ({
      walletAddress,
      totalStaked: stats.staked,
      stakeCount: stats.count,
    }))
    .sort((a, b) => b.totalStaked - a.totalStaked)
    .slice(0, limit);
}

export async function getSwapStats(): Promise<{ totalVolume: number; totalSwappers: number }> {
  const sheets = await getGoogleSheetsClient();
  const sheetId = await getOrCreateSpreadsheet();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'Swaps!A2:K',
  });

  const rows = response.data.values || [];
  
  let totalVolume = 0;
  const uniqueWallets = new Set<string>();
  
  for (const row of rows) {
    const wallet = (row[1] || '').toLowerCase();
    const volume = parseFloat(row[8] || '0');
    
    if (wallet) {
      totalVolume += volume;
      uniqueWallets.add(wallet);
    }
  }

  return {
    totalVolume,
    totalSwappers: uniqueWallets.size,
  };
}

export async function getStakingStats(): Promise<{ totalStaked: number; totalStakers: number }> {
  const sheets = await getGoogleSheetsClient();
  const sheetId = await getOrCreateSpreadsheet();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'Stakes!A2:E',
  });

  const rows = response.data.values || [];
  
  let totalStaked = 0;
  const stakers = new Set<string>();
  
  for (const row of rows) {
    const wallet = (row[1] || '').toLowerCase();
    const action = row[2] || '';
    const amount = parseFloat(row[3] || '0');
    
    if (wallet) {
      if (action === 'stake') {
        totalStaked += amount;
        stakers.add(wallet);
      } else if (action === 'unstake' || action === 'emergency_unstake') {
        totalStaked -= amount;
      }
    }
  }

  return {
    totalStaked: Math.max(0, totalStaked),
    totalStakers: stakers.size,
  };
}
