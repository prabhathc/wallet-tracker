const logger = require('../config/logger');

function formatTransaction(tx, walletAddress) {
  try {
    // Basic transaction info
    const formatted = {
      signature: tx.signature,
      block_time: tx.timestamp,
      slot: tx.slot,
      fee: tx.fee ? parseFloat(tx.fee) / 1e9 : null,
      type: tx.type || 'UNKNOWN',
      source: tx.source || 'UNKNOWN',
      description: tx.description || '',
      status: tx.status || 'Success',
      error: tx.error,
      program: tx.source || 'UNKNOWN',
      direction: 'unknown'
    };

    // Handle NFT events
    if (tx.events?.nft) {
      const nft = tx.events.nft;
      const fromAddr = nft.seller || nft.authority;
      const toAddr = nft.buyer;
      
      // Determine NFT transaction direction
      let direction = 'unknown';
      if (fromAddr === walletAddress) {
        direction = 'out';
      } else if (toAddr === walletAddress) {
        direction = 'in';
      }

      return {
        ...formatted,
        type: nft.type || 'NFT_TRANSACTION',
        source: nft.source || 'UNKNOWN',
        description: nft.description || 'NFT Transaction',
        amount: nft.amount ? parseFloat(nft.amount) / 1e9 : null,
        from: fromAddr,
        to: toAddr,
        direction,
        collection: nft.collection,
        name: nft.name,
        image: nft.image,
        marketplace: nft.source
      };
    }

    // Handle swap events
    if (tx.events?.swap) {
      const swap = tx.events.swap;
      const swapIn = {
        amount: 0,
        token: 'Unknown',
        value_usd: null
      };
      const swapOut = {
        amount: 0,
        token: 'Unknown',
        value_usd: null
      };

      // Handle native SOL input/output
      if (swap.nativeInput) {
        swapIn.amount = parseFloat(swap.nativeInput.amount) / 1e9;
        swapIn.token = 'SOL';
        swapIn.value_usd = parseFloat(swap.nativeInput.usdValue || 0);
      } else if (swap.tokenInputs?.[0]) {
        const tokenIn = swap.tokenInputs[0];
        swapIn.amount = parseFloat(tokenIn.amount || 0);
        swapIn.token = tokenIn.symbol || 'Unknown';
        swapIn.value_usd = parseFloat(tokenIn.usdValue || 0);
      }

      if (swap.nativeOutput) {
        swapOut.amount = parseFloat(swap.nativeOutput.amount) / 1e9;
        swapOut.token = 'SOL';
        swapOut.value_usd = parseFloat(swap.nativeOutput.usdValue || 0);
      } else if (swap.tokenOutputs?.[0]) {
        const tokenOut = swap.tokenOutputs[0];
        swapOut.amount = parseFloat(tokenOut.amount || 0);
        swapOut.token = tokenOut.symbol || 'Unknown';
        swapOut.value_usd = parseFloat(tokenOut.usdValue || 0);
      }

      let description = `Swap: ${swapIn.amount.toFixed(4)} ${swapIn.token} → ${swapOut.amount.toFixed(4)} ${swapOut.token}`;
      if (swapIn.value_usd && swapOut.value_usd) {
        description += ` ($${swapIn.value_usd.toFixed(2)} → $${swapOut.value_usd.toFixed(2)})`;
      }

      return {
        ...formatted,
        type: 'SWAP',
        source: swap.source || 'UNKNOWN',
        description,
        direction: 'swap',
        input: swapIn,
        output: swapOut,
        dex: swap.source,
        price_impact: swap.priceImpact
      };
    }

    // Handle native SOL transfers
    if (tx.nativeTransfers) {
      for (const transfer of tx.nativeTransfers) {
        const amount = parseFloat(transfer.amount) / 1e9;
        const fromAddr = transfer.fromUserAccount;
        const toAddr = transfer.toUserAccount;
        
        // Determine transfer direction
        let direction = 'unknown';
        let description = `Transferred ${amount.toFixed(4)} SOL`;
        
        if (fromAddr === walletAddress) {
          direction = 'out';
          description = `Sent ${amount.toFixed(4)} SOL`;
        } else if (toAddr === walletAddress) {
          direction = 'in';
          description = `Received ${amount.toFixed(4)} SOL`;
        }

        return {
          ...formatted,
          type: 'TRANSFER',
          source: 'SYSTEM_PROGRAM',
          from: fromAddr,
          to: toAddr,
          amount,
          description,
          direction,
          token: 'SOL',
          decimals: 9
        };
      }
    }

    // Handle token transfers
    if (tx.tokenTransfers) {
      for (const transfer of tx.tokenTransfers) {
        const amount = parseFloat(transfer.tokenAmount);
        const fromAddr = transfer.fromUserAccount;
        const toAddr = transfer.toUserAccount;
        const symbol = transfer.symbol || 'Unknown';
        
        // Determine transfer direction
        let direction = 'unknown';
        let description = `Transferred ${amount} ${symbol}`;
        
        if (fromAddr === walletAddress) {
          direction = 'out';
          description = `Sent ${amount} ${symbol}`;
        } else if (toAddr === walletAddress) {
          direction = 'in';
          description = `Received ${amount} ${symbol}`;
        }

        return {
          ...formatted,
          type: 'TOKEN_TRANSFER',
          source: 'SOLANA_PROGRAM_LIBRARY',
          from: fromAddr,
          to: toAddr,
          amount,
          token_symbol: symbol,
          mint: transfer.mint,
          description,
          direction,
          decimals: transfer.decimals
        };
      }
    }

    // If no transfers found but transaction exists, return basic info
    return formatted;

  } catch (error) {
    logger.error('Error formatting transaction:', error.message);
    return null;
  }
}

module.exports = { formatTransaction }; 