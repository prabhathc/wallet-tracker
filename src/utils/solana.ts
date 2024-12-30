export interface TokenBalance {
  mint: string;
  amount: number;
  decimals: number;
  usd_value: number;
}

export interface WalletBalance {
  address: string;
  sol_balance: number;
  sol_usd_value: number;
  total_usd_value: number;
  tokens: TokenBalance[];
}

export interface Transaction {
  signature: string;
  type: string;
  description: string;
  fee: number | null;
  block_time: number;
  from: string | null;
  to: string | null;
  amount: number | null;
  running_balance: number | null;
  token_info?: {
    mint: string;
    amount: number;
    decimals: number;
  };
}

export interface WalletData {
  wallet: WalletBalance;
  transactions: Transaction[] | null;
  errors: string[];
}

// Mock transaction data
const MOCK_TRANSACTIONS: Transaction[] = [
  {
    signature: "5xqXUYvGwrqsVNqR5T5EMFfpYGkpJxX5zWEYdvxXkfkUk1L5DwkJX9HrQK8Qr6xyLB5WwrE5sQVzxZ",
    type: "SOL_TRANSFER",
    description: "Sent SOL",
    amount: -1.5,
    fee: 0.000005,
    block_time: Date.now() / 1000 - 3600, // 1 hour ago
    from: "5zy2vhX3TJhjGBTypj2xjGsL2QF3Rn95nmjuu82gvXzN",
    to: "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
    running_balance: null
  },
  {
    signature: "2xqXUYvGwrqsVNqR5T5EMFfpYGkpJxX5zWEYdvxXkfkUk1L5DwkJX9HrQK8Qr6xyLB5WwrE5sQVzxY",
    type: "SOL_TRANSFER",
    description: "Received SOL",
    amount: 2.3,
    fee: 0.000005,
    block_time: Date.now() / 1000 - 7200, // 2 hours ago
    from: "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
    to: "5zy2vhX3TJhjGBTypj2xjGsL2QF3Rn95nmjuu82gvXzN",
    running_balance: null
  },
  {
    signature: "3xqXUYvGwrqsVNqR5T5EMFfpYGkpJxX5zWEYdvxXkfkUk1L5DwkJX9HrQK8Qr6xyLB5WwrE5sQVzxX",
    type: "SWAP",
    description: "Swapped SOL for USDC",
    amount: -0.8,
    fee: 0.000008,
    block_time: Date.now() / 1000 - 14400, // 4 hours ago
    from: "5zy2vhX3TJhjGBTypj2xjGsL2QF3Rn95nmjuu82gvXzN",
    to: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    running_balance: null
  }
];

const API_BASE_URL = 'http://127.0.0.1:8000';

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
      },
    });
    clearTimeout(id);

    if (!response.ok) {
      if (response.status === 0) {
        throw new Error('Network error - Unable to connect to the server');
      }
      const error = await response.text();
      throw new Error(error || `HTTP error! status: ${response.status}`);
    }

    return response;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - Server took too long to respond');
    }
    throw error;
  }
}

export async function getWalletData(walletAddress: string, timeWindow: number = 1): Promise<WalletData> {
  try {
    console.log('Fetching wallet data for:', walletAddress, 'with time window:', timeWindow);
    
    // Calculate number of transactions to fetch based on time window
    // Assume we need roughly 20 transactions per day
    const limit = Math.min(100, Math.max(20, timeWindow * 20));
    
    const walletResponse = await fetchWithTimeout(
      `${API_BASE_URL}/api/wallet/${walletAddress}?limit=${limit}`,
      {
        method: 'GET',
      }
    );

    const data = await walletResponse.json();
    
    return {
      wallet: data.wallet,
      transactions: data.transactions || null,
      errors: data.errors || []
    };
  } catch (error: any) {
    console.error('Error fetching wallet data:', error);
    if (error.message.includes('Network error')) {
      throw new Error('Unable to connect to the server. Please check if the backend is running.');
    }
    throw error;
  }
} 