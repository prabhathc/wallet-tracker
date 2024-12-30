from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import aiohttp
import asyncio
from typing import Optional, Dict, List, Any
import logging
import json
import time
import httpx

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helius RPC endpoint
HELIUS_RPC_URL = "https://mainnet.helius-rpc.com/?api-key=c2a055e2-e2f8-453c-94fa-66abad52c463"

async def get_sol_price() -> Optional[float]:
    """Get SOL price with fallback mechanisms"""
    try:
        # Try Jupiter first
        async with aiohttp.ClientSession() as session:
            async with session.get("https://price.jup.ag/v4/price?ids=SOL") as response:
                if response.status == 200:
                    data = await response.json()
                    return float(data["data"]["SOL"]["price"])
    except Exception as e:
        print(f"Jupiter price API error: {e}")
    
    try:
        # Fallback to Coingecko
        async with aiohttp.ClientSession() as session:
            async with session.get("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd") as response:
                if response.status == 200:
                    data = await response.json()
                    return float(data["solana"]["usd"])
    except Exception as e:
        print(f"Coingecko API error: {e}")
    
    return None

async def get_wallet_sol_balance(wallet_address: str) -> Optional[float]:
    """Get wallet's SOL balance"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                HELIUS_RPC_URL,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getBalance",
                    "params": [wallet_address]
                },
                timeout=10
            ) as response:
                if response.status != 200:
                    print(f"Error status: {response.status}")
                    return None
                
                data = await response.json()
                if "error" in data:
                    print(f"RPC error: {data['error']}")
                    return None
                
                if "result" not in data or not isinstance(data["result"], dict) or "value" not in data["result"]:
                    print(f"Invalid response format: {data}")
                    return None
                
                balance = float(data["result"]["value"]) / 1e9
                print(f"Got balance: {balance} SOL")
                return balance
    except Exception as e:
        print(f"Error fetching SOL balance: {e}")
        return None

async def get_token_accounts(wallet_address: str) -> Optional[List[Dict]]:
    """Get all token accounts for a wallet"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                HELIUS_RPC_URL,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getTokenAccountsByOwner",
                    "params": [
                        wallet_address,
                        {
                            "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
                        },
                        {
                            "encoding": "jsonParsed"
                        }
                    ]
                },
                timeout=10
            ) as response:
                if response.status != 200:
                    logger.error(f"Failed to fetch token accounts. Status: {response.status}")
                    return None
                
                data = await response.json()
                if "error" in data:
                    logger.error(f"RPC error in getTokenAccountsByOwner: {json.dumps(data['error'])}")
                    return None
                
                return data.get("result", {}).get("value", [])
    except Exception as e:
        logger.error(f"Error fetching token accounts: {str(e)}", exc_info=True)
        return None

