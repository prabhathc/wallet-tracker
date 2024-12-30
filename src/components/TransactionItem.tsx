import {
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  Image,
  Tag,
  Ban,
  Gavel,
  Plus,
  HelpCircle,
} from 'lucide-react';

export interface Transaction {
  signature: string;
  type: string;
  description: string;
  block_time: number;
  fee: number | null;
  from: string | null;
  to: string | null;
  amount: number | null;
  direction: 'in' | 'out' | 'swap' | 'unknown';
  token_symbol?: string;
  running_balance?: number | null;
  token_info?: {
    mint: string;
    amount: number;
    decimals: number;
  };
}

// Helper functions
const getTransactionIcon = (type: string, direction: string) => {
  if (type === 'TRANSFER' || type === 'TOKEN_TRANSFER') {
    return direction === 'in' ? ArrowDownCircle : 
           direction === 'out' ? ArrowUpCircle : 
           RefreshCw;
  }

  switch (type) {
    case 'SWAP': return RefreshCw;
    case 'NFT_SALE':
    case 'NFT_TRANSACTION': return Image;
    case 'NFT_LISTING': return Tag;
    case 'NFT_CANCEL_LISTING': return Ban;
    case 'NFT_BID': return Gavel;
    case 'NFT_MINT': return Plus;
    default: return HelpCircle;
  }
};

const getTransactionColor = (direction: string) => {
  switch (direction) {
    case 'in': return 'text-emerald-500';
    case 'out': return 'text-red-500';
    case 'swap': return 'text-blue-500';
    default: return 'text-gray-500';
  }
};

interface TransactionItemProps {
  transaction: Transaction;
  showRunningBalance?: boolean;
}

const TransactionItem: React.FC<TransactionItemProps> = ({ 
  transaction,
  showRunningBalance = false
}) => {
  const Icon = getTransactionIcon(transaction.type, transaction.direction);
  const colorClass = getTransactionColor(transaction.direction);
  
  return (
    <div className="px-4 py-3 hover:bg-[#1E2233]/20 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${colorClass.replace('text-', 'bg-')}/10`}>
            <Icon className={`w-4 h-4 ${colorClass}`} strokeWidth={2} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {transaction.description}
              </span>
              <span className="text-xs text-[#9CA3AF]">
                {new Date(transaction.block_time * 1000).toLocaleString()}
              </span>
            </div>
            <div className="text-xs text-[#9CA3AF] mt-1">
              {transaction.from && (
                <div className="flex items-center gap-1">
                  <span className="text-[#6B7280]">From:</span>
                  <span className="font-mono">{transaction.from}</span>
                </div>
              )}
              {transaction.to && (
                <div className="flex items-center gap-1">
                  <span className="text-[#6B7280]">To:</span>
                  <span className="font-mono">{transaction.to}</span>
                </div>
              )}
              {transaction.fee !== null && (
                <div className="flex items-center gap-1">
                  <span className="text-[#6B7280]">Fee:</span>
                  <span>{transaction.fee} SOL</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-sm font-medium ${colorClass}`}>
            {transaction.amount !== null && (
              <>
                {transaction.direction === 'out' && '-'}
                {transaction.amount} {transaction.token_symbol || 'SOL'}
              </>
            )}
          </div>
          {showRunningBalance && transaction.running_balance != null && (
            <div className="text-xs text-[#9CA3AF] mt-0.5">
              Balance: {transaction.running_balance.toLocaleString('en-US', {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4
              })} SOL
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransactionItem; 