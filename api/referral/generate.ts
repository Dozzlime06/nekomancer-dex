import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'NEKO';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ message: 'Wallet address required' });
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return res.status(500).json({ message: 'Database not configured' });
    }

    const sql = neon(databaseUrl);

    const existing = await sql`
      SELECT code FROM referral_codes WHERE wallet_address = ${walletAddress.toLowerCase()}
    `;

    if (existing.length > 0) {
      return res.status(200).json({ code: existing[0].code, existing: true });
    }

    let code = generateCode();
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const codeExists = await sql`
        SELECT id FROM referral_codes WHERE code = ${code}
      `;
      
      if (codeExists.length === 0) break;
      code = generateCode();
      attempts++;
    }

    if (attempts >= maxAttempts) {
      return res.status(500).json({ message: 'Failed to generate unique code' });
    }

    await sql`
      INSERT INTO referral_codes (wallet_address, code)
      VALUES (${walletAddress.toLowerCase()}, ${code})
    `;

    return res.status(200).json({ code, existing: false });
  } catch (error: any) {
    console.error('Generate referral code error:', error);
    return res.status(500).json({ message: error.message });
  }
}