async def get_dexscreener_price(token_address: str) -> Optional[float]:
    """Get token price from DexScreener API"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"https://api.dexscreener.com/latest/dex/tokens/{token_address}", timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    if data.get("pairs") and len(data["pairs"]) > 0:
                        # Get the first pair with USDC or USDT as quote token
                        for pair in data["pairs"]:
                            quote_token = pair.get("quoteToken", {}).get("symbol", "").upper()
                            if quote_token in ["USDC", "USDT"]:
                                price = float(pair.get("priceUsd", 0))
                                logger.info(f"Got price from DexScreener for {token_address}: ${price}")
                                return price
                    logger.warning(f"No valid pairs found for token {token_address}")
                    return None
    except Exception as e:
        logger.error(f"DexScreener API error for {token_address}: {str(e)}")
        return None

async def get_token_prices(token_mints: List[str]) -> Dict[str, float]:
    """Get token prices from Jupiter with better error handling"""
    if not token_mints:
        return {}
    
    try:
        # Add SOL to the token list
        token_mints = ["SOL"] + token_mints
        mint_str = ",".join(token_mints)
        
        async with aiohttp.ClientSession() as session:
            # Try Jupiter API first
            try:
                async with session.get(f"https://price.jup.ag/v4/price?ids={mint_str}", timeout=10) as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info(f"Successfully fetched prices from Jupiter for {len(data.get('data', {}))} tokens")
                        return data.get("data", {})
            except Exception as e:
                logger.error(f"Jupiter API error: {str(e)}")
            
            # Try DexScreener for each token that failed
            prices = {}
            for token in token_mints:
                if token == "SOL":
                    continue  # Skip SOL, we'll handle it with Coingecko
                price = await get_dexscreener_price(token)
                if price:
                    prices[token] = {"price": price}
            
            if prices:
                logger.info(f"Got prices from DexScreener for {len(prices)} tokens")
            
            # Fallback to Coingecko for SOL price
            try:
                async with session.get("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", timeout=10) as response:
                    if response.status == 200:
                        data = await response.json()
                        sol_price = data["solana"]["usd"]
                        logger.info(f"Got SOL price from Coingecko: ${sol_price}")
                        prices["SOL"] = {"price": sol_price}
                        return prices
            except Exception as e:
                logger.error(f"Coingecko API error: {str(e)}")
    except Exception as e:
        logger.error(f"Error fetching token prices: {str(e)}")
    
    # If all else fails, use a hardcoded recent SOL price as fallback
    logger.warning("Using fallback SOL price")
    return {"SOL": {"price": 110.0}}  # Fallback price

async def get_wallet_assets(wallet_address: str) -> Optional[Dict]:
    """Get all assets (NFTs and tokens) owned by the wallet using DAS"""
    try:
        # Get native SOL balance first
        async with aiohttp.ClientSession() as session:
            balance_response = await session.post(
                HELIUS_RPC_URL,
                json={
                    "jsonrpc": "2.0",
                    "id": "balance",
                    "method": "getBalance",
                    "params": [wallet_address]
                }
            )
            balance_data = await balance_response.json()
            sol_balance = float(balance_data.get("result", {}).get("value", 0)) / 1e9
            logger.info(f"Got SOL balance: {sol_balance}")

            # Get token accounts
            token_response = await session.post(
                HELIUS_RPC_URL,
                json={
                    "jsonrpc": "2.0",
                    "id": "token-accounts",
                    "method": "getTokenAccountsByOwner",
                    "params": [
                        wallet_address,
                        {
                            "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
                        },
                        {
                            "encoding": "jsonParsed"
                        }
                    ]
                }
            )
            token_data = await token_response.json()
            token_accounts = token_data.get("result", {}).get("value", [])
            
            # Extract token mints and amounts
            tokens = []
            for account in token_accounts:
                try:
                    token_data = account["account"]["data"]["parsed"]["info"]
                    amount = float(token_data["tokenAmount"]["uiAmountString"])
                    if amount > 0:  # Only include non-zero balances
                        tokens.append({
                            "mint": token_data["mint"],
                            "amount": amount,
                            "decimals": token_data["tokenAmount"]["decimals"],
                            "price": 0,
                            "value_usd": 0
                        })
                except Exception as e:
                    logger.error(f"Error processing token account: {str(e)}")
                    continue
            
            # Try to get token prices, but don't fail if we can't
            try:
                if tokens:
                    mint_list = [token["mint"] for token in tokens]
                    mint_str = ",".join(mint_list)
                    price_response = await session.get(f"https://price.jup.ag/v4/price?ids={mint_str}")
                    if price_response.status == 200:
                        price_data = await price_response.json()
                        prices = price_data.get("data", {})
                        
                        # Update tokens with prices
                        for token in tokens:
                            price_info = prices.get(token["mint"])
                            if price_info:
                                token["price"] = price_info.get("price", 0)
                                token["value_usd"] = token["amount"] * token["price"]
            except Exception as e:
                logger.error(f"Error fetching token prices: {str(e)}")
                # Continue without prices
            
            return {
                "nativeBalance": {"lamports": balance_data.get("result", {}).get("value", 0)},
                "tokens": tokens
            }
    except Exception as e:
        logger.error(f"Error fetching assets: {str(e)}", exc_info=True)
        return None

def format_transaction(tx: Dict, wallet_address: str) -> Optional[Dict]:
    """Format a single transaction with essential data only"""
    try:
        # Base transaction info
        formatted_tx = {
            "signature": tx.get("signature", ""),
            "type": tx.get("type", "UNKNOWN"),
            "description": tx.get("description", ""),
            "fee": float(tx.get("fee", 0)) / 1e9 if tx.get("fee") is not None else None,
            "block_time": tx.get("timestamp", 0),
            "from": None,
            "to": None,
            "amount": None,
            "source": None,
            "status": tx.get("status", "Success"),
            "error": tx.get("error"),
            "program": tx.get("source", "UNKNOWN"),
            "direction": "unknown"
        }

        # Handle native transfers (SOL)
        if tx.get("nativeTransfers"):
            transfer = tx["nativeTransfers"][0]
            amount = float(transfer.get("amount", 0)) / 1e9
            from_addr = transfer.get("fromUserAccount")
            to_addr = transfer.get("toUserAccount")
            
            # Determine transfer direction
            if from_addr == wallet_address:
                direction = "out"
                description = f"Sent {amount:.4f} SOL"
            elif to_addr == wallet_address:
                direction = "in"
                description = f"Received {amount:.4f} SOL"
            else:
                direction = "unknown"
                description = f"Transferred {amount:.4f} SOL"

            formatted_tx.update({
                "type": "TRANSFER",
                "source": "SYSTEM_PROGRAM",
                "from": from_addr,
                "to": to_addr,
                "amount": amount,
                "description": description,
                "direction": direction,
                "token_type": "SOL",
                "decimals": 9
            })
            return formatted_tx

        # Handle token transfers
        if tx.get("tokenTransfers"):
            transfer = tx["tokenTransfers"][0]
            amount = float(transfer.get("tokenAmount", 0))
            from_addr = transfer.get("fromUserAccount")
            to_addr = transfer.get("toUserAccount")
            symbol = transfer.get("symbol", "Unknown")

            # Determine transfer direction
            if from_addr == wallet_address:
                direction = "out"
                description = f"Sent {amount} {symbol}"
            elif to_addr == wallet_address:
                direction = "in"
                description = f"Received {amount} {symbol}"
            else:
                direction = "unknown"
                description = f"Transferred {amount} {symbol}"

            formatted_tx.update({
                "type": "TOKEN_TRANSFER",
                "source": "SOLANA_PROGRAM_LIBRARY",
                "from": from_addr,
                "to": to_addr,
                "amount": amount,
                "token_symbol": symbol,
                "mint": transfer.get("mint"),
                "description": description,
                "direction": direction,
                "decimals": transfer.get("decimals")
            })
            return formatted_tx

        # Handle NFT events
        if tx.get("events", {}).get("nft"):
            nft = tx["events"]["nft"]
            nft_type = nft.get("type", "NFT_TRANSACTION").upper()
            from_addr = nft.get("seller") or nft.get("authority")
            to_addr = nft.get("buyer")
            
            # Determine NFT transaction direction
            if from_addr == wallet_address:
                direction = "out"
            elif to_addr == wallet_address:
                direction = "in"
            else:
                direction = "unknown"

            formatted_tx.update({
                "type": nft_type,
                "source": nft.get("source", "UNKNOWN"),
                "description": nft.get("description", "NFT Transaction"),
                "from": from_addr,
                "to": to_addr,
                "amount": float(nft.get("amount", 0)) / 1e9 if nft.get("amount") is not None else None,
                "direction": direction,
                "collection": nft.get("collection"),
                "name": nft.get("name"),
                "image": nft.get("image"),
                "marketplace": nft.get("source")
            })
            return formatted_tx

        # Handle swap events with detailed info
        if tx.get("events", {}).get("swap"):
            swap = tx["events"]["swap"]
            
            # Initialize swap details
            swap_in = {"amount": 0, "token": "Unknown", "value_usd": None}
            swap_out = {"amount": 0, "token": "Unknown", "value_usd": None}
            
            # Handle native SOL input/output
            if swap.get("nativeInput"):
                swap_in = {
                    "amount": float(swap["nativeInput"].get("amount", 0)) / 1e9,
                    "token": "SOL",
                    "value_usd": float(swap["nativeInput"].get("usdValue", 0))
                }
            elif swap.get("tokenInputs"):
                token_in = swap["tokenInputs"][0]
                swap_in = {
                    "amount": float(token_in.get("amount", 0)),
                    "token": token_in.get("symbol", "Unknown"),
                    "value_usd": float(token_in.get("usdValue", 0))
                }

            if swap.get("nativeOutput"):
                swap_out = {
                    "amount": float(swap["nativeOutput"].get("amount", 0)) / 1e9,
                    "token": "SOL",
                    "value_usd": float(swap["nativeOutput"].get("usdValue", 0))
                }
            elif swap.get("tokenOutputs"):
                token_out = swap["tokenOutputs"][0]
                swap_out = {
                    "amount": float(token_out.get("amount", 0)),
                    "token": token_out.get("symbol", "Unknown"),
                    "value_usd": float(token_out.get("usdValue", 0))
                }

            description = f"Swap: {swap_in['amount']:.4f} {swap_in['token']} → {swap_out['amount']:.4f} {swap_out['token']}"
            if swap_in['value_usd'] and swap_out['value_usd']:
                description += f" (${swap_in['value_usd']:.2f} → ${swap_out['value_usd']:.2f})"

            formatted_tx.update({
                "type": "SWAP",
                "source": swap.get("source", "UNKNOWN"),
                "description": description,
                "direction": "swap",
                "input": swap_in,
                "output": swap_out,
                "dex": swap.get("source"),
                "price_impact": swap.get("priceImpact")
            })
            return formatted_tx

        return formatted_tx

    except Exception as e:
        logger.error(f"Error formatting transaction: {str(e)}", exc_info=True)
        return None

async def get_transaction_signatures(wallet_address: str, days: int = 1) -> Optional[List[str]]:
    """Get transaction signatures for the wallet within the specified time window"""
    start_time = time.time()
    logger.info(f"Fetching {days}d signatures for wallet: {wallet_address}")
    
    try:
        # Calculate until timestamp (now - days)
        until = int(time.time() - (days * 24 * 60 * 60))
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                HELIUS_RPC_URL,
                json={
                    "jsonrpc": "2.0",
                    "id": "1",
                    "method": "getSignaturesForAddress",
                    "params": [
                        wallet_address,
                        {
                            "limit": 1000,  # Increased limit to get more history
                        }
                    ]
                },
                timeout=10
            ) as response:
                if response.status != 200:
                    logger.error(f"Failed to fetch signatures. Status: {response.status}")
                    return None
                
                data = await response.json()
                if "error" in data:
                    logger.error(f"RPC error in getSignaturesForAddress: {json.dumps(data['error'])}")
                    return None
                
                signatures = [tx["signature"] for tx in data["result"]]
                duration = time.time() - start_time
                logger.info(f"Successfully fetched {len(signatures)} signatures in {duration:.2f}s")
                return signatures
    except Exception as e:
        logger.error(f"Error fetching signatures: {str(e)}", exc_info=True)
        return None

def calculate_historical_balances(transactions: List[Dict], current_balance: float, wallet_address: str) -> List[Dict]:
    """Calculate historical balances working backwards from current balance"""
    logger.info(f"Calculating historical balances for {wallet_address} starting from {current_balance} SOL")
    
    # Sort transactions by timestamp descending (newest first)
    sorted_txs = sorted(transactions, key=lambda x: x.get("timestamp", 0), reverse=True)
    
    balance_points = []
    running_balance = current_balance
    
    # Process transactions in reverse chronological order
    for tx in sorted_txs:
        if not tx.get("nativeTransfers"):
            continue
            
        # Handle native SOL transfers
        for transfer in tx["nativeTransfers"]:
            amount = float(transfer.get("amount", 0)) / 1e9
            from_account = transfer.get("fromUserAccount")
            to_account = transfer.get("toUserAccount")
            
            # Only process transfers that affect our wallet
            if from_account == wallet_address:
                # We sent SOL, so add it back (working backwards)
                running_balance += amount
                if tx.get("fee"):
                    running_balance += float(tx["fee"]) / 1e9
                logger.debug(f"Sent {amount} SOL, balance was {running_balance}")
            elif to_account == wallet_address:
                # We received SOL, so subtract it (working backwards)
                running_balance -= amount
                logger.debug(f"Received {amount} SOL, balance was {running_balance}")
            
            # Add balance point
            balance_points.append({
                "timestamp": tx.get("timestamp", 0),
                "balance": running_balance
            })
    
    # Add final (earliest) balance point
    balance_points.append({
        "timestamp": sorted_txs[-1].get("timestamp", 0) if sorted_txs else int(time.time()),
        "balance": running_balance
    })
    
    # Sort by timestamp ascending for display
    balance_points.sort(key=lambda x: x["timestamp"])
    logger.info(f"Generated {len(balance_points)} balance points")
    return balance_points

async def get_enhanced_transactions(signatures: List[str]) -> Optional[List[Dict]]:
    """Get enhanced transaction data from Helius"""
    if not signatures:
        logger.info("No signatures provided for enhanced transactions")
        return []
    
    start_time = time.time()
    logger.info(f"Fetching enhanced data for {len(signatures)} transactions")
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.helius.xyz/v0/transactions?api-key=c2a055e2-e2f8-453c-94fa-66abad52c463",
                json={"transactions": signatures[0:100]},
                timeout=30  # Increased timeout
            ) as response:
                if response.status != 200:
                    logger.error(f"Failed to fetch enhanced transactions. Status: {response.status}")
                    response_text = await response.text()
                    logger.error(f"Response: {response_text}")
                    return None
                
                data = await response.json()
                if not data:
                    logger.error("Empty response from Helius API")
                    return None
                
                duration = time.time() - start_time
                logger.info(f"Successfully fetched enhanced data for {len(data)} transactions in {duration:.2f}s")
                return data
    except asyncio.TimeoutError:
        logger.error(f"Timeout fetching enhanced transactions after {time.time() - start_time:.2f}s")
        return None
    except Exception as e:
        logger.error(f"Error fetching enhanced transactions: {str(e)}", exc_info=True)
        return None

async def get_transactions(client: httpx.AsyncClient, address: str) -> List[Dict[str, Any]]:
    """Get recent transactions for a wallet using Helius API."""
    try:
        # Get transaction signatures
        logger.info(f"Fetching transaction signatures for {address}")
        response = await client.post(
            HELIUS_RPC_URL,
            json={
                "jsonrpc": "2.0",
                "id": "my-id",
                "method": "getSignaturesForAddress",
                "params": [address, {"limit": 20}]
            },
            timeout=10.0
        )
        data = response.json()
        if "result" not in data:
            logger.error(f"No result in signature response: {data}")
            return []
        
        signatures = [tx["signature"] for tx in data["result"]]
        logger.info(f"Found {len(signatures)} signatures")
        
        # Get enriched transaction data
        logger.info("Fetching enriched transaction data")
        tx_response = await client.post(
            HELIUS_RPC_URL,
            json={
                "jsonrpc": "2.0",
                "id": "my-id",
                "method": "getEnrichedTransactions",
                "params": [signatures]
            },
            timeout=10.0
        )
        tx_data = tx_response.json()
        if "result" not in tx_data:
            logger.error(f"No result in transaction response: {tx_data}")
            return []
        
        # Format and sort transactions by timestamp descending (most recent first)
        transactions = []
        for tx in tx_data["result"]:
            formatted_tx = format_transaction(tx)
            if formatted_tx:
                transactions.append(formatted_tx)
        
        transactions.sort(key=lambda x: x["block_time"], reverse=True)
        logger.info(f"Successfully processed {len(transactions)} transactions")
        return transactions
    except Exception as e:
        logger.error(f"Error getting transactions: {e}")
        return []

@app.get("/api/wallet/{wallet_address}")
async def get_wallet_data(wallet_address: str, days: int = 1):
    """Get wallet data including assets and transactions for specified time window"""
    if days not in [1, 3, 5, 10, 30]:
        days = 1  # Default to 1 day if invalid
    
    start_time = time.time()
    logger.info(f"Processing {days}d request for wallet: {wallet_address}")
    
    response = {
        "wallet": {
            "address": wallet_address,
            "sol_balance": None,
            "sol_usd_value": None,
            "total_usd_value": 0,
            "tokens": [],
            "balance_history": []
        },
        "transactions": None,
        "errors": []
    }
    
    # Get assets including SOL balance and tokens
    assets_data = await get_wallet_assets(wallet_address)
    if assets_data:
        # Process native SOL balance
        if "nativeBalance" in assets_data:
            try:
                sol_balance = float(assets_data["nativeBalance"]["lamports"]) / 1e9
                response["wallet"]["sol_balance"] = sol_balance
                logger.info(f"Got SOL balance: {sol_balance}")
                
                # Try to get SOL price and calculate USD value
                try:
                    token_prices = await get_token_prices(["SOL"])
                    if "SOL" in token_prices:
                        sol_usd_value = sol_balance * token_prices["SOL"]["price"]
                        response["wallet"]["sol_usd_value"] = sol_usd_value
                        response["wallet"]["total_usd_value"] = sol_usd_value
                except Exception as e:
                    logger.error(f"Error getting SOL price: {str(e)}")
            except Exception as e:
                logger.error(f"Error processing native balance: {str(e)}")
        
        # Process tokens
        if "tokens" in assets_data:
            for token in assets_data["tokens"]:
                token_info = {
                    "mint": token["mint"],
                    "amount": token["amount"],
                    "decimals": token["decimals"],
                    "price_usd": token.get("price", 0),
                    "value_usd": token.get("value_usd", 0)
                }
                response["wallet"]["tokens"].append(token_info)
                response["wallet"]["total_usd_value"] += token_info["value_usd"]
            
            logger.info(f"Processed {len(assets_data['tokens'])} tokens")
    else:
        logger.error("Failed to fetch wallet assets")
        response["errors"].append("Failed to fetch wallet assets")
    
    # Get transactions for the specified time window
    try:
        signatures = await get_transaction_signatures(wallet_address, days)
        if signatures:
            transactions = await get_enhanced_transactions(signatures)
            if transactions:
                # Calculate historical balances
                balance_history = calculate_historical_balances(
                    transactions,
                    response["wallet"]["sol_balance"] or 0,
                    wallet_address
                )
                response["wallet"]["balance_history"] = balance_history
                
                # Format transactions for display
                formatted_transactions = []
                seen_signatures = set()
                
                # Sort by timestamp descending for recent first
                sorted_txs = sorted(transactions, key=lambda x: x.get("timestamp", 0), reverse=True)
                
                for tx in sorted_txs:
                    if tx["signature"] not in seen_signatures:
                        formatted_tx = format_transaction(tx, wallet_address)
                        if formatted_tx:
                            formatted_transactions.append(formatted_tx)
                            seen_signatures.add(tx["signature"])
                
                response["transactions"] = formatted_transactions
                logger.info(f"Successfully formatted {len(formatted_transactions)} transactions")
            else:
                logger.error("Failed to fetch transaction details")
                response["errors"].append("Failed to fetch transaction details")
        else:
            logger.error("Failed to fetch transaction signatures")
            response["errors"].append("Failed to fetch transaction signatures")
    except Exception as e:
        logger.error(f"Error processing transactions: {str(e)}", exc_info=True)
        response["errors"].append(f"Error processing transactions: {str(e)}")
    
    duration = time.time() - start_time
    logger.info(f"Request completed in {duration:.2f}s with {len(response['errors'])} errors")
    return response

