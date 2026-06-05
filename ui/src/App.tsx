import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { DlqPage } from './pages/DlqPage';
import { TargetSystemsPage } from './pages/TargetSystemsPage';

function App() {
  return (
    <BrowserRouter>
      <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc' }}>
        <Link to="/" style={{ marginRight: '1rem' }}>DLQ</Link>
        <Link to="/target-systems">Target Systems</Link>
      </nav>
      <Routes>
        <Route path="/" element={<DlqPage />} />
        <Route path="/target-systems" element={<TargetSystemsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
