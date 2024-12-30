'use client';

import React, { useState, useEffect } from 'react';
import { getWalletData, WalletData } from '../utils/solana';
import dynamic from 'next/dynamic';
import anime from 'animejs';
import TransactionItem from '../components/TransactionItem';

const DataViewport = dynamic(() => import('../components/DataViewport'), { ssr: false });

// Loading skeleton for transactions
function TransactionSkeleton() {
  return (
    <div className="px-4 py-3 animate-pulse">
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-4 w-24 bg-[#1E2233] rounded"></div>
            <div className="h-3 w-16 bg-[#1E2233] rounded"></div>
          </div>
          <div className="h-3 w-48 bg-[#1E2233] rounded"></div>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <div className="h-3 w-12 bg-[#1E2233] rounded"></div>
            <div className="h-3 w-32 bg-[#1E2233] rounded"></div>
          </div>
        </div>
        <div className="h-4 w-20 bg-[#1E2233] rounded"></div>
      </div>
    </div>
  );
}

// Clean loading animation
function LoadingPulse() {
  return (
    <div className="absolute inset-0 flex justify-center items-center opacity-0" style={{ transform: 'translateY(20px)' }}>
      <div className="relative w-32 h-32">
        {/* Outer ring with gradient */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#3B82F6]/20 to-[#3B82F6]/40 animate-[spin_8s_linear_infinite]" />
        
        {/* Multiple spinning rings */}
        {[...Array(3)].map((_, i) => (
          <div 
            key={i}
            className="absolute rounded-full border-2 border-[#3B82F6]/20"
            style={{
              inset: `${i * 4}px`,
              animationDuration: `${4 - i}s`,
              animationTimingFunction: 'linear',
              animationIterationCount: 'infinite',
              animationName: i % 2 === 0 ? 'spin' : 'spin-reverse'
            }}
          />
        ))}
        
        {/* Inner spinning ring with gradient */}
        <div className="absolute inset-8 rounded-full border-2 border-t-2 border-t-[#3B82F6] border-r-transparent border-b-transparent border-l-transparent animate-[spin_1s_cubic-bezier(0.55,0.055,0.675,0.19)_infinite]">
          <div className="absolute inset-0 rounded-full bg-gradient-to-t from-[#3B82F6]/20 to-transparent" />
        </div>
        
        {/* Center core */}
        <div className="absolute inset-[38%] rounded-full bg-[#3B82F6] animate-[pulse_2s_ease-in-out_infinite]">
          <div className="absolute inset-0 rounded-full bg-[#3B82F6]/30 blur-sm animate-[pulse_2s_ease-in-out_infinite]" />
        </div>
        
        {/* Orbiting particles */}
        {[...Array(8)].map((_, i) => (
          <div 
            key={i}
            className="absolute inset-0 animate-[spin_3s_linear_infinite]"
            style={{ 
              animationDelay: `${-i * 0.2}s`,
              transform: `rotate(${i * 45}deg)`
            }}
          >
            <div 
              className="absolute w-1.5 h-1.5 rounded-full bg-[#3B82F6]/60"
              style={{
                top: '2px',
                left: 'calc(50% - 3px)',
                filter: 'blur(1px)'
              }}
            />
          </div>
        ))}
        
        {/* Glowing effect */}
        <div className="absolute inset-0 rounded-full bg-[#3B82F6]/5 blur-xl animate-[pulse_3s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}

// Loading skeleton for portfolio overview
function PortfolioSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-[#151926]/50 backdrop-blur-xl rounded-xl p-4 border border-[#1E2233]/50">
          <div className="space-y-2 animate-pulse">
            <div className="h-3 w-24 bg-[#1E2233] rounded"></div>
            <div className="h-6 w-32 bg-[#1E2233] rounded"></div>
            <div className="h-3 w-20 bg-[#1E2233] rounded"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Format timestamp to date string
function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Get transaction icon based on type
function getTransactionIcon(type: string): string {
  switch (type.toUpperCase()) {
    case 'TRANSFER':
    case 'SOL_TRANSFER': return '↔';
    case 'TOKEN_TRANSFER': return '🔄';
    case 'SWAP': return '⚡';
    case 'NFT_SALE':
    case 'NFT_LISTING':
    case 'NFT_CANCEL_LISTING':
    case 'NFT_BID':
    case 'NFT_BID_CANCELLED':
    case 'NFT_MINT': return '🎨';
    case 'COMPRESSED_NFT_MINT': return '📦';
    case 'UNKNOWN': return '•';
    default: return '•';
  }
}

// Format SOL amount with 4 decimal places
function formatSOL(amount: number | null): string {
  if (amount === null) return '-';
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} SOL`;
}

// Format address to short form
function formatAddress(address: string | null): string {
  if (!address) return '-';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function Home() {
  const [walletAddress, setWalletAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transactionErrors, setTransactionErrors] = useState<string[]>([]);
  const [isRetryingTransactions, setIsRetryingTransactions] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentTimeWindow, setCurrentTimeWindow] = useState(1);

  // Animation refs
  const searchRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Handle animations when content changes
  useEffect(() => {
    if (!searchRef.current || !contentRef.current) return;

    const timeline = anime.timeline({
      easing: 'easeInOutCubic',
    });

    if (isLoading || walletData) {
      // Fade out search form
      timeline
        .add({
          targets: searchRef.current,
          opacity: [1, 0],
          translateY: [0, -20],
          duration: 400,
          easing: 'easeInOutCubic',
          complete: () => {
            if (searchRef.current) {
              searchRef.current.style.display = 'none';
            }
          }
        })
        .add({
          targets: '.loading-pulse',
          opacity: [0, 1],
          translateY: [20, 0],
          duration: 600,
          easing: 'easeOutCubic'
        }, '-=200');
    }

    if (walletData && !isLoading) {
      // Fade out loading and fade in content
      timeline
        .add({
          targets: '.loading-pulse',
          opacity: [1, 0],
          translateY: [0, -20],
          duration: 400,
          easing: 'easeInCubic'
        })
        .add({
          targets: contentRef.current,
          opacity: [0, 1],
          translateY: [20, 0],
          duration: 600,
          easing: 'easeOutCubic',
          begin: () => {
            if (contentRef.current) {
              contentRef.current.style.display = 'block';
            }
          }
        }, '-=200');
    }
  }, [isLoading, walletData]);

  // Handle retry animation
  useEffect(() => {
    if (isRetryingTransactions && contentRef.current) {
      anime({
        targets: contentRef.current,
        opacity: [1, 0.5, 1],
        duration: 400,
        easing: 'easeInOutCubic'
      });
    }
  }, [isRetryingTransactions]);

  // Handle time window change
  const handleTimeWindowChange = async (days: number) => {
    if (!walletData?.wallet?.address || days === currentTimeWindow) return;
    
    setCurrentTimeWindow(days);
    setIsRetryingTransactions(true);
    
    try {
      const data = await getWalletData(walletData.wallet.address, days);
      setWalletData(data);
      if (data.errors?.length > 0) {
        setTransactionErrors(data.errors);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error fetching transactions';
      setTransactionErrors([errorMessage]);
    } finally {
      setIsRetryingTransactions(false);
    }
  };

  const handleTrackWallet = async () => {
    if (!walletAddress.trim()) {
      setError('Please enter a wallet address');
      return;
    }

    setIsLoading(true);
    setError(null);
    setWalletData(null);
    setTransactionErrors([]);
    setCurrentTimeWindow(1); // Reset time window

    try {
      const data = await getWalletData(walletAddress, 1);
      setWalletData(data);
      if (data.errors?.length > 0) {
        setTransactionErrors(data.errors);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error fetching wallet data';
      setError(errorMessage);
      // Reset UI state on error
      setIsLoading(false);
      return;
    }
    
    setIsLoading(false);
  };

  const handleRetryTransactions = async () => {
    if (!walletData) return;
    
    setIsRetryingTransactions(true);
    setTransactionErrors([]);
    
    try {
      const data = await getWalletData(walletData.wallet.address);
      setWalletData(data);
      if (data.errors?.length > 0) {
        setTransactionErrors(data.errors);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error fetching transactions';
      setTransactionErrors([errorMessage]);
    } finally {
      setIsRetryingTransactions(false);
    }
  };

  // Generate historical data points
  const generateHistoricalData = () => {
    if (!walletData?.wallet?.sol_balance || !walletData?.transactions) {
      return [{
        date: Date.now(),
        value: 0,
        hasTransaction: false
      }];
    }
    
    const now = Date.now();
    const days = 30; // Show last 30 days
    const points = [];
    
    // Start from current balance and work backwards
    let currentBalance = walletData.wallet.sol_balance;
    
    // Sort transactions by block time in ascending order
    const sortedTransactions = [...walletData.transactions].sort((a, b) => a.block_time - b.block_time);
    
    // Create daily points
    for (let i = 0; i < days; i++) {
      const date = now - (i * 24 * 60 * 60 * 1000);
      const dayStart = Math.floor(date / 1000);
      const dayEnd = dayStart + (24 * 60 * 60);
      
      // Find transactions for this day
      const dayTransactions = sortedTransactions.filter(
        tx => tx.block_time >= dayStart && tx.block_time < dayEnd
      );
      
      points.unshift({
        date,
        value: currentBalance,
        hasTransaction: dayTransactions.length > 0
      });
      
      // Adjust balance based on transactions
      for (const tx of dayTransactions) {
        if (tx.amount) {
          // If this wallet is the sender, subtract the amount
          if (tx.from === walletData.wallet.address) {
            currentBalance += tx.amount; // Add because we're going backwards
          }
          // If this wallet is the receiver, add the amount
          else if (tx.to === walletData.wallet.address) {
            currentBalance -= tx.amount; // Subtract because we're going backwards
          }
        }
      }
    }
    
    return points;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F1A] text-[#E5E7EB]">
      <nav className="border-b border-[#1E2233]/50 bg-[#0B0F1A]/80 backdrop-blur-2xl sticky top-0 z-50">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex justify-between h-14 items-center">
            <h1 className="text-sm font-medium tracking-wide">Wallet Analytics</h1>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-[1200px] w-full mx-auto px-6 py-6">
        <div className="relative min-h-[600px]">
          {/* Search Form */}
          <div 
            ref={searchRef} 
            className="w-full max-w-lg mx-auto space-y-6"
          >
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-medium tracking-tight">
                Track Any Solana Wallet
              </h2>
              <p className="text-[#9CA3AF] text-sm">
                Enter a Solana wallet address to view its portfolio
              </p>
            </div>

            <div className="bg-[#151926]/50 backdrop-blur-xl rounded-lg p-3 border border-[#1E2233]/50">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Solana wallet address..."
                    value={walletAddress}
                    onChange={(e) => {
                      setError(null);
                      setWalletAddress(e.target.value);
                    }}
                    className="flex-1 bg-[#0B0F1A]/80 border border-[#1E2233]/50 rounded-md px-2.5 py-1.5 
                             text-sm placeholder-[#4B5563]
                             focus:outline-none focus:ring-1 focus:ring-[#3B82F6]/30 focus:border-[#3B82F6]/30"
                    disabled={isLoading}
                  />
                  <button
                    onClick={handleTrackWallet}
                    disabled={isLoading || !walletAddress.trim()}
                    className="bg-[#3B82F6]/10 border border-[#3B82F6]/20 hover:bg-[#3B82F6]/20 
                             text-[#3B82F6] px-3 py-1.5 rounded-md text-sm font-medium tracking-wide
                             transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? 'Loading...' : 'Track'}
                  </button>
                </div>
                {error && (
                  <p className="text-[#EF4444] text-xs">{error}</p>
                )}
              </div>
            </div>
          </div>

          {/* Loading State */}
          {isLoading && !walletData && (
            <div className="loading-pulse absolute inset-0 flex items-center justify-center">
              <LoadingPulse />
            </div>
          )}

          {/* Main Content */}
          <div 
            ref={contentRef} 
            className="space-y-4" 
            style={{ 
              display: 'none',
              opacity: 0
            }}
          >
            {/* Portfolio Overview */}
            {isLoading ? <PortfolioSkeleton /> : walletData?.wallet ? (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-[#151926]/50 backdrop-blur-xl rounded-xl p-4 border border-[#1E2233]/50">
                  <div className="space-y-1">
                    <p className="text-[#9CA3AF] text-xs font-medium tracking-wide">Total Value</p>
                    <p className="text-xl font-medium tracking-tight">
                      ${(walletData.wallet.sol_usd_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[#34D399] text-xs font-medium">+2.4%</span>
                      <span className="text-[#6B7280] text-[10px]">24h</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#151926]/50 backdrop-blur-xl rounded-xl p-4 border border-[#1E2233]/50">
                  <div className="space-y-1">
                    <p className="text-[#9CA3AF] text-xs font-medium tracking-wide">SOL Balance</p>
                    <p className="text-xl font-medium tracking-tight">
                      {(walletData.wallet.sol_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} SOL
                    </p>
                    <p className="text-[#9CA3AF] text-xs">
                      ${(walletData.wallet.sol_usd_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                <div className="bg-[#151926]/50 backdrop-blur-xl rounded-xl p-4 border border-[#1E2233]/50">
                  <div className="space-y-1">
                    <p className="text-[#9CA3AF] text-xs font-medium tracking-wide">Recent Activity</p>
                    <p className="text-xl font-medium tracking-tight">{walletData.transactions?.length || 0}</p>
                    <p className="text-[#9CA3AF] text-xs">Transactions</p>
                  </div>
                </div>
              </div>
            ) : null}

            {/* DataViewport Component */}
            <DataViewport 
              data={{
                balanceHistory: (() => {
                  if (!walletData?.transactions?.length || !walletData.wallet) return [];
                  
                  const currentSOLPrice = walletData.wallet.sol_usd_value / walletData.wallet.sol_balance;
                  const currentTokenValue = walletData.wallet.total_usd_value - walletData.wallet.sol_usd_value;
                  
                  const sortedTxs = [...walletData.transactions].sort((a, b) => a.block_time - b.block_time);
                  
                  const points = sortedTxs.map(tx => ({
                    date: tx.block_time * 1000,
                    solValue: tx.running_balance ?? 0,
                    usdValue: (tx.running_balance ?? 0) * currentSOLPrice,
                    tokenValue: currentTokenValue,
                    hasTransaction: true
                  }));
                  
                  points.push({
                    date: Date.now(),
                    solValue: walletData.wallet.sol_balance,
                    usdValue: walletData.wallet.sol_usd_value,
                    tokenValue: currentTokenValue,
                    hasTransaction: false
                  });
                  
                  return points;
                })(),
                transactions: (walletData?.transactions || []).map(tx => ({
                  ...tx,
                  running_balance: tx.running_balance ?? null,
                  direction: tx.from === walletData?.wallet?.address ? 'out' : 
                            tx.to === walletData?.wallet?.address ? 'in' : 
                            tx.type === 'SWAP' ? 'swap' : 'unknown'
                }))
              }}
              onTimeWindowChange={handleTimeWindowChange}
            />
          </div>
        </div>
      </main>
    </div>
  );
} 