import { createContext, useContext, useState, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface BlurContextValue {
  blurNumbers: boolean;
  setBlurNumbers: (v: boolean) => void;
}

const BlurContext = createContext<BlurContextValue>({
  blurNumbers: false,
  setBlurNumbers: () => {},
});

export function useBlur() {
  return useContext(BlurContext);
}

const STORAGE_KEY = 'blurNumbers';

export function BlurProvider({ children }: { children: ReactNode }) {
  const [blurNumbers, setBlurNumbersState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'true';
    } catch {
      return false;
    }
  });

  const setBlurNumbers = (v: boolean) => {
    setBlurNumbersState(v);
    try {
      localStorage.setItem(STORAGE_KEY, String(v));
    } catch {
      // ignore storage errors
    }
  };

  return (
    <BlurContext.Provider value={{ blurNumbers, setBlurNumbers }}>
      {children}
    </BlurContext.Provider>
  );
}

export default function BlurToggle() {
  const { blurNumbers, setBlurNumbers } = useBlur();

  return (
    <button
      onClick={() => setBlurNumbers(!blurNumbers)}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:bg-hover hover:text-text transition-colors duration-200 cursor-pointer"
      aria-label={blurNumbers ? 'Show numbers' : 'Hide numbers'}
      title={blurNumbers ? 'Show numbers' : 'Hide numbers'}
    >
      {blurNumbers ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
    </button>
  );
}
