const { Connection, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');
const NodeCache = require('node-cache');
const logger = require('../config/logger');

// Constants
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';

// Cache for RPC responses (5 minutes TTL)
const balanceCache = new NodeCache({ stdTTL: 300 });

class TokenData {
  constructor(mint, balance, decimals) {
    this.mint = mint;
    this.balance = balance;
    this.decimals = decimals;
  }
}

class SolanaClient {
  constructor() {
    logger.info(`Initializing SolanaClient with endpoint: ${RPC_ENDPOINT}`);
    this.clients = [];
    const connectionErrors = [];

    try {
      logger.debug(`Attempting to connect to endpoint: ${RPC_ENDPOINT}`);
      const connection = new Connection(RPC_ENDPOINT, 'confirmed');
      this.clients.push(connection);
      logger.info(`Successfully connected to endpoint: ${RPC_ENDPOINT}`);
    } catch (e) {
      const errorMsg = `Failed to initialize client for endpoint ${RPC_ENDPOINT}: ${e.message}`;
      logger.warn(errorMsg);
      connectionErrors.push(errorMsg);
    }

    if (this.clients.length === 0) {
      const errorDetails = connectionErrors.join('\n');
      logger.error(`All RPC endpoints failed!\n${errorDetails}`);
      throw new Error('Failed to initialize any Solana RPC clients. Please check your internet connection or try again later.');
    }

    this.currentClientIndex = 0;
  }

  _getClient() {
    const client = this.clients[this.currentClientIndex];
    logger.debug(`Using RPC endpoint: ${client._rpcEndpoint}`);
    return client;
  }

  _rotateClient() {
    const oldEndpoint = this.clients[this.currentClientIndex]._rpcEndpoint;
    this.currentClientIndex = (this.currentClientIndex + 1) % this.clients.length;
    const newEndpoint = this.clients[this.currentClientIndex]._rpcEndpoint;
    logger.info(`Rotating RPC endpoint from ${oldEndpoint} to ${newEndpoint}`);
  }

  async retryRpc(operation) {
    let lastError = null;
    for (let attempt = 0; attempt < this.clients.length; attempt++) {
      try {
        const client = this._getClient();
        logger.debug(`Attempting RPC call with endpoint: ${client._rpcEndpoint} (attempt ${attempt + 1})`);
        const result = await operation(client);
        logger.debug(`RPC call successful with endpoint: ${client._rpcEndpoint}`);
        return result;
      } catch (e) {
        logger.error(`RPC call failed with endpoint ${this._getClient()._rpcEndpoint}: ${e.message}`);
        lastError = e;
        this._rotateClient();
      }
    }

    logger.error(`All RPC endpoints failed. Last error: ${lastError.message}`);
    throw lastError;
  }

  async getSolBalance(walletAddress) {
    try {
      logger.info(`Getting SOL balance for wallet: ${walletAddress}`);
      
      // Check cache first
      const cacheKey = `balance:${walletAddress}`;
      const cachedBalance = balanceCache.get(cacheKey);
      if (cachedBalance !== undefined) {
        logger.debug(`Returning cached balance for ${walletAddress}`);
        return cachedBalance;
      }

      const pubkey = new PublicKey(walletAddress);
      logger.debug('Successfully created PublicKey from address');

      const getBalance = async (client) => {
        logger.debug('Sending getBalance request to RPC');
        const balance = await client.getBalance(pubkey);
        
        // Ensure balance is non-negative
        if (balance < 0) {
          logger.warn(`Received negative balance for ${walletAddress}, setting to 0`);
          return 0;
        }
        
        const solBalance = balance / 1e9;
        logger.debug(`Received balance response: ${solBalance} SOL`);

        // Cache the result only if it's valid
        if (solBalance >= 0) {
          balanceCache.set(cacheKey, solBalance);
        }
        
        logger.info(`Successfully retrieved SOL balance: ${solBalance}`);
        return solBalance;
      };

      return await this.retryRpc(getBalance);
    } catch (e) {
      logger.error(`Failed to get SOL balance: ${e.message}`, e);
      return 0; // Return 0 instead of null for better data consistency
    }
  }

  async getTokenAccounts(walletAddress) {
    try {
      logger.info(`Getting token accounts for wallet: ${walletAddress}`);
      const pubkey = new PublicKey(walletAddress);
      logger.debug('Successfully created PublicKey from address');

      const getAccounts = async (client) => {
        logger.debug('Sending getParsedTokenAccountsByOwner request to RPC');
        const response = await client.getParsedTokenAccountsByOwner(
          pubkey,
          { programId: new PublicKey(TOKEN_PROGRAM_ID) },
          'confirmed'
        );

        const tokens = [];
        for (const account of response.value) {
          try {
            const parsed = account.account.data.parsed.info;
            const mint = parsed.mint;
            const decimals = parsed.tokenAmount.decimals;
            const amount = Number(parsed.tokenAmount.amount) / (10 ** decimals);

            if (amount > 0) {
              tokens.push(new TokenData(
                mint,
                amount,
                decimals
              ));
              logger.debug(`Found token: mint=${mint}, balance=${amount}`);
            }
          } catch (e) {
            logger.error(`Error parsing token account: ${e.message}`);
            continue;
          }
        }

        logger.info(`Successfully retrieved ${tokens.length} token accounts`);
        return tokens;
      };

      return await this.retryRpc(getAccounts);
    } catch (e) {
      logger.error(`Failed to get token accounts: ${e.message}`, e);
      return [];
    }
  }

  isValidAddress(address) {
    try {
      logger.debug(`Validating address: ${address}`);
      const decoded = bs58.decode(address);
      const valid = decoded.length === 32;
      logger.debug(`Address validation result: ${valid}`);
      return valid;
    } catch (e) {
      logger.error(`Address validation failed: ${e.message}`);
      return false;
    }
  }
}

// Export a singleton instance
const solanaClient = new SolanaClient();
module.exports = solanaClient; 