import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@excalidraw/excalidraw/index.css';
import './styles/app.css';
import { App } from './App';
createRoot(document.getElementById('root')!).render(<App/>);
