import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  TrendingUp,
  Sun,
  Moon,
  Rss,
  BarChart3,
  Trophy,
} from 'lucide-react';
import { useTheme } from './ThemeProvider';
import BlurToggle from './BlurToggle';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { theme, toggleTheme } = useTheme();

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[18px] font-medium transition-colors duration-200 cursor-pointer ${
      isActive
        ? 'bg-cta/10 text-cta'
        : 'text-text-muted hover:bg-hover hover:text-text'
    }`;

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Sidebar */}
      <aside className="w-64 bg-surface border-r border-border flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-center justify-between">
            <NavLink to="/xv" className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-cta rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-lg font-semibold text-text">OneRich</h1>
            </NavLink>
            <div className="flex items-center gap-1">
              <BlurToggle />
              <button
                onClick={toggleTheme}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:bg-hover hover:text-text transition-colors duration-200 cursor-pointer"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <NavLink to="/xv" className={navLinkClass}>
            <Rss className="w-4.5 h-4.5" />
            X-V
          </NavLink>

          <NavLink to="/sa" className={navLinkClass}>
            <BarChart3 className="w-4.5 h-4.5" />
            S-A
          </NavLink>

          <NavLink to="/or" className={navLinkClass}>
            <Trophy className="w-4.5 h-4.5" />
            O-R
          </NavLink>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
