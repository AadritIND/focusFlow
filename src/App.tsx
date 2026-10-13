import { Link, Route, Routes } from 'react-router-dom';
import { LandingPage } from './pages/Landing';
import { RoomPage } from './pages/Room';
import { ToastProvider } from './components/ui';
import { Ambience } from './components/Ambience';
import { applyMotionPreference, applyTheme, useModeBackground } from './lib/theme';
import { loadPrefs } from './lib/device';
import { Mark } from './components/icons';

// Apply the stored theme before the first paint of any route.
const initialPrefs = loadPrefs();
applyTheme(initialPrefs.theme);
applyMotionPreference(initialPrefs.reduceMotion);

export default function App() {
  return (
    <ToastProvider>
      <Ambience />
      <div className="app-layer">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/r/:code" element={<RoomPage />} />
          <Route path="/join" element={<LandingPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </ToastProvider>
  );
}

function NotFound() {
  useModeBackground('home');
  return (
    <div className="wrap">
      <header className="site-header" style={{ borderBottom: 0 }}>
        <div className="site-nav">
          <Link to="/" className="brand">
            <span className="mark" style={{ color: 'var(--accent)' }}>
              <Mark size={26} />
            </span>
            FocusFlow
          </Link>
        </div>
      </header>
      <div className="center-page">
        <div>
          <span className="label">404</span>
          <h1 className="serif" style={{ fontSize: 32, fontWeight: 500, marginTop: 8 }}>
            Nothing here
          </h1>
          <p className="lead" style={{ marginTop: 10 }}>
            The page you asked for does not exist. Rooms live at <span className="num">/r/YOUR-CODE</span>.
          </p>
          <div className="row" style={{ gap: 10, marginTop: 18, justifyContent: 'center' }}>
            <Link className="btn primary lg" to="/">
              Back to the home page
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
