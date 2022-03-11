import React, { useEffect } from 'react';
import { BrowserRouter, useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from 'react-query'
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
