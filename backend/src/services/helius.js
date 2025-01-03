const axios = require('axios');
const logger = require('../config/logger');

const HELIUS_API_KEY = 'c2a055e2-e2f8-453c-94fa-66abad52c463';
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

class HeliusService {
  constructor() {
    this.client = axios.create({
      baseURL: HELIUS_RPC_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async getBalance(walletAddress) {
    try {
      const response = await this.client.post('', {
        jsonrpc: '2.0',
        id: 'balance',
        method: 'getBalance',
        params: [walletAddress]
      });

      if (response.data.error) {
        logger.error('RPC error in getBalance:', response.data.error);
        return null;
      }

      const balance = Number(response.data.result.value) / 1e9;
      logger.info(`Got balance: ${balance} SOL`);
      return balance;
    } catch (error) {
      logger.error('Error fetching balance:', error.message);
      return null;
    }
  }

  async getTokenAccounts(walletAddress) {
    try {
      const response = await this.client.post('', {
        jsonrpc: '2.0',
        id: 'token-accounts',
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          {
            programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
          },
          {
            encoding: 'jsonParsed'
          }
        ]
      });

      if (response.data.error) {
        logger.error('RPC error in getTokenAccounts:', response.data.error);
        return null;
      }

      return response.data.result.value;
    } catch (error) {
      logger.error('Error fetching token accounts:', error.message);
      return null;
    }
  }

  async getTransactionSignatures(walletAddress, days = 1) {
    try {
      logger.info(`Fetching ${days}d signatures for wallet: ${walletAddress}`);
      const until = Math.floor(Date.now() / 1000 - (days * 24 * 60 * 60));

      const response = await axios.post(HELIUS_RPC_URL, {
        jsonrpc: '2.0',
        id: '1',
        method: 'getSignaturesForAddress',
        params: [
          walletAddress,
          { limit: 1000 }
        ]
      });

      if (response.data.error) {
        logger.error(`RPC error in getSignaturesForAddress: ${JSON.stringify(response.data.error)}`);
        return null;
      }

      const signatures = response.data.result.map(tx => tx.signature);
      logger.info(`Successfully fetched ${signatures.length} signatures`);
      return signatures;
    } catch (error) {
      logger.error(`Error fetching signatures: ${error.message}`);
      return null;
    }
  }

  async getEnhancedTransactions(signatures) {
    if (!signatures?.length) {
      logger.info('No signatures provided for enhanced transactions');
      return [];
    }

    try {
      logger.info(`Fetching enhanced data for ${signatures.length} transactions`);
      const response = await axios.post(
        `https://api.helius.xyz/v0/transactions?api-key=${HELIUS_API_KEY}`,
        { transactions: signatures.slice(0, 100) }
      );

      logger.info(`Successfully fetched enhanced data for ${response.data.length} transactions`);
      return response.data;
    } catch (error) {
      logger.error(`Error fetching enhanced transactions: ${error.message}`);
      return null;
    }
  }

  async getTokenPrices(mints) {
    if (!mints?.length) return {};

    try {
      // Try Jupiter API first
      const response = await axios.get(`https://price.jup.ag/v4/price?ids=${mints.join(',')}`);
      if (response.status === 200) {
        return response.data.data;
      }
    } catch (error) {
      logger.warn('Jupiter price API error:', error.message);
    }

    // Fallback to Helius RPC for each token
    const prices = {};
    for (const mint of mints) {
      try {
        const response = await this.client.post('', {
          jsonrpc: '2.0',
          id: 'price',
          method: 'getTokenPrice',
          params: [mint]
        });

        if (response.data.result) {
          prices[mint] = response.data.result;
        }
      } catch (error) {
        logger.warn(`Helius price API error for ${mint}:`, error.message);
      }
    }

    return prices;
  }

  async getTokenInfo(address) {
    try {
      const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
      if (response.data.pairs && response.data.pairs.length > 0) {
        // Get the most liquid pair
        const pair = response.data.pairs[0];
        return {
          symbol: pair.baseToken.symbol,
          name: pair.baseToken.name,
          priceUsd: parseFloat(pair.priceUsd),
          liquidity: parseFloat(pair.liquidity.usd),
          volume24h: parseFloat(pair.volume.h24),
          dex: pair.dexId
        };
      }
      return null;
    } catch (error) {
      logger.error(`Error fetching token info from DexScreener: ${error.message}`);
      return null;
    }
  }

  async formatTransaction(tx, walletAddress) {
    try {
      // Skip transactions that don't affect value
      if (!tx.events?.swap && !tx.tokenTransfers?.length && !tx.nativeTransfers?.length) {
        return null;
      }

      const formatted = {
        signature: tx.signature,
        type: tx.type || 'UNKNOWN',
        description: '',
        fee: tx.fee ? parseFloat(tx.fee) / 1e9 : null,
        block_time: tx.timestamp,
        from: null,
        to: null,
        amount: null,
        source: null,
        status: tx.status || 'Success',
        error: tx.error,
        program: tx.source || 'UNKNOWN',
        direction: 'unknown',
        value_change_usd: null
      };

      // Handle swap events
      if (tx.events?.swap) {
        const swap = tx.events.swap;
        const swapIn = { amount: 0, token: 'Unknown', value_usd: null };
        const swapOut = { amount: 0, token: 'Unknown', value_usd: null };

        // Handle input token
        if (swap.nativeInput) {
          swapIn.amount = parseFloat(swap.nativeInput.amount) / 1e9;
          swapIn.token = 'SOL';
          swapIn.value_usd = parseFloat(swap.nativeInput.usdValue);
        } else if (swap.tokenInputs?.length) {
          const tokenIn = swap.tokenInputs[0];
          swapIn.amount = parseFloat(tokenIn.amount);
          swapIn.token = tokenIn.symbol || await this.getTokenSymbol(tokenIn.mint);
          swapIn.value_usd = parseFloat(tokenIn.usdValue);
        }

        // Handle output token
        if (swap.nativeOutput) {
          swapOut.amount = parseFloat(swap.nativeOutput.amount) / 1e9;
          swapOut.token = 'SOL';
          swapOut.value_usd = parseFloat(swap.nativeOutput.usdValue);
        } else if (swap.tokenOutputs?.length) {
          const tokenOut = swap.tokenOutputs[0];
          swapOut.amount = parseFloat(tokenOut.amount);
          swapOut.token = tokenOut.symbol || await this.getTokenSymbol(tokenOut.mint);
          swapOut.value_usd = parseFloat(tokenOut.usdValue);
        }

        // Format amounts nicely
        const inAmount = swapIn.amount < 0.001 ? swapIn.amount.toExponential(2) : swapIn.amount.toFixed(3);
        const outAmount = swapOut.amount < 0.001 ? swapOut.amount.toExponential(2) : swapOut.amount.toFixed(3);
        
        formatted.description = `Swapped ${inAmount} ${swapIn.token} for ${outAmount} ${swapOut.token}`;
        
        if (swapIn.value_usd && swapOut.value_usd) {
          formatted.value_change_usd = swapOut.value_usd - swapIn.value_usd;
          formatted.description += ` ($${swapIn.value_usd.toFixed(2)} → $${swapOut.value_usd.toFixed(2)})`;
        }

        formatted.type = 'SWAP';
        formatted.source = swap.source || 'DEX';
        formatted.direction = 'swap';
        formatted.input = swapIn;
        formatted.output = swapOut;
        formatted.dex = swap.source;

        return formatted;
      }

      // Handle token transfers
      if (tx.tokenTransfers?.length) {
        const transfer = tx.tokenTransfers[0];
        const amount = parseFloat(transfer.tokenAmount);
        const fromAddr = transfer.fromUserAccount;
        const toAddr = transfer.toUserAccount;
        
        // Get token symbol
        const symbol = transfer.symbol || await this.getTokenSymbol(transfer.mint);
        const valueUsd = transfer.valueUsd ? parseFloat(transfer.valueUsd) : null;

        // Skip dust transfers (value less than $0.01)
        if (valueUsd !== null && valueUsd < 0.01) {
          return null;
        }

        // Format amount nicely
        const formattedAmount = amount < 0.001 ? amount.toExponential(3) : amount.toFixed(6);

        // Shorten addresses for better readability
        const shortFromAddr = fromAddr.slice(0, 4) + '...' + fromAddr.slice(-4);
        const shortToAddr = toAddr.slice(0, 4) + '...' + toAddr.slice(-4);

        if (fromAddr === walletAddress) {
          formatted.direction = 'out';
          formatted.description = `Sent ${formattedAmount} ${symbol} to ${shortToAddr}`;
          if (valueUsd) {
            formatted.value_change_usd = -valueUsd;
            formatted.description += ` ($${valueUsd.toFixed(2)})`;
          }
        } else if (toAddr === walletAddress) {
          formatted.direction = 'in';
          formatted.description = `Received ${formattedAmount} ${symbol} from ${shortFromAddr}`;
          if (valueUsd) {
            formatted.value_change_usd = valueUsd;
            formatted.description += ` ($${valueUsd.toFixed(2)})`;
          }
        }

        formatted.type = 'TOKEN_TRANSFER';
        formatted.from = fromAddr;
        formatted.to = toAddr;
        formatted.amount = amount;
        formatted.token_symbol = symbol;
        formatted.mint = transfer.mint;

        return formatted;
      }

      // Handle native SOL transfers
      if (tx.nativeTransfers?.length) {
        const transfer = tx.nativeTransfers[0];
        const amount = parseFloat(transfer.amount) / 1e9;
        const fromAddr = transfer.fromUserAccount;
        const toAddr = transfer.toUserAccount;
        
        // Skip dust transfers (less than 0.00001 SOL)
        if (amount < 0.00001) {
          return null;
        }

        // Format amount nicely
        const formattedAmount = amount < 0.001 ? amount.toExponential(3) : amount.toFixed(6);

        // Shorten addresses for better readability
        const shortFromAddr = fromAddr.slice(0, 4) + '...' + fromAddr.slice(-4);
        const shortToAddr = toAddr.slice(0, 4) + '...' + toAddr.slice(-4);

        if (fromAddr === walletAddress) {
          formatted.direction = 'out';
          formatted.description = `Sent ${formattedAmount} SOL to ${shortToAddr}`;
        } else if (toAddr === walletAddress) {
          formatted.direction = 'in';
          formatted.description = `Received ${formattedAmount} SOL from ${shortFromAddr}`;
        }

        formatted.type = 'SOL_TRANSFER';
        formatted.from = fromAddr;
        formatted.to = toAddr;
        formatted.amount = amount;
        formatted.token_symbol = 'SOL';

        return formatted;
      }

      return null;
    } catch (error) {
      logger.error(`Error formatting transaction: ${error.message}`);
      return null;
    }
  }

  async getTokenSymbol(mint) {
    try {
      const tokenInfo = await this.getTokenInfo(mint);
      return tokenInfo?.symbol || mint.slice(0, 4) + '...';
    } catch (error) {
      return mint.slice(0, 4) + '...';
    }
  }

  calculateHistoricalBalances(transactions, currentBalance, walletAddress) {
    logger.info(`Calculating historical balances for ${walletAddress}`);

    // Sort transactions by timestamp ascending (oldest first)
    const sortedTxs = transactions.sort((a, b) => b.timestamp - a.timestamp);
    const balancePoints = [];
    let runningBalance = currentBalance;

    // Add current balance as the first point
    balancePoints.push({
      date: Date.now(),
      solValue: currentBalance,
      valueChange: 0,
      hasTransaction: false
    });

    // Process transactions backwards to reconstruct history
    for (const tx of sortedTxs) {
      let valueChangeSOL = 0;

      // Handle swaps
      if (tx.events?.swap) {
        const swap = tx.events.swap;
        
        // Track SOL changes from swaps (reverse the sign for historical reconstruction)
        if (swap.nativeInput) {
          valueChangeSOL += parseFloat(swap.nativeInput.amount) / 1e9; // Changed from -= to +=
        }
        if (swap.nativeOutput) {
          valueChangeSOL -= parseFloat(swap.nativeOutput.amount) / 1e9; // Changed from += to -=
        }
      }

      // Handle SOL transfers (reverse the sign for historical reconstruction)
      if (tx.nativeTransfers?.length) {
        for (const transfer of tx.nativeTransfers) {
          const amount = parseFloat(transfer.amount) / 1e9;
          if (transfer.fromUserAccount === walletAddress) {
            valueChangeSOL += amount; // Changed from -= to +=
          }
          if (transfer.toUserAccount === walletAddress) {
            valueChangeSOL -= amount; // Changed from += to -=
          }
        }
      }

      // Handle token transfers that affect SOL balance (e.g., wrapped SOL)
      if (tx.tokenTransfers?.length) {
        for (const transfer of tx.tokenTransfers) {
          // Check if this is a wrapped SOL transfer
          if (transfer.mint === 'So11111111111111111111111111111111111111112') {
            const amount = parseFloat(transfer.tokenAmount);
            if (transfer.fromUserAccount === walletAddress) {
              valueChangeSOL += amount; // Changed from -= to +=
            }
            if (transfer.toUserAccount === walletAddress) {
              valueChangeSOL -= amount; // Changed from += to -=
            }
          }
        }
      }

      // Add back fees if this wallet paid them (reverse for historical reconstruction)
      if (tx.fee && tx.feePayer === walletAddress) {
        valueChangeSOL += parseFloat(tx.fee) / 1e9; // Changed from -= to +=
      }

      // Only add point if there was a meaningful change
      if (Math.abs(valueChangeSOL) >= 0.000001) {
        // Calculate previous balance (add the change since we're going backwards)
        runningBalance = runningBalance + valueChangeSOL;
        
        // Ensure balance never goes negative
        if (runningBalance < 0) {
          logger.warn(`Negative balance detected for ${walletAddress} at ${new Date(tx.timestamp * 1000).toISOString()}, adjusting to 0`);
          runningBalance = 0;
        }
        
        balancePoints.push({
          date: tx.timestamp * 1000, // Convert to milliseconds
          solValue: runningBalance,
          valueChange: valueChangeSOL,
          hasTransaction: true,
          type: tx.type,
          description: tx.description || 'Transaction'
        });
      }
    }

    // If we have no historical points, add one from 24h ago
    if (balancePoints.length === 1) {
      balancePoints.push({
        date: Date.now() - 24 * 60 * 60 * 1000, // 24 hours ago
        solValue: currentBalance,
        valueChange: 0,
        hasTransaction: false
      });
    }

    // Sort by timestamp ascending for display
    balancePoints.sort((a, b) => a.date - b.date);
    
    return balancePoints;
  }
}

module.exports = new HeliusService(); 