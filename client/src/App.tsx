import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import XV from './pages/XV';
import SA from './pages/SA';
import OR from './pages/OR';
import { ThemeProvider } from './components/ThemeProvider';
import { BlurProvider } from './components/BlurToggle';

export default function App() {
  return (
    <ThemeProvider>
      <BlurProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/xv" element={<XV />} />
              <Route path="/sa" element={<SA />} />
              <Route path="/or" element={<OR />} />
              <Route path="*" element={<Navigate to="/xv" replace />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </BlurProvider>
    </ThemeProvider>
  );
}
