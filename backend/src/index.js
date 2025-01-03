const express = require('express');
const cors = require('cors');
const logger = require('./config/logger');
const solanaClient = require('./services/solana');
const heliusService = require('./services/helius');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3001;

// CORS configuration
const corsOptions = {
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// Cache SOL price for 1 minute
let solPriceCache = {
  price: null,
  lastFetched: 0
};

async function getSolPrice() {
  const now = Date.now();
  // Return cached price if less than 1 minute old
  if (solPriceCache.price && (now - solPriceCache.lastFetched) < 60000) {
    return solPriceCache.price;
  }

  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const price = response.data.solana.usd;
    solPriceCache = {
      price,
      lastFetched: now
    };
    logger.info(`Updated SOL price: $${price}`);
    return price;
  } catch (error) {
    logger.error(`Error fetching SOL price: ${error.message}`);
    // Fallback to cached price if available, otherwise use 100
    return solPriceCache.price || 100;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Wallet data endpoint
app.get('/wallet/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const days = parseInt(req.query.days) || 1;
    
    // Get current SOL balance
    const solBalance = await heliusService.getBalance(address);
    if (solBalance === null) {
      throw new Error('Failed to fetch SOL balance');
    }

    // Get token accounts
    const tokenAccounts = await heliusService.getTokenAccounts(address);
    
    // Get transactions
    const signatures = await heliusService.getTransactionSignatures(address, days);
    if (!signatures) {
      throw new Error('Failed to fetch transaction signatures');
    }

    // Get enhanced transaction data
    const enhancedTxs = await heliusService.getEnhancedTransactions(signatures);
    if (!enhancedTxs) {
      throw new Error('Failed to fetch enhanced transactions');
    }

    // Format transactions
    const formattedTxs = [];
    for (const tx of enhancedTxs) {
      const formatted = await heliusService.formatTransaction(tx, address);
      if (formatted) {
        formattedTxs.push(formatted);
      }
    }

    // Calculate historical balances
    const balanceHistory = heliusService.calculateHistoricalBalances(enhancedTxs, solBalance, address);

    // Get SOL price
    const solPrice = await getSolPrice();
    const solUsdValue = solBalance * solPrice;

    res.json({
      wallet: {
        address,
        sol_balance: solBalance,
        sol_usd_value: solUsdValue
      },
      balance_history: balanceHistory,
      transactions: formattedTxs
    });
  } catch (error) {
    logger.error('Error in /wallet endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
}); 