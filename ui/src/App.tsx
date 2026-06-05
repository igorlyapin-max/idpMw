import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DlqPage } from './pages/DlqPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DlqPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
