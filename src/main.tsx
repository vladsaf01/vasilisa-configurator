import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Не найден #root');
createRoot(container).render(<App />);
