import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { CreatePollPage } from './pages/CreatePollPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ResultsPage } from './pages/ResultsPage';
import { VotePage } from './pages/VotePage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CreatePollPage />} />
        <Route path="/poll/:id" element={<VotePage />} />
        <Route path="/poll/:id/results" element={<ResultsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
