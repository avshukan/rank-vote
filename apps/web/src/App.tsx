import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { CreatePollPage } from './pages/CreatePollPage';
import { VotePage } from './pages/VotePage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CreatePollPage />} />
        <Route path="/poll/:id" element={<VotePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
