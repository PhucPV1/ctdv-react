import { ThemeProvider } from '@mui/material/styles';
import Ctdv from './components/ctdv';
import { theme } from './theme';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <Ctdv />
    </ThemeProvider>
  );
}

export default App;
