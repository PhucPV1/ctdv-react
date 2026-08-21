import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./utils/aiGen', () => ({
  generateWithAIStream: async function* (_rawContent: string, _title: string) {
    yield 'A';
  },
}));

test('renders the app heading', () => {
  render(<App />);
  const heading = screen.getByText(/Tìm Chó Mèo Lạc Đà Nẵng/i);
  expect(heading).toBeInTheDocument();
});
