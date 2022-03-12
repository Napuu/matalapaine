import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query'
import Map from './Map';
function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={new QueryClient()}>
        <Map />
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;
