# Solana Wallet Tracker Backend

A Python-based backend service for tracking Solana wallet balances and token holdings.

## Features

- Fetch SOL balance for any Solana wallet address
- Retrieve all SPL token balances for a wallet
- Automatic RPC endpoint failover
- Response caching for improved performance
- CORS support for frontend integration
- Input validation and error handling

## Setup

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the development server:
```bash
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`

## API Endpoints

### Health Check
```
GET /
```
Returns the service status.

### Get Wallet Balance
```
GET /api/wallet/{address}
```
Returns the SOL balance and token holdings for a given wallet address.

Example response:
```json
{
  "address": "eZaopghAvKW2kE5SRCbaYej",
  "sol_balance": 1.5,
  "tokens": [
    {
      "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "balance": 100.0,
      "decimals": 6
    }
  ]
}
```

## Error Handling

The API returns appropriate HTTP status codes and error messages:

- 400: Invalid wallet address or RPC error
- 500: Internal server error

## Development

The backend is built with:

- FastAPI for the web framework
- solana-py for Solana blockchain interaction
- cachetools for response caching
- pydantic for data validation

## Production Deployment

For production deployment:

1. Update CORS settings in `main.py` to allow only specific origins
2. Use environment variables for configuration
3. Set up proper logging
4. Consider using a production-grade ASGI server like Gunicorn with Uvicorn workers
5. Set up monitoring and rate limiting
