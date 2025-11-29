import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ message: 'Referral code required' });
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return res.status(404).json({ message: 'Code not found' });
    }

    const sql = neon(databaseUrl);

    const result = await sql`
      SELECT wallet_address FROM referral_codes WHERE code = ${code.toUpperCase()}
    `;

    if (result.length === 0) {
      return res.status(404).json({ message: 'Code not found' });
    }

    return res.status(200).json({ 
      referrerWallet: result[0].wallet_address 
    });
  } catch (error: any) {
    console.error('Referral lookup error:', error);
    return res.status(500).json({ message: error.message });
  }
}
