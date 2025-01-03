import { Transaction } from '../components/TransactionItem';

export interface TokenBalance {
  mint: string;
  amount: number;
  decimals: number;
  price_usd?: number;
  value_usd?: number;
}

export interface WalletData {
  wallet: {
    address: string;
    sol_balance: number;
    sol_usd_value: number;
    balance_history: Array<{
      date: number;
      solValue: number;
      hasTransaction: boolean;
    }>;
  };
  transactions: Array<Transaction>;
  errors?: string[];
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function getWalletData(address: string, days: number = 1): Promise<WalletData> {
  const response = await fetch(`${API_BASE_URL}/wallet/${address}?days=${days}`);
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  const data = await response.json();
  return {
    wallet: {
      address: data.wallet.address,
      sol_balance: data.wallet.sol_balance,
      sol_usd_value: data.wallet.sol_usd_value,
      balance_history: data.balance_history || []
    },
    transactions: data.transactions || [],
    errors: data.errors
  };
} 