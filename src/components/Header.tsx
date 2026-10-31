import React from 'react';
import { Sprout, Sun, Moon, Play } from 'lucide-react';

interface HeaderProps {
  activeTab: 'monitor' | 'simulation' | 'sandbox' | 'architecture' | 'tests';
  onSelectTab: (tab: 'monitor' | 'simulation' | 'sandbox' | 'architecture' | 'tests') => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onQuickSimulate: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  darkMode,
  onToggleDarkMode,
  onQuickSimulate,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md border-b border-stone-200 dark:border-stone-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-emerald-700 dark:bg-emerald-600 flex items-center justify-center text-white shadow-sm">
            <Sprout className="w-5 h-5" />
          </div>
          <button
            onClick={() => onSelectTab('monitor')}
            className="text-left group cursor-pointer"
          >
            <span className="text-lg font-bold tracking-tight text-stone-900 dark:text-stone-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors whitespace-nowrap">
              PRISM Precision Irrigation
            </span>
          </button>
        </div>

        {/* Zone 2: Single-line Text Navigation Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-stone-600 dark:text-stone-300">
          <button
            onClick={() => onSelectTab('monitor')}
            className={`whitespace-nowrap shrink-0 transition-colors pb-1 border-b-2 cursor-pointer ${
              activeTab === 'monitor'
                ? 'border-emerald-600 text-emerald-800 dark:text-emerald-400 font-semibold'
                : 'border-transparent hover:text-stone-900 dark:hover:text-stone-100 hover:border-stone-300 dark:hover:border-stone-700'
            }`}
          >
            Field Monitor
          </button>
          <button
            onClick={() => onSelectTab('simulation')}
            className={`whitespace-nowrap shrink-0 transition-colors pb-1 border-b-2 cursor-pointer ${
              activeTab === 'simulation'
                ? 'border-emerald-600 text-emerald-800 dark:text-emerald-400 font-semibold'
                : 'border-transparent hover:text-stone-900 dark:hover:text-stone-100 hover:border-stone-300 dark:hover:border-stone-700'
            }`}
          >
            7-Day Simulation
          </button>
          <button
            onClick={() => onSelectTab('sandbox')}
            className={`whitespace-nowrap shrink-0 transition-colors pb-1 border-b-2 cursor-pointer ${
              activeTab === 'sandbox'
                ? 'border-emerald-600 text-emerald-800 dark:text-emerald-400 font-semibold'
                : 'border-transparent hover:text-stone-900 dark:hover:text-stone-100 hover:border-stone-300 dark:hover:border-stone-700'
            }`}
          >
            Rule Sandbox (R0-R10)
          </button>
          <button
            onClick={() => onSelectTab('architecture')}
            className={`whitespace-nowrap shrink-0 transition-colors pb-1 border-b-2 cursor-pointer ${
              activeTab === 'architecture'
                ? 'border-emerald-600 text-emerald-800 dark:text-emerald-400 font-semibold'
                : 'border-transparent hover:text-stone-900 dark:hover:text-stone-100 hover:border-stone-300 dark:hover:border-stone-700'
            }`}
          >
            ESP32 Architecture
          </button>
          <button
            onClick={() => onSelectTab('tests')}
            className={`whitespace-nowrap shrink-0 transition-colors pb-1 border-b-2 cursor-pointer ${
              activeTab === 'tests'
                ? 'border-emerald-600 text-emerald-800 dark:text-emerald-400 font-semibold'
                : 'border-transparent hover:text-stone-900 dark:hover:text-stone-100 hover:border-stone-300 dark:hover:border-stone-700'
            }`}
          >
            Unit Tests (10/10)
          </button>
        </nav>

        {/* Zone 3: Primary Action & Theme Toggle */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onToggleDarkMode}
            className="p-2 text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            title="Toggle theme"
            aria-label="Toggle light or dark theme"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={onQuickSimulate}
            className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg shadow-sm transition-colors cursor-pointer whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run 7-Day Lab</span>
          </button>
        </div>
      </div>

      {/* Mobile nav drawer / scrollbar */}
      <div className="md:hidden flex overflow-x-auto px-4 py-2 gap-4 border-t border-stone-200 dark:border-stone-800 text-xs font-medium">
        <button
          onClick={() => onSelectTab('monitor')}
          className={`whitespace-nowrap ${activeTab === 'monitor' ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-stone-600 dark:text-stone-400'}`}
        >
          Field Monitor
        </button>
        <button
          onClick={() => onSelectTab('simulation')}
          className={`whitespace-nowrap ${activeTab === 'simulation' ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-stone-600 dark:text-stone-400'}`}
        >
          7-Day Simulation
        </button>
        <button
          onClick={() => onSelectTab('sandbox')}
          className={`whitespace-nowrap ${activeTab === 'sandbox' ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-stone-600 dark:text-stone-400'}`}
        >
          Rule Sandbox
        </button>
        <button
          onClick={() => onSelectTab('architecture')}
          className={`whitespace-nowrap ${activeTab === 'architecture' ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-stone-600 dark:text-stone-400'}`}
        >
          Architecture
        </button>
        <button
          onClick={() => onSelectTab('tests')}
          className={`whitespace-nowrap ${activeTab === 'tests' ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-stone-600 dark:text-stone-400'}`}
        >
          Unit Tests
        </button>
      </div>
    </header>
  );
};
