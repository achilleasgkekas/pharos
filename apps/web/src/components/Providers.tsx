'use client';
import { ThemeProvider } from './ThemeProvider';
import { ConfirmProvider } from './ui/ConfirmDialog';
import { JobsProvider } from './JobsProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ConfirmProvider>
        <JobsProvider>{children}</JobsProvider>
      </ConfirmProvider>
    </ThemeProvider>
  );
}
