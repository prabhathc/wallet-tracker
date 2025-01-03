import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useState } from 'react';
import TransactionItem, { Transaction } from './TransactionItem';

interface BalancePoint {
  date: number;
  solValue: number;
  usdValue: number;
  hasTransaction: boolean;
}

interface DataViewportProps {
  data: {
    balanceHistory: BalancePoint[];
    transactions: Transaction[];
  };
  onTimeWindowChange?: (days: number) => void;
}

interface TimeWindow {
  label: string;
  value: number;
}

const TIME_WINDOWS: TimeWindow[] = [
  { label: '1D', value: 1 },
  { label: '3D', value: 3 },
  { label: '5D', value: 5 },
  { label: '10D', value: 10 },
  { label: 'ALL', value: 30 },
];

const DataViewport: React.FC<DataViewportProps> = ({ data, onTimeWindowChange }) => {
  const [selectedTimeWindow, setSelectedTimeWindow] = useState(TIME_WINDOWS[0]);
  const [showUSDValue, setShowUSDValue] = useState(false);

  if (!data?.balanceHistory?.length) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <p className="text-[#9CA3AF] text-sm">No balance data available</p>
      </div>
    );
  }

  const handleTimeWindowChange = (days: number) => {
    setSelectedTimeWindow(TIME_WINDOWS.find(window => window.value === days) || TIME_WINDOWS[0]);
    onTimeWindowChange?.(days);
  };

  const filteredData = data.balanceHistory
    .sort((a, b) => a.date - b.date)
    .filter(point => {
      if (selectedTimeWindow.value === 30) return true;
      const cutoff = Date.now() - (selectedTimeWindow.value * 24 * 60 * 60 * 1000);
      return point.date >= cutoff;
    });

  // Ensure we have at least two data points and interpolate if needed
  const processedData = (() => {
    if (filteredData.length === 0) return [];
    if (filteredData.length === 1) {
      // If only one point, duplicate it to show a flat line
      return [
        filteredData[0],
        { ...filteredData[0], date: Date.now() }
      ];
    }

    // Fill gaps between data points
    const result = [];
    for (let i = 0; i < filteredData.length - 1; i++) {
      const current = filteredData[i];
      const next = filteredData[i + 1];
      result.push(current);

      // If gap is more than 2 hours, add interpolated point
      if (next.date - current.date > 2 * 60 * 60 * 1000) {
        const interpolated = {
          date: current.date + (next.date - current.date) / 2,
          solValue: (current.solValue + next.solValue) / 2,
          usdValue: (current.usdValue + next.usdValue) / 2,
          hasTransaction: false
        };
        result.push(interpolated);
      }
    }
    result.push(filteredData[filteredData.length - 1]);
    return result;
  })();

  return (
    <div className="flex flex-col h-full gap-6">
      <div className="bg-[#151926]/50 backdrop-blur-xl rounded-xl border border-[#1E2233]/50 p-4">
        {/* Chart Controls */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-2">
            {TIME_WINDOWS.map(window => (
              <button
                key={window.value}
                onClick={() => handleTimeWindowChange(window.value)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors
                  ${selectedTimeWindow.value === window.value
                    ? 'bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/20'
                    : 'text-[#9CA3AF] hover:text-white'
                  }`}
              >
                {window.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowUSDValue(!showUSDValue)}
            className="text-xs font-medium text-[#9CA3AF] hover:text-white transition-colors"
          >
            {showUSDValue ? 'Show SOL' : 'Show USD'}
          </button>
        </div>

        {/* Chart */}
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart 
              data={processedData}
              margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(timestamp) => {
                  return new Date(timestamp).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                  });
                }}
                stroke="#4B5563"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                minTickGap={50}
                dy={10}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload?.[0]?.payload) {
                    const data = payload[0].payload as BalancePoint;
                    const value = showUSDValue ? data.usdValue : data.solValue;

                    return (
                      <div className="bg-[#151926] p-3 rounded-lg border border-[#1E2233] shadow-xl">
                        <p className="text-[#9CA3AF] text-xs mb-1">
                          {new Date(data.date).toLocaleString()}
                        </p>
                        <p className="text-white text-sm font-medium">
                          {showUSDValue ? '$' : ''}
                          {value.toLocaleString('en-US', {
                            minimumFractionDigits: showUSDValue ? 2 : 4,
                            maximumFractionDigits: showUSDValue ? 2 : 4
                          })}
                          {!showUSDValue ? ' SOL' : ''}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey={showUSDValue ? 'usdValue' : 'solValue'}
                stroke="#3B82F6"
                strokeWidth={1.5}
                fill="url(#colorValue)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Transactions */}
      <div className="bg-[#151926]/50 backdrop-blur-xl rounded-xl overflow-hidden border border-[#1E2233]/50">
        <div className="px-4 py-3 border-b border-[#1E2233]/50">
          <h2 className="text-sm font-medium">Recent Transactions</h2>
        </div>
        <div className="divide-y divide-[#1E2233]/50 max-h-[400px] overflow-y-auto">
          {data.transactions?.map(transaction => (
            <TransactionItem 
              key={transaction.signature} 
              transaction={transaction}
              showRunningBalance
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default DataViewport;
